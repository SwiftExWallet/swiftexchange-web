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
  generateCctpIdempotencyKey,
  getCctpBridgeQuote,
  getCctpBridgeTransfer,
  validateEvmAddress,
  validateStellarAddress,
  validateUsdcAmount,
} from '../../../../../service/evmToStellarCctpService';
import { executeStellarToEvmApproval, executeStellarToEvmBurn } from './flows/stellarToEvmFlow';

export interface UseStellarToEvmBridgeProps {
  evmAddress?: string;
  stellarAddress?: string;
  stellarProvider?: any;
  targetEvmChainId?: number;
  network?: 'mainnet' | 'testnet';
  signStellarTx?: (xdr: string) => Promise<string>;
  onSuccess?: (transfer: CctpBridgeTransfer) => void;
  onError?: (error: Error) => void;
}

export function useStellarToEvmBridge({
  evmAddress,
  stellarAddress,
  stellarProvider,
  targetEvmChainId,
  network: propNetwork,
  signStellarTx,
  onSuccess,
  onError,
}: UseStellarToEvmBridgeProps) {
  const currentNetwork = propNetwork || getCurrentNetwork();

  const [selectedEvmChainId, setSelectedEvmChainId] = useState<number>(() => {
    if (targetEvmChainId) return targetEvmChainId;
    return currentNetwork === 'testnet' ? 11155111 : 1;
  });

  const [amount, setAmount] = useState('');
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

  const targetChain = useMemo(() => {
    return currentNetwork === 'testnet' ? 'sepolia' : 'ethereum';
  }, [currentNetwork]);

  const networkPassphrase = useMemo(() => {
    return currentNetwork === 'testnet'
      ? 'Test SDF Network ; September 2015'
      : 'Public Global Stellar Network ; September 2015';
  }, [currentNetwork]);

  const storageKey = useMemo(() => {
    return `swiftex_cctp_transfer_${currentNetwork}_STELLAR_TO_EVM_${stellarAddress || 'anon'}`;
  }, [currentNetwork, stellarAddress]);

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
          direction: 'STELLAR_TO_EVM',
          evmAddress: evmAddress!.trim(),
          stellarAddress: stellarAddress!.trim(),
          amount: amount.trim(),
          sourceChain: targetChain,
          fast: false,
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
  }, [validateInputs, evmAddress, stellarAddress, amount, targetChain, onError]);

  const startBridge = useCallback(async () => {
    if (processingRef.current) return;
    if (!validateInputs()) return;

    processingRef.current = true;
    setLoading(true);
    setError(null);
    setMessage('Creating bridge transfer...');

    try {
      const result = await createCctpBridge({
        direction: 'STELLAR_TO_EVM',
        evmAddress: evmAddress!.trim(),
        stellarAddress: stellarAddress!.trim(),
        amount: amount.trim(),
        sourceChain: targetChain,
        fast: false,
        idempotencyKey: generateCctpIdempotencyKey(),
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
  }, [validateInputs, evmAddress, stellarAddress, amount, targetChain, onError]);

  const processSigningRequest = useCallback(
    async (currentTransfer: CctpBridgeTransfer) => {
      const request = currentTransfer?.signingRequest;
      const isStellarWithoutRequest =
        !request &&
        (currentTransfer?.status === 'APPROVAL_SIGNATURE_REQUIRED' ||
          currentTransfer?.status === 'BRIDGE_SIGNATURE_REQUIRED') &&
        Boolean(currentTransfer?.stellarUnsignedXdr);

      if (!request && !isStellarWithoutRequest) return;
      if (processingRef.current) return;

      const effectivePurpose =
        request?.purpose ||
        (currentTransfer.status === 'APPROVAL_SIGNATURE_REQUIRED' ? 'APPROVAL' : 'BRIDGE');

      if (effectivePurpose === 'APPROVAL' && currentTransfer.approvalTxHash) return;
      if (effectivePurpose !== 'APPROVAL' && currentTransfer.sourceTxHash) return;

      const signingKey = `${currentTransfer.id}:${currentTransfer.status}:STELLAR:${effectivePurpose}`;
      if (lastSigningRef.current === signingKey) return;
      lastSigningRef.current = signingKey;
      processingRef.current = true;
      setIsSigning(true);
      setError(null);

      try {
        if (effectivePurpose === 'APPROVAL') {
          setMessage('Confirm USDC allowance approval in Stellar wallet...');
          const updated = await executeStellarToEvmApproval({
            currentTransfer,
            stellarAddress: stellarAddress || '',
            evmAddress: evmAddress || '',
            amount,
            currentNetwork,
            networkPassphrase,
            stellarProvider,
            signStellarTx,
            onMessage: setMessage,
            onSuccess,
          });
          setTransfer(updated);
          return;
        }

        setMessage('Confirm CCTP bridge burn in Stellar wallet...');
        const updated = await executeStellarToEvmBurn({
          currentTransfer,
          stellarAddress: stellarAddress || '',
          evmAddress: evmAddress || '',
          amount,
          currentNetwork,
          networkPassphrase,
          stellarProvider,
          signStellarTx,
          onMessage: setMessage,
          onSuccess,
        });
        setTransfer(updated);
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
      stellarAddress,
      evmAddress,
      amount,
      currentNetwork,
      networkPassphrase,
      stellarProvider,
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
    if (!transfer.stellarUnsignedXdr) return;

    const isApproval = transfer.status === 'APPROVAL_SIGNATURE_REQUIRED';
    const isBurn =
      transfer.status === 'BRIDGE_SIGNATURE_REQUIRED' ||
      transfer.status === 'BURN_SIGNATURE_REQUIRED';

    if (isApproval && !transfer.approvalTxHash) {
      processSigningRequest({
        ...transfer,
        signingRequest: { type: 'STELLAR', purpose: 'APPROVAL', xdr: transfer.stellarUnsignedXdr },
      });
      return;
    }

    if (isBurn && !transfer.sourceTxHash) {
      processSigningRequest({
        ...transfer,
        signingRequest: { type: 'STELLAR', purpose: 'BRIDGE', xdr: transfer.stellarUnsignedXdr },
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

    const shouldPoll = pollStatuses.includes(transfer.status) || isBridgeSignatureAfterSource;

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

          const effectiveStatus =
            prev.sourceTxHash && isBurnResult
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

  const retrySignature = useCallback(async () => {
    if (!transfer) return;

    const hasBurnXdr =
      (transfer.signingRequest?.purpose === 'BURN' && transfer.signingRequest?.xdr) ||
      (transfer.stellarUnsignedXdr &&
        (transfer.status === 'BURN_SIGNATURE_REQUIRED' ||
          transfer.status === 'BRIDGE_SIGNATURE_REQUIRED'));

    if (transfer.approvalTxHash && !transfer.sourceTxHash && hasBurnXdr) {
      lastSigningRef.current = null;
      const burnXdr = transfer.signingRequest?.xdr || transfer.stellarUnsignedXdr!;
      processSigningRequest({
        ...transfer,
        signingRequest: { type: 'STELLAR', purpose: 'BURN', xdr: burnXdr },
      });
      return;
    }

    if (
      transfer.approvalTxHash &&
      !transfer.sourceTxHash &&
      (transfer.status === 'APPROVAL_PENDING' || transfer.status === 'APPROVAL_SIGNATURE_REQUIRED')
    ) {
      setLoading(true);
      setMessage('Checking for burn transaction...');
      try {
        const latest = await getCctpBridgeTransfer(transfer.id);
        if (
          latest &&
          (latest.status === 'BURN_SIGNATURE_REQUIRED' ||
            latest.status === 'BRIDGE_SIGNATURE_REQUIRED') &&
          (latest.signingRequest?.xdr || latest.stellarUnsignedXdr)
        ) {
          setTransfer(prev => ({ ...(prev ?? latest), ...latest }));
          setMessage('Burn transaction ready. Please sign...');
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
        setLoading(false);
      }
      return;
    }

    const xdrToSign = transfer.stellarUnsignedXdr || transfer.signingRequest?.xdr;
    if (xdrToSign && !transfer.sourceTxHash) {
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

    const hasSigningRequest = Boolean(transfer.signingRequest);
    if (!hasSigningRequest) return;
    lastSigningRef.current = null;
    processSigningRequest(transfer);
  }, [
    transfer,
    stellarAddress,
    evmAddress,
    amount,
    currentNetwork,
    networkPassphrase,
    stellarProvider,
    signStellarTx,
    processSigningRequest,
    onSuccess,
  ]);

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
    direction: 'STELLAR_TO_EVM' as const,
    selectedEvmChain,
    selectedEvmChainId,
    setSelectedEvmChainId,
    supportedEvmChains: CCTP_SUPPORTED_EVM_CHAINS,
    amount,
    setAmount,
    fast: false,
    fastEnabled: false,
    setFastEnabled: () => {},
    isFastSupported: false,
    isAvax: false,
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
