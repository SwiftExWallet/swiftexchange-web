import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { getCurrentNetwork } from '../../../../../service/apiConfig';
import {
  type CctpBridgeQuote,
  type CctpBridgeTransfer,
  type CctpTransferStatus,
  createCctpBridge,
  getCctpBridgeQuote,
  getCctpBridgeTransfer,
  getCctpChainConfig,
  submitCctpStellarSignature,
} from '../../../../../service/evmToStellarCctpService';
import { sendEVMTransaction } from '../../../../../utils/walletConnectUtils';
import { signStellarChallenge } from '../../../../walletconnect/services/wallet/signing';
import { parseRawChainId, switchOrAddChain } from '../../../utils/evmChainUtils';

async function waitForTxReceipt(provider: any, txHash: string, timeoutMs = 120_000): Promise<any> {
  const start = Date.now();
  const rpcFallback = 'https://ethereum-sepolia-rpc.publicnode.com';

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

      if (!receipt) {
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
  signEvmTx,
  signStellarTx,
  onSuccess,
  onError,
}: UseEvmToStellarCctpProps) {
  const [amount, setAmount] = useState('');
  const [fast, setFast] = useState(false);
  const [quote, setQuote] = useState<CctpBridgeQuote | null>(null);
  const [transfer, setTransfer] = useState<CctpBridgeTransfer | null>(null);
  const [loading, setLoading] = useState(false);
  const [isSigning, setIsSigning] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);

  const processingRef = useRef(false);
  const lastSigningRef = useRef<string | null>(null);
  const quoteAbortRef = useRef<AbortController | null>(null);

  const currentNetwork = propNetwork || getCurrentNetwork();
  const chainConfig = useMemo(() => {
    const cfg = getCctpChainConfig(currentNetwork);
    return {
      ...cfg,
      chainId: propChainId || cfg.chainId,
    };
  }, [currentNetwork, propChainId]);

  const networkPassphrase = useMemo(() => {
    return currentNetwork === 'testnet'
      ? 'Test SDF Network ; September 2015'
      : 'Public Global Stellar Network ; September 2015';
  }, [currentNetwork]);

  const storageKey = useMemo(() => {
    return `swiftex_cctp_transfer_${currentNetwork}_${evmAddress || 'anon'}`;
  }, [currentNetwork, evmAddress]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed: CctpBridgeTransfer = JSON.parse(saved);
        if (parsed?.id && parsed.status !== 'COMPLETED' && parsed.status !== 'FAILED') {
          setTransfer(parsed);
          getCctpBridgeTransfer(parsed.id)
            .then(fresh => {
              if (fresh) {
                setTransfer(prev => ({
                  ...fresh,
                  sourceTxHash: fresh.sourceTxHash || prev?.sourceTxHash || parsed.sourceTxHash,
                  approvalTxHash:
                    fresh.approvalTxHash || prev?.approvalTxHash || parsed.approvalTxHash,
                }));
              }
            })
            .catch(err => console.warn('[CCTP Bridge] Failed to resume transfer status:', err));
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
    if (transfer.status === 'COMPLETED' || transfer.status === 'FAILED') {
      localStorage.removeItem(storageKey);
    } else {
      localStorage.setItem(storageKey, JSON.stringify(transfer));
    }
  }, [transfer, storageKey]);

  const getQuote = useCallback(
    async (overrideAmount?: string) => {
      const quoteAmt = (overrideAmount !== undefined ? overrideAmount : amount).trim();

      if (!evmAddress) {
        const err = 'EVM wallet not connected.';
        setError(err);
        return null;
      }

      if (!stellarAddress) {
        const err = 'Stellar wallet not connected.';
        setError(err);
        return null;
      }

      if (!quoteAmt || parseFloat(quoteAmt) <= 0) {
        const err = 'Enter valid USDC amount.';
        setError(err);
        return null;
      }

      quoteAbortRef.current?.abort();
      quoteAbortRef.current = new AbortController();

      try {
        setLoading(true);
        setError(null);
        setMessage('Getting quote...');

        const result = await getCctpBridgeQuote(
          {
            evmAddress,
            stellarAddress,
            amount: quoteAmt,
            fast,
          },
          quoteAbortRef.current.signal
        );

        setQuote(result);
        setMessage('Quote ready.');
        return result;
      } catch (err: any) {
        if (err?.name === 'AbortError') return null;
        const errMsg = err?.message || 'Failed to fetch quote';
        setError(errMsg);
        setMessage('');
        onError?.(err instanceof Error ? err : new Error(errMsg));
        return null;
      } finally {
        setLoading(false);
      }
    },
    [amount, evmAddress, stellarAddress, fast, onError]
  );

  const startBridge = useCallback(async () => {
    if (!quote) {
      const err = 'Get a quote first.';
      setError(err);
      return null;
    }

    if (!evmAddress || !stellarAddress) {
      const err = 'Both EVM and Stellar wallets must be connected.';
      setError(err);
      return null;
    }

    try {
      setLoading(true);
      setError(null);
      setMessage('Creating bridge transfer...');

      const result = await createCctpBridge({
        evmAddress,
        stellarAddress,
        amount: amount.trim(),
        fast,
      });

      setTransfer(result);
      setMessage('Transfer created.');
      return result;
    } catch (err: any) {
      const errMsg = err?.message || 'Bridge creation failed';
      setError(errMsg);
      setMessage('');
      onError?.(err instanceof Error ? err : new Error(errMsg));
      return null;
    } finally {
      setLoading(false);
    }
  }, [quote, amount, evmAddress, stellarAddress, fast, onError]);

  const signEvm = useCallback(
    async (currentTransfer: CctpBridgeTransfer) => {
      const signingRequest = currentTransfer?.signingRequest;
      if (signingRequest?.type !== 'EVM') return;

      if (!signingRequest.rawTx) {
        throw new Error('Backend did not return rawTx.');
      }

      const rawTx = signingRequest.rawTx;
      let signedTxHex = '';

      if (signEvmTx) {
        signedTxHex = await signEvmTx(rawTx, evmAddress || '', chainConfig.chainId);
      } else if (typeof (window as any)?.TransactionSigner?.signTransaction === 'function') {
        const rawTxStr = typeof rawTx === 'string' ? rawTx : JSON.stringify(rawTx);
        const res = await (window as any).TransactionSigner.signTransaction(
          chainConfig.nativeChainKey,
          evmAddress,
          rawTxStr,
          chainConfig.chainId
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
            if (activeChain !== Number(chainConfig.chainId)) {
              await switchOrAddChain(evmProvider, chainConfig.chainId);
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
        } else if (chainConfig.chainId) {
          txParams.chainId = toHex(chainConfig.chainId);
        }

        if (parsedTx.type !== undefined && parsedTx.type !== null) {
          txParams.type = toHex(parsedTx.type);
        }

        signedTxHex = await sendEVMTransaction(evmProvider, chainConfig.chainId, txParams);
      } else {
        throw new Error('No EVM wallet or provider available');
      }

      if (!signedTxHex) {
        throw new Error('Wallet did not return a transaction hash');
      }

      const normalizedTxHash = '0x' + signedTxHex.replace(/^(0x)+/i, '');
      const isApproval = signingRequest?.purpose === 'APPROVAL';

      if (isApproval) {
        const updatedApproval: CctpBridgeTransfer = {
          ...currentTransfer,
          status: 'APPROVAL_PENDING',
          approvalTxHash: normalizedTxHash,
          signingRequest: null,
        };
        setTransfer(updatedApproval);
        setMessage('USDC approval submitted. Waiting for on-chain confirmation...');

        await waitForTxReceipt(evmProvider, normalizedTxHash);

        setMessage('USDC approved! Generating CCTP deposit transaction...');

        const bridgePayload = {
          evmAddress: currentTransfer.evmAddress || evmAddress || '',
          stellarAddress: currentTransfer.stellarAddress || stellarAddress || '',
          amount: amount.trim() || currentTransfer.amount || '',
          fast: currentTransfer.fast !== undefined ? currentTransfer.fast : fast,
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
        return finalTransfer;
      } else {
        const updatedDeposit: CctpBridgeTransfer = {
          ...currentTransfer,
          status: 'SOURCE_PENDING',
          sourceTxHash: normalizedTxHash,
          signingRequest: null,
        };
        setTransfer(updatedDeposit);
        setMessage('Deposit submitted! Waiting for Ethereum confirmation & finality...');
        return updatedDeposit;
      }
    },
    [evmAddress, stellarAddress, amount, fast, chainConfig, evmProvider, signEvmTx]
  );

  const signStellar = useCallback(
    async (currentTransfer: CctpBridgeTransfer) => {
      const signingRequest = currentTransfer?.signingRequest;
      if (signingRequest?.type !== 'STELLAR') return;

      const xdr = signingRequest.xdr;
      if (!xdr) {
        throw new Error('Backend did not return Stellar XDR.');
      }

      setMessage('Waiting for Stellar signature...');
      let signedXdrStr = '';

      if (signStellarTx) {
        signedXdrStr = await signStellarTx(xdr);
      } else if (typeof (window as any)?.StellarSigner?.signTransaction === 'function') {
        const res = await (window as any).StellarSigner.signTransaction(xdr);
        signedXdrStr = res?.signedXDR || res?.signedTxXdr || (typeof res === 'string' ? res : '');
      } else if (stellarProvider) {
        signedXdrStr = await signStellarChallenge(xdr, networkPassphrase, stellarProvider);
      } else {
        throw new Error('No Stellar signer or provider available');
      }

      if (!signedXdrStr) {
        throw new Error('Wallet did not return signed XDR.');
      }

      setMessage('Submitting Stellar transaction...');
      const result = await submitCctpStellarSignature(currentTransfer.id, signedXdrStr);
      setTransfer(prev => ({
        ...result,
        sourceTxHash: result.sourceTxHash || prev?.sourceTxHash,
        approvalTxHash: result.approvalTxHash || prev?.approvalTxHash,
      }));
      return result;
    },
    [networkPassphrase, stellarProvider, signStellarTx]
  );

  const processSigningRequest = useCallback(
    async (currentTransfer: CctpBridgeTransfer) => {
      if (!currentTransfer?.signingRequest) return;
      if (processingRef.current) return;

      const request = currentTransfer.signingRequest;

      if (request.type === 'EVM') {
        if (request.purpose === 'APPROVAL' && currentTransfer.approvalTxHash) return;
        if (request.purpose !== 'APPROVAL' && currentTransfer.sourceTxHash) return;
      }

      const signingKey = `${currentTransfer.id}:${currentTransfer.status}:${request.type}:${request.purpose || ''}`;
      if (lastSigningRef.current === signingKey) return;
      lastSigningRef.current = signingKey;
      processingRef.current = true;
      setIsSigning(true);
      setError(null);

      try {
        if (request.type === 'EVM') {
          if (request.purpose === 'APPROVAL') {
            setMessage('Approve USDC in wallet...');
          } else {
            setMessage('Confirm CCTP bridge deposit in wallet...');
          }
          await signEvm(currentTransfer);
          return;
        }

        if (request.type === 'STELLAR') {
          await signStellar(currentTransfer);
        }
      } catch (err: any) {
        lastSigningRef.current = null;
        const errMsg = err?.message || 'Signing failed';
        setError(errMsg);
        setMessage('Signature required.');
        onError?.(err instanceof Error ? err : new Error(errMsg));
      } finally {
        processingRef.current = false;
        setIsSigning(false);
      }
    },
    [signEvm, signStellar, onError]
  );

  useEffect(() => {
    if (!transfer?.signingRequest) return;
    processSigningRequest(transfer);
  }, [transfer, processSigningRequest]);

  useEffect(() => {
    if (!transfer?.id) return;

    const pollStatuses = ['SOURCE_PENDING', 'ATTESTATION_PENDING', 'DESTINATION_PENDING'];
    const shouldPoll =
      pollStatuses.includes(transfer.status) ||
      (transfer.status === 'BRIDGE_SIGNATURE_REQUIRED' && Boolean(transfer.sourceTxHash));

    if (!shouldPoll) return;

    const timer = setInterval(async () => {
      try {
        const result = await getCctpBridgeTransfer(transfer.id);
        setTransfer(prev => {
          if (!prev) return result;
          const effectiveStatus =
            prev.sourceTxHash && result.status === 'BRIDGE_SIGNATURE_REQUIRED'
              ? 'SOURCE_PENDING'
              : result.status;

          return {
            ...result,
            status: effectiveStatus,
            sourceTxHash: result.sourceTxHash || prev.sourceTxHash,
            approvalTxHash: result.approvalTxHash || prev.approvalTxHash,
            attestation: result.attestation || prev.attestation,
            message: result.message || prev.message,
          };
        });
        if (result.status === 'COMPLETED') {
          onSuccess?.(result);
        }
      } catch (pollErr) {
        console.error('[CCTP Bridge] Status polling error:', pollErr);
      }
    }, 5000);

    return () => clearInterval(timer);
  }, [transfer?.id, transfer?.status, transfer?.sourceTxHash, onSuccess]);

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
        setMessage('Action required: Approve USDC spending in EVM wallet.');
        break;
      case 'APPROVAL_PENDING':
        setMessage('USDC approval submitted. Waiting for on-chain confirmation...');
        break;
      case 'BRIDGE_SIGNATURE_REQUIRED':
        if (transfer.sourceTxHash) {
          setMessage(
            transfer.attestation
              ? 'Circle Iris attestation ready! Waiting for Stellar mint setup...'
              : 'Deposit broadcasted! Waiting for Ethereum finality & Circle attestation...'
          );
        } else {
          setMessage('Action required: Confirm CCTP bridge deposit in EVM wallet.');
        }
        break;
      case 'SOURCE_PENDING':
        setMessage(
          transfer.attestation
            ? 'Circle Iris attestation ready! Waiting for Stellar mint setup...'
            : 'Deposit submitted! Waiting for Ethereum confirmation & finality...'
        );
        break;
      case 'ATTESTATION_PENDING':
        setMessage(
          transfer.attestation
            ? 'Circle Iris attestation ready! Waiting for Stellar mint setup...'
            : 'Waiting for Circle Iris CCTP protocol attestation...'
        );
        break;
      case 'STELLAR_SIGNATURE_REQUIRED':
        setMessage('Attestation ready! Please sign with Stellar wallet to mint USDC.');
        break;
      case 'DESTINATION_PENDING':
        setMessage('Stellar mint submitted. Waiting for ledger finality...');
        break;
      case 'COMPLETED':
        setMessage('Bridge completed successfully! USDC minted to Stellar.');
        break;
      case 'FAILED':
        setMessage(transfer.error || 'Bridge failed.');
        setError(transfer.error || 'Bridge failed.');
        break;
      default:
        break;
    }
  }, [transfer?.status, transfer?.error]);

  const retrySignature = useCallback(() => {
    if (!transfer?.signingRequest) return;
    lastSigningRef.current = null;
    processSigningRequest(transfer);
  }, [transfer, processSigningRequest]);

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
    amount,
    setAmount,
    fast,
    setFast,
    quote,
    transfer,
    setTransfer,
    loading,
    isSigning,
    message,
    error,
    status: (transfer?.status as CctpTransferStatus) || 'IDLE',
    chainConfig,
    getQuote,
    startBridge,
    retrySignature,
    refreshStatus,
    reset,
  };
}
