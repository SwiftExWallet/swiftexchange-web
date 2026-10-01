import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { getCurrentNetwork } from '../../../../../service/apiConfig';
import {
  CCTP_SUPPORTED_EVM_CHAINS,
  type CctpBridgeQuote,
  type CctpBridgeTransfer,
  type CctpEvmChainConfig,
  type CctpTransferStatus,
  createCctpBridge,
  formatBridgeError,
  getCctpBridgeQuote,
  getCctpBridgeTransfer,
  getCctpChainConfig,
  validateEvmAddress,
  validateStellarAddress,
  validateUsdcAmount,
} from '../../../../../service/evmToStellarCctpService';
import { executeEvmSigning, executeStellarMint } from './flows/evmToStellarFlow';

export interface UseEvmToStellarBridgeProps {
  evmAddress?: string;
  stellarAddress?: string;
  evmProvider?: any;
  stellarProvider?: any;
  chainId?: number;
  network?: 'mainnet' | 'testnet';
  initialEvmChainId?: number;
  initialFast?: boolean;
  signEvmTx?: (rawTx: any, evmAddress: string, chainId: number) => Promise<string>;
  signStellarTx?: (xdr: string) => Promise<string>;
  onSuccess?: (transfer: CctpBridgeTransfer) => void;
  onError?: (error: Error) => void;
}

