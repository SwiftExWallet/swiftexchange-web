import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { getCurrentNetwork } from '../../../../../service/apiConfig';
import {
  CCTP_SUPPORTED_EVM_CHAINS,
  type CctpBridgeDirection,
  type CctpBridgeQuote,
  type CctpBridgeTransfer,
  type CctpCreateBridgeRequest,
  type CctpEvmChainConfig,
  type CctpTransferStatus,
  createCctpBridge,
  formatBridgeError,
  generateCctpIdempotencyKey,
  getCctpBridgeQuote,
  getCctpBridgeTransfer,
  getCctpChainConfig,
  submitCctpApprovalTx,
  submitCctpDestinationTx,
  submitCctpSourceTx,
  validateEvmAddress,
  validateStellarAddress,
  validateUsdcAmount,
} from '../../../../../service/evmToStellarCctpService';
import { sendEVMTransaction } from '../../../../../utils/walletConnectUtils';
import {
  refreshStellarPreconditions,
  signAndSubmitTransaction,
} from '../../../../stellar/utils/transactionService';
import { getStellarConfig } from '../../../../walletconnect/config/chains';
import { parseRawChainId, switchOrAddChain } from '../../../utils/evmChainUtils';

async function waitForTxReceipt(
  provider: any,
  txHash: string,
  timeoutMs = 120_000,
  fallbackRpcUrl?: string
): Promise<any> {
  const start = Date.now();
  const rpcFallback = fallbackRpcUrl || 'https://ethereum-sepolia-rpc.publicnode.com';

  while (Date.now() - start < timeoutMs) {
    try {
      let receipt: any = null;
      if (typeof provider?.request === 'function') {
        try {
          receipt = await provider.request({
            method: 'eth_getTransactionReceipt',
            params: [txHash],
          });
        } catch {
          void 0;
        }
      }

      if (!receipt && rpcFallback) {
        try {
          const resp = await fetch(rpcFallback, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              method: 'eth_getTransactionReceipt',
              params: [txHash],
            }),
          });
          const json = await resp.json();
          receipt = json?.result;
        } catch {
          void 0;
        }
      }

      if (receipt) {
        const status = receipt.status;
        if (status === '0x0' || status === 0) {
          throw new Error('Transaction reverted on-chain.');
        }
        if (status === '0x1' || status === 1 || status === true) {
          return receipt;
        }
      }
    } catch (e: any) {
      if (e?.message?.includes('reverted')) throw e;
    }
    await new Promise(resolve => setTimeout(resolve, 2500));
  }
  throw new Error('Transaction confirmation timed out.');
}

export interface UseEvmToStellarCctpProps {
  evmAddress?: string;
  stellarAddress?: string;
  evmProvider?: any;
  stellarProvider?: any;
  chainId?: number;
  network?: 'mainnet' | 'testnet';
  initialDirection?: CctpBridgeDirection;
  initialEvmChainId?: number;
  initialFast?: boolean;
  signEvmTx?: (rawTx: any, evmAddress: string, chainId: number) => Promise<string>;
  signStellarTx?: (xdr: string) => Promise<string>;
  onSuccess?: (transfer: CctpBridgeTransfer) => void;
  onError?: (error: Error) => void;
}