export function useEvmToStellarBridge({
  evmAddress,
  stellarAddress,
  evmProvider,
  stellarProvider,
  chainId: propChainId,
  network: propNetwork,
  initialEvmChainId,
  initialFast = true,
  signEvmTx,
  signStellarTx,
  onSuccess,
  onError,
}: UseEvmToStellarBridgeProps) {
  const currentNetwork = propNetwork || getCurrentNetwork();

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

  const effectiveFast = isAvax ? false : fastEnabled;
  const isFastSupported = !isAvax;

  const chainConfig = useMemo(() => {
    return getCctpChainConfig(currentNetwork, selectedEvmChain[currentNetwork].chainId);
  }, [currentNetwork, selectedEvmChain]);

  const networkPassphrase = useMemo(() => {
    return currentNetwork === 'testnet'
      ? 'Test SDF Network ; September 2015'
      : 'Public Global Stellar Network ; September 2015';
  }, [currentNetwork]);

  const storageKey = useMemo(() => {
    return `swiftex_cctp_transfer_${currentNetwork}_EVM_TO_STELLAR_${evmAddress || 'anon'}`;
  }, [currentNetwork, evmAddress]);

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

  const validateInputs = useCallback((): boolean => {
    setError(null);

    const evmValidation = validateEvmAddress(evmAddress);
    if (!evmValidation.valid) {
      setError(evmValidation.error || 'Invalid EVM address');
      return false;
    }

    const stellarValidation = validateStellarAddress(stellarAddress);
    if (!stellarValidation.valid) {
      setError(stellarValidation.error || 'Invalid Stellar address');
      return false;
    }

    const amountValidation = validateUsdcAmount(amount);
    if (!amountValidation.valid) {
      setError(amountValidation.error || 'Invalid USDC amount');
      return false;
    }

    return true;
  }, [evmAddress, stellarAddress, amount]);

  const sourceChainKey = useMemo(() => {
    return chainConfig.sourceChainKey;
  }, [chainConfig]);

  const getQuote = useCallback(async () => {
    if (!validateInputs()) return null;

    if (quoteAbortRef.current) {
      quoteAbortRef.current.abort();
    }
    const abortController = new AbortController();
    quoteAbortRef.current = abortController;

    setIsFetchingQuote(true);
    setError(null);
    setMessage('Fetching quote...');

    try {
      const q = await getCctpBridgeQuote(
        {
          direction: 'EVM_TO_STELLAR',
          evmAddress: evmAddress!.trim(),
          stellarAddress: stellarAddress!.trim(),
          amount: amount.trim(),
          sourceChain: sourceChainKey,
          fast: effectiveFast,
        },
        abortController.signal
      );

      if (abortController.signal.aborted) return null;

      setQuote(q);
      setMessage('Quote received.');
      return q;
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
  }, [validateInputs, evmAddress, stellarAddress, amount, sourceChainKey, effectiveFast, onError]);

  const startBridge = useCallback(async () => {
    if (processingRef.current) return;
    if (!validateInputs()) return;

    processingRef.current = true;
    setLoading(true);
    setError(null);
    setMessage('Creating bridge transfer...');

    try {
      const result = await createCctpBridge({
        direction: 'EVM_TO_STELLAR',
        evmAddress: evmAddress!.trim(),
        stellarAddress: stellarAddress!.trim(),
        amount: amount.trim(),
        sourceChain: sourceChainKey,
        fast: effectiveFast,
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
  }, [validateInputs, evmAddress, stellarAddress, amount, sourceChainKey, effectiveFast, onError]);

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
        if (effectivePurpose !== 'APPROVAL' && currentTransfer.sourceTxHash) return;
      }
      if (effectiveType === 'STELLAR') {
        if (currentTransfer.destinationTxHash) return;
      }

      const signingKey = `${currentTransfer.id}:${currentTransfer.status}:${effectiveType}:${effectivePurpose || ''}`;
      if (lastSigningRef.current === signingKey) return;
      lastSigningRef.current = signingKey;
      processingRef.current = true;
      setIsSigning(true);
      setError(null);

      try {
        if (effectiveType === 'EVM') {
          setMessage(
            effectivePurpose === 'APPROVAL'
              ? 'Approve USDC in EVM wallet...'
              : 'Confirm CCTP bridge deposit in EVM wallet...'
          );
          const updated = await executeEvmSigning({
            currentTransfer,
            evmAddress: evmAddress || '',
            stellarAddress: stellarAddress || '',
            amount,
            chainConfig,
            currentNetwork,
            networkPassphrase,
            evmProvider,
            signEvmTx,
            onMessage: setMessage,
          });
          setTransfer(updated);
          return;
        }

        if (effectiveType === 'STELLAR') {
          setMessage('Confirm & mint USDC in Stellar wallet...');
          const updated = await executeStellarMint({
            currentTransfer,
            stellarAddress: stellarAddress || '',
            evmAddress: evmAddress || '',
            amount,
            chainConfig,
            currentNetwork,
            networkPassphrase,
            stellarProvider,
            signStellarTx,
            onMessage: setMessage,
            onSuccess,
          });
          setTransfer(updated);
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
    [
      evmAddress,
      stellarAddress,
      amount,
      chainConfig,
      currentNetwork,
      networkPassphrase,
      evmProvider,
      stellarProvider,
      signEvmTx,
      signStellarTx,
      onSuccess,
      onError,
    ]
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
    const shouldPoll =
      pollStatuses.includes(transfer.status) ||
      (transfer.status === 'BRIDGE_SIGNATURE_REQUIRED' && Boolean(transfer.sourceTxHash));

    if (!shouldPoll) return;

    const pollInterval = transfer.status === 'APPROVAL_PENDING' ? 3000 : 5000;

    const timer = setInterval(async () => {
      try {
        const result = await getCctpBridgeTransfer(transfer.id);
        if (!result) return;
        setTransfer(prev => {
          if (!prev) return result;
          const effectiveStatus =
            prev.sourceTxHash && result.status === 'BRIDGE_SIGNATURE_REQUIRED'
              ? 'SOURCE_PENDING'
              : prev.approvalTxHash && result.status === 'APPROVAL_SIGNATURE_REQUIRED'
                ? 'APPROVAL_PENDING'
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
    }, pollInterval);

    return () => clearInterval(timer);
  }, [transfer?.id, transfer?.status, transfer?.sourceTxHash, transfer?.approvalTxHash, onSuccess]);

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
                messageBytes: msg.message,
              };
            });
          }
        }
      } catch (irisErr) {
        console.warn('[CCTP Bridge] Circle Iris poll warning:', irisErr);
      }
    };

    checkIris();
    const interval = setInterval(checkIris, 10_000);

    return () => {
      isSubscribed = false;
      clearInterval(interval);
    };
  }, [transfer?.sourceTxHash, transfer?.attestation, transfer?.status, currentNetwork]);

  const retrySignature = useCallback(() => {
    if (!transfer) return;
    const hasSigningRequest =
      Boolean(transfer.signingRequest) ||
      (transfer.status === 'STELLAR_SIGNATURE_REQUIRED' && Boolean(transfer.stellarUnsignedXdr));
    if (!hasSigningRequest) return;
    lastSigningRef.current = null;
    processSigningRequest(transfer);
  }, [transfer, processSigningRequest]);

  const refreshStatus = useCallback(async () => {
    if (!transfer?.id) return;
    try {
      setLoading(true);
      const result = await getCctpBridgeTransfer(transfer.id);
      if (!result) return;
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
    localStorage.removeItem(storageKey);
  }, [storageKey]);

  return {
    direction: 'EVM_TO_STELLAR' as const,
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
    status: (transfer?.status || 'IDLE') as CctpTransferStatus,
    getQuote,
    startBridge,
    retrySignature,
    refreshStatus,
    reset,
  };
}