export function useEvmToStellarCctp({
  evmAddress,
  stellarAddress,
  evmProvider,
  stellarProvider,
  chainId: propChainId,
  network: propNetwork,
  initialDirection = 'EVM_TO_STELLAR',
  initialEvmChainId,
  initialFast = true,
  signEvmTx,
  signStellarTx,
  onSuccess,
  onError,
}: UseEvmToStellarCctpProps) {
  const currentNetwork = propNetwork || getCurrentNetwork();

  const [direction, setDirection] = useState<CctpBridgeDirection>(initialDirection);
  const [selectedEvmChainId, setSelectedEvmChainId] = useState<number>(() => {
    if (initialEvmChainId) return initialEvmChainId;
    if (propChainId) {
      const match = CCTP_SUPPORTED_EVM_CHAINS.find(
        c => c[currentNetwork].chainId === Number(propChainId)
      );
      if (match) return match[currentNetwork].chainId;
    }
    return CCTP_SUPPORTED_EVM_CHAINS[0][currentNetwork].chainId;
  });

  const [amount, setAmount] = useState('');
  const [fastEnabled, setFastEnabled] = useState<boolean>(
    initialFast !== undefined ? initialFast : true
  );
  const [quote, setQuote] = useState<CctpBridgeQuote | null>(null);
  const [transfer, setTransfer] = useState<CctpBridgeTransfer | null>(null);
  const [loading, setLoading] = useState(false);
  const [isFetchingQuote, setIsFetchingQuote] = useState(false);
  const [isSigning, setIsSigning] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);

  const processingRef = useRef(false);
  const lastSigningRef = useRef<string | null>(null);
  const quoteAbortRef = useRef<AbortController | null>(null);
  const retrySignatureRef = useRef<(() => Promise<void>) | null>(null);

  const selectedEvmChain = useMemo<CctpEvmChainConfig>(() => {
    const matched = CCTP_SUPPORTED_EVM_CHAINS.find(
      c => c[currentNetwork].chainId === selectedEvmChainId
    );
    return matched || CCTP_SUPPORTED_EVM_CHAINS[0];
  }, [selectedEvmChainId, currentNetwork]);

  const isAvax = useMemo(() => {
    return (
      selectedEvmChain.id === 'avalanche' ||
      selectedEvmChain.symbol?.toUpperCase() === 'AVAX' ||
      Number(selectedEvmChain[currentNetwork]?.chainId) === 43114 ||
      Number(selectedEvmChain[currentNetwork]?.chainId) === 43113
    );
  }, [selectedEvmChain, currentNetwork]);

  const isStellarSource = direction === 'STELLAR_TO_EVM';

  // Avalanche and Stellar as source do NOT support Circle CCTP Fast Transfer (Stellar payment is already ~5-8s naturally)
  const effectiveFast = isAvax || isStellarSource ? false : fastEnabled;
  const isFastSupported = !isAvax && !isStellarSource;

  const chainConfig = useMemo(() => {
    return getCctpChainConfig(currentNetwork, selectedEvmChain[currentNetwork].chainId);
  }, [currentNetwork, selectedEvmChain]);

  const networkPassphrase = useMemo(() => {
    return currentNetwork === 'testnet'
      ? 'Test SDF Network ; September 2015'
      : 'Public Global Stellar Network ; September 2015';
  }, [currentNetwork]);

  const storageKey = useMemo(() => {
    return `swiftex_cctp_transfer_${currentNetwork}_${direction}_${evmAddress || 'anon'}`;
  }, [currentNetwork, direction, evmAddress]);

  const toggleDirection = useCallback(() => {
    setDirection(prev => {
      const next = prev === 'EVM_TO_STELLAR' ? 'STELLAR_TO_EVM' : 'EVM_TO_STELLAR';
      if (next === 'STELLAR_TO_EVM') {
        setSelectedEvmChainId(currentNetwork === 'testnet' ? 11155111 : 1);
      }
      return next;
    });
    setQuote(null);
    setAmount('');
    setError(null);
    setMessage('');
  }, [currentNetwork, setSelectedEvmChainId]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed: CctpBridgeTransfer = JSON.parse(saved);
        if (
          parsed?.id &&
          parsed.status !== 'COMPLETED' &&
          parsed.status !== 'FAILED' &&
          parsed.status !== 'CANCELLED'
        ) {
          setTransfer(parsed);
          const transferPromise = getCctpBridgeTransfer(parsed.id);
          if (transferPromise && typeof transferPromise.then === 'function') {
            transferPromise
              .then(fresh => {
                if (fresh) {
                  setTransfer(prev => ({
                    ...fresh,
                    sourceTxHash: fresh.sourceTxHash || prev?.sourceTxHash || parsed.sourceTxHash,
                    approvalTxHash:
                      fresh.approvalTxHash || prev?.approvalTxHash || parsed.approvalTxHash,
                    destinationTxHash:
                      fresh.destinationTxHash ||
                      prev?.destinationTxHash ||
                      parsed.destinationTxHash,
                  }));
                }
              })
              .catch(err => console.warn('[CCTP Bridge] Failed to resume transfer status:', err));
          }
        }
      }
    } catch (err) {
      console.warn('[CCTP Bridge] Error reading stored transfer:', err);
    }
  }, [storageKey]);

  useEffect(() => {
    if (!transfer?.id) {
      localStorage.removeItem(storageKey);
      return;
    }
    if (
      transfer.status === 'COMPLETED' ||
      transfer.status === 'FAILED' ||
      transfer.status === 'CANCELLED'
    ) {
      localStorage.removeItem(storageKey);
    } else {
      localStorage.setItem(storageKey, JSON.stringify(transfer));
    }
  }, [transfer, storageKey]);

  const sourceChainKey = useMemo(() => {
    if (direction === 'STELLAR_TO_EVM') {
      return currentNetwork === 'testnet' ? 'sepolia' : 'ethereum';
    }
    return selectedEvmChain[currentNetwork].sourceChainKey;
  }, [direction, selectedEvmChain, currentNetwork]);

  const getQuote = useCallback(
    async (overrideAmount?: string, isSilent = false) => {
      const quoteAmt = (overrideAmount !== undefined ? overrideAmount : amount).trim();

      if (!evmAddress) {
        if (!isSilent) setError('EVM wallet not connected.');
        return null;
      }

      if (!stellarAddress) {
        if (!isSilent) setError('Stellar wallet not connected.');
        return null;
      }

      const amtVal = validateUsdcAmount(quoteAmt);
      if (!amtVal.valid) {
        setQuote(null);
        if (!isSilent && quoteAmt) setError(amtVal.error || 'Enter valid USDC amount.');
        return null;
      }

      const evmVal = validateEvmAddress(evmAddress);
      if (!evmVal.valid) {
        if (!isSilent) setError(evmVal.error || 'Invalid EVM address.');
        return null;
      }

      const stellarVal = validateStellarAddress(stellarAddress);
      if (!stellarVal.valid) {
        if (!isSilent) setError(stellarVal.error || 'Invalid Stellar address.');
        return null;
      }

      quoteAbortRef.current?.abort();
      quoteAbortRef.current = new AbortController();

      try {
        setIsFetchingQuote(true);
        setError(null);
        if (!isSilent) setMessage('Getting CCTP quote...');

        const isStellarSource = direction === 'STELLAR_TO_EVM';
        const targetChain = isStellarSource
          ? currentNetwork === 'testnet'
            ? 'sepolia'
            : 'ethereum'
          : sourceChainKey;
        const result = await getCctpBridgeQuote(
          {
            direction,
            evmAddress: evmVal.normalized || evmAddress,
            stellarAddress,
            amount: quoteAmt,
            sourceChain: targetChain,
            fast: effectiveFast,
          },
          quoteAbortRef.current.signal
        );

        setQuote(result);
        if (!isSilent) setMessage('Quote ready.');
        return result;
      } catch (err: any) {
        if (err?.name === 'AbortError') return null;
        const formatted = formatBridgeError(err);
        const errMsg = formatted.error.message;
        setError(errMsg);
        setMessage('');
        onError?.(err instanceof Error ? err : new Error(errMsg));
        return null;
      } finally {
        setIsFetchingQuote(false);
      }
    },
    [
      amount,
      direction,
      evmAddress,
      stellarAddress,
      sourceChainKey,
      currentNetwork,
      effectiveFast,
      onError,
    ]
  );

  // Debounced auto-fetch quote whenever amount, chain, or direction changes
  useEffect(() => {
    if (transfer) return;
    const cleanAmount = amount.trim();
    if (!cleanAmount || isNaN(Number(cleanAmount)) || Number(cleanAmount) <= 0) {
      setQuote(null);
      setError(null);
      return;
    }
    if (!evmAddress || !stellarAddress) {
      return;
    }

    const timer = setTimeout(() => {
      getQuote(cleanAmount, true);
    }, 450);

    return () => clearTimeout(timer);
  }, [amount, direction, selectedEvmChainId, evmAddress, stellarAddress, transfer, getQuote]);

  const startBridge = useCallback(async () => {
    if (!quote) {
      const err = 'Get a quote first.';
      setError(err);
      return null;
    }

    const amtVal = validateUsdcAmount(amount);
    if (!amtVal.valid) {
      setError(amtVal.error || 'Enter valid USDC amount.');
      return null;
    }

    if (!evmAddress) {
      setError('EVM wallet not connected.');
      return null;
    }

    if (!stellarAddress) {
      setError('Stellar wallet not connected.');
      return null;
    }

    const currentEvmAddress = evmAddress;
    const currentStellarAddress = stellarAddress;

    const evmVal = validateEvmAddress(currentEvmAddress);
    if (!evmVal.valid) {
      setError(evmVal.error || 'Invalid EVM address.');
      return null;
    }

    const stellarVal = validateStellarAddress(currentStellarAddress);
    if (!stellarVal.valid) {
      setError(stellarVal.error || 'Invalid Stellar address.');
      return null;
    }

    const isStellarSource = direction === 'STELLAR_TO_EVM';

    if (
      isStellarSource &&
      transfer?.id &&
      transfer?.approvalTxHash &&
      !transfer?.sourceTxHash &&
      (transfer.status === 'BURN_SIGNATURE_REQUIRED' ||
        transfer.status === 'APPROVAL_PENDING' ||
        transfer.status === 'BRIDGE_SIGNATURE_REQUIRED')
    ) {
      console.log('[CCTP Bridge] Resuming existing transfer at burn stage:', transfer.id);
      if (retrySignatureRef.current) {
        await retrySignatureRef.current();
      }
      return transfer;
    }

    try {
      setLoading(true);
      setError(null);
      setMessage('Creating bridge transfer...');

      const targetChain = isStellarSource
        ? currentNetwork === 'testnet'
          ? 'sepolia'
          : 'ethereum'
        : sourceChainKey;

      const result = await createCctpBridge({
        direction,
        evmAddress: evmVal.normalized || currentEvmAddress,
        stellarAddress: currentStellarAddress,
        amount: amount.trim(),
        sourceChain: targetChain,
        fast: effectiveFast,
        ...(isStellarSource ? { idempotencyKey: generateCctpIdempotencyKey() } : {}),
      });

      setTransfer(result);
      setMessage('Transfer created.');
      return result;
    } catch (err: any) {
      const formatted = formatBridgeError(err);
      const errMsg = formatted.error.message;
      setError(errMsg);
      setMessage('');
      onError?.(err instanceof Error ? err : new Error(errMsg));
      return null;
    } finally {
      setLoading(false);
    }
  }, [
    quote,
    direction,
    amount,
    evmAddress,
    stellarAddress,
    sourceChainKey,
    currentNetwork,
    effectiveFast,
    transfer,
    onError,
  ]);

  const signEvm = useCallback(
    async (currentTransfer: CctpBridgeTransfer) => {
      const signingRequest = currentTransfer?.signingRequest;
      if (signingRequest?.type !== 'EVM') return;

      if (!signingRequest.rawTx) {
        throw new Error('Backend did not return rawTx.');
      }

      const rawTx = signingRequest.rawTx;
      let signedTxHex = '';
      const rawChainId = rawTx?.chainId;
      const parsedChainId =
        rawChainId !== undefined && rawChainId !== null
          ? typeof rawChainId === 'string' && rawChainId.startsWith('0x')
            ? Number(BigInt(rawChainId))
            : Number(rawChainId)
          : undefined;
      const targetChainId = parsedChainId || chainConfig.chainId;
      const effectiveChainConfig = parsedChainId
        ? getCctpChainConfig(currentNetwork, parsedChainId)
        : chainConfig;

      if (signEvmTx) {
        signedTxHex = await signEvmTx(rawTx, evmAddress || '', targetChainId);
      } else if (typeof (window as any)?.TransactionSigner?.signTransaction === 'function') {
        const rawTxStr = typeof rawTx === 'string' ? rawTx : JSON.stringify(rawTx);
        const res = await (window as any).TransactionSigner.signTransaction(
          effectiveChainConfig.nativeChainKey,
          evmAddress,
          rawTxStr,
          targetChainId
        );
        if (!res?.success || typeof res?.signedTx !== 'string') {
          throw new Error('Native signer returned invalid signedTx');
        }
        signedTxHex = res.signedTx;
      } else if (evmProvider) {
        const parsedTx = typeof rawTx === 'string' ? JSON.parse(rawTx) : { ...rawTx };

        try {
          if (typeof evmProvider.request === 'function') {
            const rawChainId = await evmProvider.request({ method: 'eth_chainId' });
            const activeChain = parseRawChainId(rawChainId);
            if (activeChain !== Number(targetChainId)) {
              await switchOrAddChain(evmProvider, targetChainId);
            }
          }
        } catch (switchErr) {
          console.warn('[CCTP Bridge] Chain switch check warning:', switchErr);
        }

        const toHex = (val: any) => {
          if (val === undefined || val === null) return undefined;
          if (typeof val === 'string') {
            return val.startsWith('0x') ? val : '0x' + BigInt(val).toString(16);
          }
          if (typeof val === 'number' || typeof val === 'bigint') {
            return '0x' + val.toString(16);
          }
          return val;
        };

        const txParams: Record<string, any> = {
          from: evmAddress,
          to: parsedTx.to,
          data: parsedTx.data || '0x',
          value: toHex(parsedTx.value) || '0x0',
        };

        if (parsedTx.nonce !== undefined && parsedTx.nonce !== null) {
          txParams.nonce = toHex(parsedTx.nonce);
        }

        if (parsedTx.gasLimit || parsedTx.gas) {
          const gasVal = toHex(parsedTx.gasLimit || parsedTx.gas);
          txParams.gas = gasVal;
          txParams.gasLimit = gasVal;
        }

        if (parsedTx.gasPrice) {
          txParams.gasPrice = toHex(parsedTx.gasPrice);
        }

        if (parsedTx.maxFeePerGas) {
          txParams.maxFeePerGas = toHex(parsedTx.maxFeePerGas);
        }

        if (parsedTx.maxPriorityFeePerGas) {
          txParams.maxPriorityFeePerGas = toHex(parsedTx.maxPriorityFeePerGas);
        }

        if (parsedTx.chainId !== undefined && parsedTx.chainId !== null) {
          txParams.chainId = toHex(parsedTx.chainId);
        } else if (targetChainId) {
          txParams.chainId = toHex(targetChainId);
        }

        if (parsedTx.type !== undefined && parsedTx.type !== null) {
          txParams.type = toHex(parsedTx.type);
        }

        signedTxHex = await sendEVMTransaction(evmProvider, targetChainId, txParams);
      } else {
        throw new Error('No EVM wallet or provider available');
      }

      if (!signedTxHex) {
        throw new Error('Wallet did not return a transaction hash');
      }

      const normalizedTxHash = '0x' + signedTxHex.replace(/^(0x)+/i, '');
      const isApproval = signingRequest?.purpose === 'APPROVAL';
      const isMint =
        signingRequest?.purpose === 'MINT' ||
        (currentTransfer.direction === 'STELLAR_TO_EVM' &&
          signingRequest?.purpose !== 'APPROVAL' &&
          signingRequest?.purpose !== 'BRIDGE');

      if (isApproval) {
        const updatedApproval: CctpBridgeTransfer = {
          ...currentTransfer,
          status: 'APPROVAL_PENDING',
          approvalTxHash: normalizedTxHash,
          signingRequest: null,
        };
        setTransfer(updatedApproval);
        setMessage('USDC approval submitted. Waiting for on-chain confirmation...');

        await waitForTxReceipt(evmProvider, normalizedTxHash, 120_000, chainConfig.rpcUrl);

        setMessage('USDC approved! Generating CCTP deposit transaction...');

        const bridgePayload: CctpCreateBridgeRequest = {
          direction: (currentTransfer.direction as CctpBridgeDirection) || 'EVM_TO_STELLAR',
          evmAddress: currentTransfer.evmAddress || evmAddress || '',
          stellarAddress: currentTransfer.stellarAddress || stellarAddress || '',
          amount: amount.trim() || currentTransfer.amount || '',
          sourceChain: sourceChainKey,
          fast: effectiveFast,
        };

        let nextTransfer = await createCctpBridge(bridgePayload);

        let retries = 0;
        while (nextTransfer.status === 'APPROVAL_SIGNATURE_REQUIRED' && retries < 5) {
          retries++;
          await new Promise(r => setTimeout(r, 2500));
          nextTransfer = await createCctpBridge(bridgePayload);
        }

        const finalTransfer: CctpBridgeTransfer = {
          ...nextTransfer,
          approvalTxHash: normalizedTxHash,
        };

        setTransfer(finalTransfer);

        if (
          finalTransfer.signingRequest?.type === 'EVM' &&
          finalTransfer.signingRequest?.purpose === 'BRIDGE'
        ) {
          setMessage('USDC approved! Confirm CCTP deposit in EVM wallet...');
          return await signEvm(finalTransfer);
        }

        return finalTransfer;
      } else if (isMint) {
        setMessage(`USDC minted on ${effectiveChainConfig.name || 'EVM'}! Finalizing transfer...`);

        let destResult: CctpBridgeTransfer | null = null;
        try {
          destResult = await submitCctpDestinationTx(currentTransfer.id, normalizedTxHash);
        } catch (destErr) {
          console.warn('[CCTP Bridge] submitCctpDestinationTx warning:', destErr);
        }

        const finalEvmMint: CctpBridgeTransfer = {
          ...currentTransfer,
          ...(destResult ?? {}),
          status: (destResult?.status as any) || 'COMPLETED',
          destinationTxHash: normalizedTxHash,
          signingRequest: null,
        };
        setTransfer(finalEvmMint);
        setMessage(
          `Bridge completed successfully! USDC minted to ${effectiveChainConfig.name || 'EVM'}.`
        );
        onSuccess?.(finalEvmMint);
        return finalEvmMint;
      } else {
        // Direct broadcast completed by wallet -> Notify backend via /bridge/{id}/source-tx
        setMessage('Deposit broadcasted! Notifying bridge relayer...');

        let updated: CctpBridgeTransfer;
        try {
          updated = await submitCctpSourceTx(currentTransfer.id, normalizedTxHash);
        } catch (sourceTxErr) {
          console.warn('[CCTP Bridge] submitCctpSourceTx warning:', sourceTxErr);
          updated = {
            ...currentTransfer,
            status: 'SOURCE_PENDING',
            sourceTxHash: normalizedTxHash,
            signingRequest: null,
          };
        }

        const finalDeposit: CctpBridgeTransfer = {
          ...updated,
          status: 'SOURCE_PENDING',
          sourceTxHash: normalizedTxHash,
          approvalTxHash: currentTransfer.approvalTxHash,
          signingRequest: null,
        };
        setTransfer(finalDeposit);
        setMessage('Deposit submitted! Waiting for confirmation & Circle Iris attestation...');
        return finalDeposit;
      }
    },
    [
      evmAddress,
      stellarAddress,
      direction,
      amount,
      sourceChainKey,
      chainConfig,
      evmProvider,
      signEvmTx,
    ]
  );

  const signStellar = useCallback(
    async (currentTransfer: CctpBridgeTransfer) => {
      const signingRequest = currentTransfer?.signingRequest;
      const rawXdr = signingRequest?.xdr || currentTransfer?.stellarUnsignedXdr;
      if (!rawXdr) {
        throw new Error('Backend did not return Stellar XDR.');
      }

      const xdr = refreshStellarPreconditions(rawXdr, networkPassphrase);

      const isApproval =
        signingRequest?.purpose === 'APPROVAL' ||
        currentTransfer.status === 'APPROVAL_SIGNATURE_REQUIRED';

      const isMint =
        !isApproval &&
        currentTransfer.direction === 'EVM_TO_STELLAR' &&
        (signingRequest?.purpose === 'MINT' ||
          currentTransfer.status === 'STELLAR_SIGNATURE_REQUIRED' ||
          currentTransfer.status === 'DESTINATION_PENDING');

      setMessage(
        isApproval
          ? 'Confirm USDC allowance approval in Stellar wallet...'
          : isMint
            ? 'Confirm & broadcast USDC mint in Stellar wallet...'
            : 'Confirm & broadcast USDC burn in Stellar wallet...'
      );

      if (isApproval) {
        let approvalTxHash = '';
        if (signStellarTx) {
          const signedRes = await signStellarTx(xdr);
          if (signedRes.length === 64 && /^[0-9a-fA-F]+$/.test(signedRes)) {
            approvalTxHash = signedRes;
          } else {
            const { submitToHorizon } =
              await import('../../../../stellar/utils/transactionService');
            const config = getStellarConfig(currentNetwork);
            approvalTxHash = await submitToHorizon(signedRes, config.horizonUrl);
          }
        } else {
          const submitRes = await signAndSubmitTransaction({
            xdr,
            network: currentNetwork,
            networkPassphrase,
            provider: stellarProvider,
            stellarAddress,
          });
          console.log('[CCTP Bridge] Approval submitRes:', submitRes);
          if (!submitRes || !submitRes.success || !submitRes.hash) {
            throw new Error(submitRes?.error || 'Stellar approval failed');
          }
          approvalTxHash = submitRes.hash;
        }

        const updatedApproval: CctpBridgeTransfer = {
          ...currentTransfer,
          status: 'APPROVAL_PENDING',
          approvalTxHash,
          signingRequest: null,
        };
        setTransfer(updatedApproval);
        setMessage('Stellar USDC approval broadcasted. Notifying backend...');

        try {
          const res = await submitCctpApprovalTx(currentTransfer.id, approvalTxHash);
          if (res) {
            setTransfer(prev => ({
              ...(prev ?? res),
              ...res,
              approvalTxHash,
              status:
                res.status === 'APPROVAL_SIGNATURE_REQUIRED' ? 'APPROVAL_PENDING' : res.status,
            }));
          }
        } catch (err) {
          console.warn('[CCTP Bridge] submitCctpApprovalTx warning:', err);
        }

        setMessage('USDC approved! Waiting for CCTP burn transaction from backend...');

        let burnTransfer: CctpBridgeTransfer | null = null;
        for (let i = 0; i < 20; i++) {
          await new Promise(r => setTimeout(r, 3000));
          try {
            const polled = await getCctpBridgeTransfer(currentTransfer.id);
            if (
              polled &&
              (polled.status === 'BURN_SIGNATURE_REQUIRED' ||
                polled.status === 'BRIDGE_SIGNATURE_REQUIRED') &&
              (polled.signingRequest?.xdr || polled.stellarUnsignedXdr)
            ) {
              const burnXdr = polled.signingRequest?.xdr || polled.stellarUnsignedXdr!;
              burnTransfer = {
                ...polled,
                approvalTxHash,
                signingRequest: { type: 'STELLAR', purpose: 'BURN', xdr: burnXdr },
              };
              break;
            }
          } catch (e) {
            console.warn('[CCTP Bridge] Polling for burn error:', e);
          }
        }

        if (burnTransfer) {
          setTransfer(burnTransfer);
          setMessage('USDC approved! Click to sign CCTP burn in Stellar wallet.');
          processingRef.current = false;
          setIsSigning(false);
          lastSigningRef.current = null;
          return burnTransfer;
        }

        return updatedApproval;
      }

      let stellarTxHash = '';

      if (signStellarTx) {
        const signedRes = await signStellarTx(xdr);
        if (signedRes.length === 64 && /^[0-9a-fA-F]+$/.test(signedRes)) {
          stellarTxHash = signedRes;
        } else {
          const { submitToHorizon } = await import('../../../../stellar/utils/transactionService');
          const config = getStellarConfig(currentNetwork);
          stellarTxHash = await submitToHorizon(signedRes, config.horizonUrl);
        }
      } else {
        const submitRes = await signAndSubmitTransaction({
          xdr,
          network: currentNetwork,
          networkPassphrase,
          provider: stellarProvider,
          stellarAddress,
        });
        console.log('[CCTP Bridge] Burn submitRes:', submitRes);

        if (!submitRes || !submitRes.success || !submitRes.hash) {
          throw new Error(submitRes?.error || 'Stellar transaction failed or was cancelled');
        }
        stellarTxHash = submitRes.hash;
      }

      if (!stellarTxHash) {
        throw new Error('Stellar network did not return transaction hash.');
      }

      if (isMint) {
        setMessage('USDC minted on Stellar! Finalizing transfer...');

        try {
          await submitCctpDestinationTx(currentTransfer.id, stellarTxHash);
        } catch {
          void 0;
        }

        const finalStellarMint: CctpBridgeTransfer = {
          ...currentTransfer,
          status: 'COMPLETED',
          destinationTxHash: stellarTxHash,
          signingRequest: null,
        };
        setTransfer(finalStellarMint);
        setMessage('Bridge completed successfully! USDC minted to Stellar.');
        onSuccess?.(finalStellarMint);
        return finalStellarMint;
      } else {
        setMessage('Stellar burn broadcasted! Notifying bridge relayer...');
        let updated: CctpBridgeTransfer;
        try {
          updated = await submitCctpSourceTx(currentTransfer.id, stellarTxHash);
        } catch (sourceTxErr) {
          console.warn('[CCTP Bridge] submitCctpSourceTx warning:', sourceTxErr);
          updated = {
            ...currentTransfer,
            status: 'SOURCE_PENDING',
            sourceTxHash: stellarTxHash,
            signingRequest: null,
          };
        }

        const finalStellarDeposit: CctpBridgeTransfer = {
          ...updated,
          status: 'SOURCE_PENDING',
          sourceTxHash: stellarTxHash,
          signingRequest: null,
        };
        setTransfer(finalStellarDeposit);
        setMessage('Stellar burn broadcasted! Relayer tracking transfer...');
        return finalStellarDeposit;
      }
    },
    [currentNetwork, networkPassphrase, stellarProvider, stellarAddress, signStellarTx, onSuccess]
  );

  const processSigningRequest = useCallback(
    async (currentTransfer: CctpBridgeTransfer) => {
      const request = currentTransfer?.signingRequest;
      const isStellarMintWithoutRequest =
        !request &&
        currentTransfer?.status === 'STELLAR_SIGNATURE_REQUIRED' &&
        Boolean(currentTransfer?.stellarUnsignedXdr);

      if (!request && !isStellarMintWithoutRequest) return;
      if (processingRef.current) return;

      const effectiveType = request?.type || (isStellarMintWithoutRequest ? 'STELLAR' : '');
      const effectivePurpose = request?.purpose || (isStellarMintWithoutRequest ? 'MINT' : '');

      if (effectiveType === 'EVM') {
        if (effectivePurpose === 'APPROVAL' && currentTransfer.approvalTxHash) return;
        const isMint =
          effectivePurpose === 'MINT' ||
          (currentTransfer.direction === 'STELLAR_TO_EVM' &&
            (currentTransfer.status === 'MINT_SIGNATURE_REQUIRED' ||
              currentTransfer.status === 'DESTINATION_PENDING'));
        if (isMint && currentTransfer.destinationTxHash) return;
        if (!isMint && effectivePurpose !== 'APPROVAL' && currentTransfer.sourceTxHash) return;
      }
      if (effectiveType === 'STELLAR') {
        if (effectivePurpose === 'APPROVAL' && currentTransfer.approvalTxHash) return;
        const isMint =
          effectivePurpose === 'MINT' ||
          (effectivePurpose !== 'BRIDGE' &&
            effectivePurpose !== 'APPROVAL' &&
            (currentTransfer.direction === 'EVM_TO_STELLAR' ||
              (currentTransfer.status === 'STELLAR_SIGNATURE_REQUIRED' &&
                currentTransfer.direction !== 'STELLAR_TO_EVM')));
        if (isMint && currentTransfer.destinationTxHash) return;
        if (!isMint && effectivePurpose !== 'APPROVAL' && currentTransfer.sourceTxHash) return;
      }

      const signingKey = `${currentTransfer.id}:${currentTransfer.status}:${effectiveType}:${effectivePurpose || ''}`;
      if (lastSigningRef.current === signingKey) return;
      lastSigningRef.current = signingKey;
      processingRef.current = true;
      setIsSigning(true);
      setError(null);

      try {
        if (effectiveType === 'EVM') {
          if (effectivePurpose === 'APPROVAL') {
            setMessage('Approve USDC in EVM wallet...');
          } else if (
            effectivePurpose === 'MINT' ||
            currentTransfer.status === 'MINT_SIGNATURE_REQUIRED' ||
            currentTransfer.direction === 'STELLAR_TO_EVM'
          ) {
            setMessage(`Confirm & mint USDC in ${selectedEvmChain.name} wallet...`);
          } else {
            setMessage('Confirm CCTP bridge deposit in EVM wallet...');
          }
          await signEvm(currentTransfer);
          return;
        }

        if (effectiveType === 'STELLAR') {
          if (effectivePurpose === 'APPROVAL') {
            setMessage('Approve USDC in Stellar wallet...');
          } else {
            const isMint =
              effectivePurpose === 'MINT' ||
              (effectivePurpose !== 'BRIDGE' &&
                (currentTransfer.direction === 'EVM_TO_STELLAR' ||
                  (currentTransfer.status === 'STELLAR_SIGNATURE_REQUIRED' &&
                    currentTransfer.direction !== 'STELLAR_TO_EVM')));
            if (isMint) {
              setMessage('Confirm & mint USDC in Stellar wallet...');
            } else {
              setMessage('Confirm CCTP bridge burn in Stellar wallet...');
            }
          }
          await signStellar(currentTransfer);
        }
      } catch (err: any) {
        lastSigningRef.current = null;
        const formatted = formatBridgeError(err);
        const errMsg = formatted.error.message;
        setError(errMsg);

        const isUserRejection = formatted.error.code === 'USER_REJECTED';
        if (isUserRejection) {
          setMessage('Transaction rejected by user.');
          setTransfer(prev =>
            prev ? { ...prev, status: 'CANCELLED', signingRequest: null, error: errMsg } : null
          );
        } else {
          setMessage('Signature required.');
        }
        onError?.(err instanceof Error ? err : new Error(errMsg));
      } finally {
        processingRef.current = false;
        setIsSigning(false);
      }
    },
    [signEvm, signStellar, onError]
  );

  useEffect(() => {
    if (!transfer) return;
    if (
      transfer.status === 'CANCELLED' ||
      transfer.status === 'FAILED' ||
      transfer.status === 'COMPLETED'
    ) {
      return;
    }
    if (transfer.signingRequest) {
      processSigningRequest(transfer);
      return;
    }
    if (
      transfer.direction === 'STELLAR_TO_EVM' &&
      transfer.stellarUnsignedXdr &&
      !transfer.sourceTxHash &&
      transfer.status !== 'APPROVAL_PENDING'
    ) {
      processSigningRequest({
        ...transfer,
        signingRequest: {
          type: 'STELLAR',
          purpose: transfer.status === 'APPROVAL_SIGNATURE_REQUIRED' ? 'APPROVAL' : 'BRIDGE',
          xdr: transfer.stellarUnsignedXdr,
        },
      });
      return;
    }
    if (
      transfer.status === 'STELLAR_SIGNATURE_REQUIRED' &&
      transfer.stellarUnsignedXdr &&
      !transfer.destinationTxHash
    ) {
      processSigningRequest({
        ...transfer,
        signingRequest: {
          type: 'STELLAR',
          purpose: 'MINT',
          xdr: transfer.stellarUnsignedXdr,
        },
      });
    }
  }, [transfer, processSigningRequest]);

  useEffect(() => {
    if (!transfer?.id) return;

    const pollStatuses = [
      'APPROVAL_PENDING',
      'SOURCE_PENDING',
      'ATTESTATION_PENDING',
      'DESTINATION_PENDING',
    ];
    const isBridgeSignatureAfterSource =
      (transfer.status === 'BRIDGE_SIGNATURE_REQUIRED' ||
        transfer.status === 'BURN_SIGNATURE_REQUIRED') &&
      Boolean(transfer.sourceTxHash);
    const isMintSignatureAfterDest =
      (transfer.status === 'MINT_SIGNATURE_REQUIRED' ||
        transfer.status === 'STELLAR_SIGNATURE_REQUIRED') &&
      Boolean(transfer.destinationTxHash);
    const shouldPoll =
      pollStatuses.includes(transfer.status) ||
      isBridgeSignatureAfterSource ||
      isMintSignatureAfterDest;

    if (!shouldPoll) return;

    const pollInterval = transfer.status === 'APPROVAL_PENDING' ? 3000 : 5000;

    const timer = setInterval(async () => {
      try {
        const result = await getCctpBridgeTransfer(transfer.id);
        if (!result) return;
        setTransfer(prev => {
          if (!prev) return result;

          const isBurnResult =
            result.status === 'BRIDGE_SIGNATURE_REQUIRED' ||
            result.status === 'BURN_SIGNATURE_REQUIRED';
          const isMintResult =
            result.status === 'MINT_SIGNATURE_REQUIRED' ||
            result.status === 'STELLAR_SIGNATURE_REQUIRED';

          const effectiveStatus =
            prev.destinationTxHash && isMintResult
              ? 'DESTINATION_PENDING'
              : prev.sourceTxHash && isBurnResult
                ? 'SOURCE_PENDING'
                : prev.approvalTxHash && result.status === 'APPROVAL_SIGNATURE_REQUIRED'
                  ? 'APPROVAL_PENDING'
                  : result.status;

          const burnXdr = result.signingRequest?.xdr || result.stellarUnsignedXdr;
          const burnSigningRequest =
            isBurnResult && !prev.sourceTxHash && burnXdr
              ? { type: 'STELLAR' as const, purpose: 'BURN' as const, xdr: burnXdr }
              : result.signingRequest || prev.signingRequest;

          return {
            ...result,
            status: effectiveStatus,
            sourceTxHash: result.sourceTxHash || prev.sourceTxHash,
            approvalTxHash: result.approvalTxHash || prev.approvalTxHash,
            destinationTxHash: result.destinationTxHash || prev.destinationTxHash,
            attestation: result.attestation || prev.attestation,
            message: result.message || prev.message,
            signingRequest: burnSigningRequest,
          };
        });
        if (result.status === 'COMPLETED') {
          onSuccess?.(result);
        }
      } catch (pollErr) {
        console.error('[CCTP Bridge] Status polling error:', pollErr);
      }
    }, pollInterval);

    return () => clearInterval(timer);
  }, [
    transfer?.id,
    transfer?.status,
    transfer?.sourceTxHash,
    transfer?.approvalTxHash,
    transfer?.destinationTxHash,
    onSuccess,
  ]);

  // ── Parallel Circle Iris Protocol Polling ────────────────────────────────
  useEffect(() => {
    const txHash = transfer?.sourceTxHash;
    if (!txHash) return;

    if (
      transfer?.attestation ||
      transfer?.status === 'STELLAR_SIGNATURE_REQUIRED' ||
      transfer?.status === 'DESTINATION_PENDING' ||
      transfer?.status === 'COMPLETED'
    ) {
      return;
    }

    let isSubscribed = true;
    const irisBase =
      currentNetwork === 'testnet'
        ? 'https://iris-api-sandbox.circle.com'
        : 'https://iris-api.circle.com';
    const irisUrl = `${irisBase}/v2/messages/0?transactionHash=${txHash}`;

    const checkIris = async () => {
      try {
        const res = await fetch(irisUrl);
        if (!res.ok) return;
        const data = await res.json();
        const msg = data?.messages?.[0];
        if (msg && isSubscribed) {
          if (msg.status === 'complete' && msg.attestation) {
            setTransfer(prev => {
              if (!prev) return prev;
              return {
                ...prev,
                status:
                  prev.status === 'SOURCE_PENDING' || prev.status === 'BRIDGE_SIGNATURE_REQUIRED'
                    ? 'ATTESTATION_PENDING'
                    : prev.status,
                attestation: msg.attestation,
                message: msg.message || prev.message,
              };
            });
          }
        }
      } catch {
        void 0;
      }
    };

    checkIris();
    const interval = setInterval(checkIris, 5000);
    return () => {
      isSubscribed = false;
      clearInterval(interval);
    };
  }, [transfer?.sourceTxHash, transfer?.attestation, transfer?.status, currentNetwork]);

  useEffect(() => {
    if (!transfer?.status) return;

    switch (transfer.status) {
      case 'APPROVAL_SIGNATURE_REQUIRED':
        if (transfer.approvalTxHash) {
          setMessage('Approval confirmed! Action required: Sign & broadcast USDC burn on Stellar.');
        } else {
          setMessage(
            direction === 'EVM_TO_STELLAR'
              ? 'Action required: Approve USDC spending in EVM wallet.'
              : 'Action required: Approve USDC spending in Stellar wallet.'
          );
        }
        break;
      case 'APPROVAL_PENDING':
        setMessage(
          direction === 'EVM_TO_STELLAR'
            ? 'USDC approval submitted. Waiting for on-chain confirmation...'
            : 'Stellar USDC approval submitted. Waiting for ledger confirmation...'
        );
        break;
      case 'BURN_SIGNATURE_REQUIRED':
        if (transfer.sourceTxHash) {
          setMessage(
            'Stellar burn broadcasted! Waiting for block finality & Circle attestation...'
          );
        } else {
          setMessage('Action required: Confirm CCTP burn in Stellar wallet.');
        }
        break;
      case 'BRIDGE_SIGNATURE_REQUIRED':
        if (transfer.sourceTxHash) {
          setMessage(
            transfer.attestation
              ? 'Circle Iris attestation ready! Waiting for destination mint...'
              : 'Deposit broadcasted! Waiting for confirmation & Circle attestation...'
          );
        } else {
          setMessage(
            direction === 'EVM_TO_STELLAR'
              ? 'Action required: Confirm CCTP bridge deposit in EVM wallet.'
              : 'Action required: Confirm CCTP bridge burn in Stellar wallet.'
          );
        }
        break;
      case 'SOURCE_PENDING':
        setMessage(
          transfer.attestation
            ? 'Circle Iris attestation ready! Processing destination mint...'
            : 'Source transaction broadcasted! Waiting for block finality & Circle attestation...'
        );
        break;
      case 'ATTESTATION_PENDING':
        setMessage(
          transfer.attestation
            ? 'Circle Iris attestation ready! Relayer minting USDC on destination...'
            : 'Waiting for Circle Iris protocol attestation...'
        );
        break;
      case 'STELLAR_SIGNATURE_REQUIRED':
        setMessage('Attestation ready! Please sign with Stellar wallet to mint USDC.');
        break;
      case 'MINT_SIGNATURE_REQUIRED':
        setMessage(
          direction === 'STELLAR_TO_EVM'
            ? `Circle Iris attestation ready! Please sign with ${selectedEvmChain.name} wallet to mint USDC.`
            : 'Circle Iris attestation ready! Please sign with Stellar wallet to mint USDC.'
        );
        break;
      case 'DESTINATION_PENDING':
        setMessage('Destination mint submitted. Waiting for ledger finality...');
        break;
      case 'COMPLETED':
        setMessage(
          direction === 'EVM_TO_STELLAR'
            ? 'Bridge completed successfully! USDC minted to Stellar.'
            : `Bridge completed successfully! USDC minted to ${selectedEvmChain.name}.`
        );
        break;
      case 'CANCELLED':
        setMessage(
          transfer.error && transfer.error.toLowerCase().includes('reject')
            ? 'Transaction rejected by user.'
            : transfer.error || 'Transaction rejected by user.'
        );
        setError(transfer.error || 'Transaction rejected by user.');
        break;
      case 'FAILED':
        setMessage(transfer.error || 'Bridge failed.');
        setError(transfer.error || 'Bridge failed.');
        break;
      default:
        break;
    }
  }, [transfer?.status, transfer?.error, direction, selectedEvmChain.name]);

  const retrySignature = useCallback(async () => {
    if (!transfer) return;

    processingRef.current = false;
    lastSigningRef.current = null;

    const hasBurnXdr =
      (transfer.signingRequest?.purpose === 'BURN' && Boolean(transfer.signingRequest?.xdr)) ||
      (Boolean(transfer.stellarUnsignedXdr) &&
        (transfer.status === 'BURN_SIGNATURE_REQUIRED' ||
          transfer.status === 'BRIDGE_SIGNATURE_REQUIRED'));

    if (
      transfer.direction === 'STELLAR_TO_EVM' &&
      transfer.approvalTxHash &&
      !transfer.sourceTxHash &&
      hasBurnXdr
    ) {
      setLoading(true);
      setIsSigning(true);
      setError(null);
      setMessage('Confirm CCTP bridge burn in Stellar wallet...');
      const burnXdr = transfer.signingRequest?.xdr || transfer.stellarUnsignedXdr!;
      const readyTransfer: CctpBridgeTransfer = {
        ...transfer,
        status: 'BURN_SIGNATURE_REQUIRED',
        signingRequest: { type: 'STELLAR', purpose: 'BURN', xdr: burnXdr },
      };
      setTransfer(readyTransfer);
      try {
        await signStellar(readyTransfer);
      } catch (err: any) {
        const formatted = formatBridgeError(err);
        setError(formatted.error.message);
      } finally {
        processingRef.current = false;
        setIsSigning(false);
        setLoading(false);
      }
      return;
    }

    if (
      transfer.direction === 'STELLAR_TO_EVM' &&
      transfer.approvalTxHash &&
      !transfer.sourceTxHash &&
      (transfer.status === 'APPROVAL_PENDING' ||
        transfer.status === 'APPROVAL_SIGNATURE_REQUIRED' ||
        transfer.status === 'BURN_SIGNATURE_REQUIRED')
    ) {
      setLoading(true);
      setMessage('Checking for burn transaction from backend...');
      try {
        const latest = await getCctpBridgeTransfer(transfer.id);
        if (
          latest &&
          (latest.status === 'BURN_SIGNATURE_REQUIRED' ||
            latest.status === 'BRIDGE_SIGNATURE_REQUIRED') &&
          (latest.signingRequest?.xdr || latest.stellarUnsignedXdr)
        ) {
          const burnXdr = latest.signingRequest?.xdr || latest.stellarUnsignedXdr!;
          const readyTransfer: CctpBridgeTransfer = {
            ...(transfer ?? latest),
            ...latest,
            status: 'BURN_SIGNATURE_REQUIRED',
            approvalTxHash: transfer.approvalTxHash || latest.approvalTxHash,
            signingRequest: { type: 'STELLAR', purpose: 'BURN', xdr: burnXdr },
          };
          setTransfer(readyTransfer);
          setMessage('Burn transaction ready. Please sign in Stellar wallet...');
          setIsSigning(true);
          await signStellar(readyTransfer);
        } else {
          setTransfer(prev => ({
            ...(prev ?? latest),
            ...latest,
            approvalTxHash: prev?.approvalTxHash || latest.approvalTxHash,
          }));
          setMessage('Waiting for burn transaction from backend...');
        }
      } catch (err: any) {
        setError(err?.message || 'Failed to check bridge status');
      } finally {
        processingRef.current = false;
        setIsSigning(false);
        setLoading(false);
      }
      return;
    }

    const xdrToSign = transfer.stellarUnsignedXdr || transfer.signingRequest?.xdr;
    if (transfer.direction === 'STELLAR_TO_EVM' && xdrToSign && !transfer.sourceTxHash) {
      lastSigningRef.current = null;
      processSigningRequest({
        ...transfer,
        signingRequest: {
          type: 'STELLAR',
          purpose:
            transfer.status === 'APPROVAL_SIGNATURE_REQUIRED' && !transfer.approvalTxHash
              ? 'APPROVAL'
              : 'BRIDGE',
          xdr: xdrToSign,
        },
      });
      return;
    }

    if (transfer.status === 'MINT_SIGNATURE_REQUIRED') {
      if (transfer.signingRequest) {
        lastSigningRef.current = null;
        processSigningRequest(transfer);
        return;
      }
      setLoading(true);
      setMessage('Fetching mint transaction from backend...');
      try {
        const latest = await getCctpBridgeTransfer(transfer.id);
        if (latest?.signingRequest) {
          const readyTransfer: CctpBridgeTransfer = {
            ...transfer,
            ...latest,
          };
          setTransfer(readyTransfer);
          lastSigningRef.current = null;
          processSigningRequest(readyTransfer);
        } else {
          setTransfer(prev => ({ ...(prev ?? latest), ...latest }));
        }
      } catch (err: any) {
        setError(err?.message || 'Failed to fetch mint transaction');
      } finally {
        processingRef.current = false;
        setIsSigning(false);
        setLoading(false);
      }
      return;
    }

    const hasSigningRequest =
      Boolean(transfer.signingRequest) ||
      (transfer.status === 'STELLAR_SIGNATURE_REQUIRED' && Boolean(transfer.stellarUnsignedXdr)) ||
      transfer.status === 'MINT_SIGNATURE_REQUIRED';
    if (!hasSigningRequest) return;
    lastSigningRef.current = null;
    processSigningRequest(transfer);
  }, [transfer, processSigningRequest]);

  useEffect(() => {
    retrySignatureRef.current = retrySignature;
  }, [retrySignature]);

  const refreshStatus = useCallback(async () => {
    if (!transfer?.id) return;
    try {
      setLoading(true);
      const result = await getCctpBridgeTransfer(transfer.id);
      setTransfer(prev => {
        if (!prev) return result;
        return {
          ...result,
          sourceTxHash: result.sourceTxHash || prev.sourceTxHash,
          approvalTxHash: result.approvalTxHash || prev.approvalTxHash,
        };
      });
    } catch (err: any) {
      console.error('[CCTP Bridge] Refresh status error:', err);
    } finally {
      setLoading(false);
    }
  }, [transfer?.id]);

  const manualSubmitTxHash = useCallback(
    async (hash: string) => {
      const cleanHash = hash.trim();
      if (!cleanHash || !transfer?.id) return;

      console.log(
        '[CCTP Bridge] Manual submit tx hash:',
        cleanHash,
        'current status:',
        transfer.status
      );

      const isStellarApproval =
        direction === 'STELLAR_TO_EVM' &&
        (transfer.status === 'APPROVAL_SIGNATURE_REQUIRED' ||
          transfer.status === 'APPROVAL_PENDING');

      if (isStellarApproval) {
        setLoading(true);
        setMessage('Submitting Stellar approval to bridge relayer...');
        try {
          const updated = await submitCctpApprovalTx(transfer.id, cleanHash);
          setTransfer(prev => ({
            ...(prev ?? updated),
            ...updated,
            approvalTxHash: cleanHash,
            status:
              updated.status === 'APPROVAL_SIGNATURE_REQUIRED'
                ? 'APPROVAL_PENDING'
                : updated.status,
          }));
          setMessage('Approval submitted! Waiting for burn transaction...');
        } catch (err: any) {
          console.warn('[CCTP Bridge] Error submitting manual approval hash:', err);
          setError(err?.message || 'Failed to submit approval hash');
        } finally {
          setLoading(false);
        }
        return;
      }

      if (
        !transfer.sourceTxHash ||
        transfer.status === 'BRIDGE_SIGNATURE_REQUIRED' ||
        transfer.status === 'BURN_SIGNATURE_REQUIRED' ||
        transfer.status === 'SOURCE_PENDING' ||
        (transfer.status === 'STELLAR_SIGNATURE_REQUIRED' && direction === 'STELLAR_TO_EVM')
      ) {
        setLoading(true);
        setMessage('Submitting transaction to bridge relayer...');
        try {
          const updated = await submitCctpSourceTx(transfer.id, cleanHash);
          const finalTransfer: CctpBridgeTransfer = {
            ...updated,
            status: 'SOURCE_PENDING',
            sourceTxHash: cleanHash,
          };
          setTransfer(finalTransfer);
          setMessage('Transaction submitted! Relayer tracking transfer...');
        } catch (err: any) {
          console.warn('[CCTP Bridge] Error submitting manual source hash:', err);
          setError(err?.message || 'Failed to submit source hash');
        } finally {
          setLoading(false);
        }
        return;
      }

      if (
        transfer.status === 'DESTINATION_PENDING' ||
        transfer.status === 'MINT_SIGNATURE_REQUIRED' ||
        (transfer.status === 'STELLAR_SIGNATURE_REQUIRED' && direction === 'EVM_TO_STELLAR')
      ) {
        setLoading(true);
        try {
          await submitCctpDestinationTx(transfer.id, cleanHash);
          setTransfer(prev =>
            prev ? { ...prev, status: 'COMPLETED', destinationTxHash: cleanHash } : null
          );
          setMessage('Bridge transfer completed!');
        } catch (err: any) {
          setError(err?.message || 'Failed to submit destination hash');
        } finally {
          setLoading(false);
        }
      }
    },
    [transfer, direction, evmAddress, stellarAddress, amount, signStellar]
  );

  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).__cctpSubmitTxHash = manualSubmitTxHash;
    }
  }, [manualSubmitTxHash]);

  const reset = useCallback(() => {
    setAmount('');
    setQuote(null);
    setTransfer(null);
    setMessage('');
    setError(null);
    lastSigningRef.current = null;
    processingRef.current = false;
    setIsSigning(false);
    try {
      localStorage.removeItem(storageKey);
    } catch {
      void 0;
    }
  }, [storageKey]);

  return {
    direction,
    setDirection,
    toggleDirection,
    selectedEvmChain,
    selectedEvmChainId,
    setSelectedEvmChainId,
    supportedEvmChains: CCTP_SUPPORTED_EVM_CHAINS,
    amount,
    setAmount,
    fast: effectiveFast,
    fastEnabled,
    setFastEnabled,
    isFastSupported,
    isAvax,
    quote,
    setQuote,
    transfer,
    setTransfer,
    loading,
    isFetchingQuote,
    isSigning,
    message,
    error,
    status: (transfer?.status as CctpTransferStatus) || 'IDLE',
    chainConfig,
    getQuote,
    startBridge,
    retrySignature,
    refreshStatus,
    manualSubmitTxHash,
    reset,
  };
}

export { useEvmToStellarBridge } from './useEvmToStellarBridge';
export { useStellarToEvmBridge } from './useStellarToEvmBridge';
