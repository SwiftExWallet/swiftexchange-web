import { useCallback, useEffect, useRef, useState } from 'react';

import { WalletType } from '@/modules/walletconnect/constants/Wallet';
import { useWalletConnect } from '@/modules/walletconnect/hooks/useWalletConnect';

import { getEffectiveAuthToken } from '../../../service/apiService';
import {
  type NormalizedRecoveryStatus,
  recoveryApi,
  recoveryStatusNotice,
} from '../services/recoveryApi';
import {
  type LedgerAssetBalance,
  checkOnChainRegistration,
  fetchWalletLedgerBalances,
  parseContractError,
} from '../services/sparekeyContractService';
import {
  type ParsedEmlResult,
  parseEmlContent,
  requestRecoveryFromBackend,
} from '../services/zkRecoveryService';
import { useRecoveryStore } from '../store/recoveryStore';

export type TargetRegistrationStatus =
  'idle' | 'unauthenticated' | 'checking' | 'registered' | 'not_registered';

export function useRecoverWalletFlow(options?: { onSuccess?: () => void }) {
  const { connectedWallets, openModal } = useWalletConnect();

  const rawStellar =
    connectedWallets?.[WalletType.STELLAR]?.address || connectedWallets?.stellar?.address || '';
  const activeStellarWallet =
    typeof rawStellar === 'string' && rawStellar.startsWith('G') && rawStellar.length === 56
      ? rawStellar
      : '';

  const targetWallet = useRecoveryStore(state => state.targetWallet || '');
  const registeredEmail = useRecoveryStore(state => state.email || '');
  const newKey = useRecoveryStore(state => state.newKey || '');
  const storeLastTxHash = useRecoveryStore(state => state.lastTxHash);

  const startRecoveryRequest = useRecoveryStore(state => state.startRecoveryRequest);
  const completeRestore = useRecoveryStore(state => state.completeRestore);

  // Form Inputs:
  // Original (Lost) Wallet: left for the user to type/paste
  const [inputTargetWallet, setInputTargetWallet] = useState(targetWallet || '');
  // New Destination Wallet: auto-filled with connected wallet, user can freely edit/update it
  const [destinationAddress, setDestinationAddress] = useState(newKey || activeStellarWallet || '');
  const [inputEmail, setInputEmail] = useState('');

  // Auto-fill connected wallet into destination address if destination is currently empty
  useEffect(() => {
    if (activeStellarWallet && !destinationAddress) {
      setDestinationAddress(activeStellarWallet);
    }
  }, [activeStellarWallet, destinationAddress]);

  // Sync if targetWallet changes externally
  useEffect(() => {
    if (targetWallet) {
      setInputTargetWallet(targetWallet);
    }
  }, [targetWallet]);

  // EML File State
  const [emlFileName, setEmlFileName] = useState('');
  const [emlRawFile, setEmlRawFile] = useState<File | null>(null);
  const [parsedEml, setParsedEml] = useState<ParsedEmlResult | null>(null);
  const [isDraggingEml, setIsDraggingEml] = useState(false);
  const [showManualUpload, setShowManualUpload] = useState(false);

  // Balances
  const [targetBalances, setTargetBalances] = useState<LedgerAssetBalance[]>([]);
  const [isLoadingTargetBalances, setIsLoadingTargetBalances] = useState(false);
  const [targetWalletError, setTargetWalletError] = useState(false);
  const [destinationBalances, setDestinationBalances] = useState<LedgerAssetBalance[]>([]);
  const [isLoadingDestinationBalances, setIsLoadingDestinationBalances] = useState(false);

  // Execution & Status
  const [errorMessage, setErrorMessage] = useState('');
  const [proofSubmitError, setProofSubmitError] = useState('');
  const [proofSubmitSuccess, setProofSubmitSuccess] = useState('');
  const [isSubmittingProof, setIsSubmittingProof] = useState(false);
  const [isExecutingRecovery, setIsExecutingRecovery] = useState(false);

  // Backend Recovery Status & Polling
  const [recoveryStatus, setRecoveryStatus] = useState<NormalizedRecoveryStatus | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [pollNotice, setPollNotice] = useState('');
  const pollingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPollingRef = useRef(false);

  // Success Modal
  const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false);
  const [lastTxHash, setLastTxHash] = useState(storeLastTxHash || '');

  const [isTokenMissing, setIsTokenMissing] = useState(!getEffectiveAuthToken());
  const [targetRegistrationStatus, setTargetRegistrationStatus] =
    useState<TargetRegistrationStatus>('idle');

  const activeOwnerWallet = (inputTargetWallet || targetWallet || '').trim();

  // Helper validators
  const isValidStellarAddress = (addr: string) => /^G[A-Z2-7]{55}$/.test((addr || '').trim());

  // Verify target wallet registration
  useEffect(() => {
    let isMounted = true;
    if (activeOwnerWallet.length === 56 && activeOwnerWallet.startsWith('G')) {
      const token = getEffectiveAuthToken();
      if (!token) {
        setTargetRegistrationStatus('unauthenticated');
        return;
      }

      const store = useRecoveryStore.getState();
      if (
        store.walletAddress &&
        store.walletAddress.toLowerCase() === activeOwnerWallet.toLowerCase() &&
        (store.isConfigured || store.isOnChainVerified || Boolean(store.commitmentHex))
      ) {
        setTargetRegistrationStatus('registered');
        if (!inputEmail && store.email) {
          setInputEmail(store.email);
        }
        return;
      }

      setTargetRegistrationStatus('checking');
      checkOnChainRegistration(activeOwnerWallet)
        .then(res => {
          if (!isMounted) return;
          if (res?.isRegistered) {
            setTargetRegistrationStatus('registered');
          } else if (res?.isAuthMissing) {
            setTargetRegistrationStatus('unauthenticated');
          } else {
            setTargetRegistrationStatus('not_registered');
          }
        })
        .catch(() => {
          if (isMounted) setTargetRegistrationStatus('not_registered');
        });
    } else {
      setTargetRegistrationStatus('idle');
    }

    return () => {
      isMounted = false;
    };
  }, [activeOwnerWallet, inputEmail]);

  // Load destination wallet balances
  useEffect(() => {
    if (destinationAddress.length === 56 && destinationAddress.startsWith('G')) {
      let isCurrent = true;
      setIsLoadingDestinationBalances(true);
      fetchWalletLedgerBalances(destinationAddress)
        .then(b => {
          if (!isCurrent) return;
          setDestinationBalances(b);
        })
        .catch(() => {
          if (!isCurrent) return;
          setDestinationBalances([]);
        })
        .finally(() => {
          if (isCurrent) setIsLoadingDestinationBalances(false);
        });
      return () => {
        isCurrent = false;
      };
    } else {
      setDestinationBalances([]);
    }
  }, [destinationAddress]);

  // Load balances whenever target wallet changes
  useEffect(() => {
    if (activeOwnerWallet.length === 56 && activeOwnerWallet.startsWith('G')) {
      let isCurrent = true;
      setIsLoadingTargetBalances(true);
      setTargetWalletError(false);
      fetchWalletLedgerBalances(activeOwnerWallet)
        .then(b => {
          if (!isCurrent) return;
          setTargetBalances(b);
          setTargetWalletError(b.length === 0);
        })
        .catch(() => {
          if (!isCurrent) return;
          setTargetBalances([]);
          setTargetWalletError(true);
        })
        .finally(() => {
          if (isCurrent) setIsLoadingTargetBalances(false);
        });
      return () => {
        isCurrent = false;
      };
    } else {
      setTargetBalances([]);
      setTargetWalletError(false);
    }
  }, [activeOwnerWallet]);

  // Read & parse EML file
  const handleEmlFileRead = useCallback((file: File) => {
    if (!file) return;
    setProofSubmitError('');
    setProofSubmitSuccess('');
    setEmlFileName(file.name || 'recovery.eml');
    setEmlRawFile(file);

    try {
      const reader = new FileReader();
      reader.onload = e => {
        try {
          const text = (e?.target?.result as string) || '';
          if (!text) return;
          const parsed = parseEmlContent(text);
          setParsedEml(parsed);

          if (parsed?.extractedDestination) {
            setDestinationAddress(parsed.extractedDestination);
          } else if (parsed?.subject && isValidStellarAddress(parsed.subject.trim())) {
            setDestinationAddress(parsed.subject.trim());
          }
        } catch {
          setProofSubmitError('Failed to parse .eml file content.');
        }
      };
      reader.onerror = () => {
        setProofSubmitError('Failed to read the .eml file from disk.');
      };
      reader.readAsText(file);
    } catch {
      setProofSubmitError('Failed to initialize file reader.');
    }
  }, []);

  const stopPolling = useCallback(() => {
    isPollingRef.current = false;
    setIsPolling(false);
    if (pollingTimerRef.current) {
      clearTimeout(pollingTimerRef.current);
      pollingTimerRef.current = null;
    }
  }, []);

  // Poll backend status for owner wallet
  const pollStatusOnce = useCallback(
    async (owner: string): Promise<NormalizedRecoveryStatus | null> => {
      if (!owner || !owner.startsWith('G')) return null;

      const token = getEffectiveAuthToken();
      if (!token) {
        setIsTokenMissing(true);
        return null;
      }

      try {
        const statusRes = await recoveryApi.getRecoveryStatus(owner);
        setIsTokenMissing(false);
        setRecoveryStatus(statusRes);

        if (statusRes?.status) {
          setPollNotice(recoveryStatusNotice(statusRes.status));
        }

        if (statusRes?.destination && isValidStellarAddress(statusRes.destination)) {
          setDestinationAddress(statusRes.destination);
        }

        if (statusRes?.status === 'COMPLETED') {
          setIsSuccessModalOpen(true);
        }

        return statusRes;
      } catch (err: any) {
        console.warn('Polling recovery status error:', err);
        const isAuthErr =
          err?.status === 401 ||
          err?.statusCode === 401 ||
          String(err?.message || '')
            .toLowerCase()
            .includes('token') ||
          String(err?.message || '')
            .toLowerCase()
            .includes('unauthorized');

        if (isAuthErr) {
          setIsTokenMissing(true);
          stopPolling();
        }
        return null;
      }
    },
    [stopPolling]
  );

  // Start continuous polling loop
  const startPolling = useCallback(
    (owner: string) => {
      if (!owner || isPollingRef.current) return;
      if (!getEffectiveAuthToken()) {
        setIsTokenMissing(true);
        return;
      }

      isPollingRef.current = true;
      setIsPolling(true);

      const pollLoop = async () => {
        if (!isPollingRef.current) return;
        if (!getEffectiveAuthToken()) {
          setIsTokenMissing(true);
          stopPolling();
          return;
        }

        const res = await pollStatusOnce(owner);

        // Stop polling if completed or error
        if (res?.status === 'COMPLETED') {
          stopPolling();
          return;
        }

        pollingTimerRef.current = setTimeout(pollLoop, 5000);
      };

      pollLoop();
    },
    [pollStatusOnce, stopPolling]
  );

  // Cleanup polling timer on unmount
  useEffect(() => {
    return () => {
      isPollingRef.current = false;
      if (pollingTimerRef.current) {
        clearTimeout(pollingTimerRef.current);
      }
    };
  }, []);

  // Submit recovery (.eml upload) to backend
  const submitRecoveryProof = useCallback(async () => {
    const owner = activeOwnerWallet;
    setProofSubmitError('');
    setProofSubmitSuccess('');

    if (!owner || !isValidStellarAddress(owner)) {
      setProofSubmitError(
        'Please enter a valid 56-character Stellar wallet address starting with G.'
      );
      return;
    }

    if (!getEffectiveAuthToken()) {
      setProofSubmitError('Please connect your wallet first to submit recovery proof.');
      openModal?.();
      return;
    }

    if (!emlRawFile) {
      setProofSubmitError('Please select and upload your downloaded raw .eml file first.');
      return;
    }

    setIsSubmittingProof(true);

    try {
      const backendResult = await requestRecoveryFromBackend({
        owner,
        file: emlRawFile,
      });

      const txHash = backendResult?.userOpTx || backendResult?.txHash || backendResult?.hash || '';

      if (txHash) {
        setLastTxHash(txHash);
      }

      setProofSubmitSuccess('Recovery request received! Verifying email proof on-chain...');

      // Record in store
      startRecoveryRequest({
        email: inputEmail || registeredEmail || '',
        targetWallet: owner,
        destinationAddress: destinationAddress || backendResult?.destination || '',
      });

      // Immediately poll once & begin polling loop
      await pollStatusOnce(owner);
      startPolling(owner);
    } catch (err: any) {
      console.error('Failed to submit recovery proof:', err);
      setProofSubmitError(
        parseContractError(err?.message || err) || 'Failed to submit recovery proof.'
      );
    } finally {
      setIsSubmittingProof(false);
    }
  }, [
    activeOwnerWallet,
    emlRawFile,
    destinationAddress,
    inputEmail,
    registeredEmail,
    startRecoveryRequest,
    pollStatusOnce,
    startPolling,
    openModal,
  ]);

  // Start tracking relayer email flow (without manual .eml upload)
  const startTrackingRelayerEmail = useCallback(async () => {
    const owner = activeOwnerWallet;
    setProofSubmitError('');
    setProofSubmitSuccess('');

    if (!owner || !isValidStellarAddress(owner)) {
      setProofSubmitError(
        'Please enter a valid 56-character Stellar wallet address starting with G.'
      );
      return;
    }

    if (!destinationAddress || !isValidStellarAddress(destinationAddress)) {
      setProofSubmitError(
        'Please enter a valid destination Stellar wallet address starting with G.'
      );
      return;
    }

    if (!getEffectiveAuthToken()) {
      setProofSubmitError(
        'Please connect your wallet first to track recovery progress with the relayer.'
      );
      openModal?.();
      return;
    }

    // Record in store
    startRecoveryRequest({
      email: inputEmail || registeredEmail || '',
      targetWallet: owner,
      destinationAddress,
    });

    // Query backend status and begin polling loop
    await pollStatusOnce(owner);
    startPolling(owner);
  }, [
    activeOwnerWallet,
    destinationAddress,
    inputEmail,
    registeredEmail,
    startRecoveryRequest,
    pollStatusOnce,
    startPolling,
    openModal,
  ]);

  // Execute recovery sweep
  const executeRecovery = useCallback(async () => {
    const owner = activeOwnerWallet;
    setErrorMessage('');

    if (!owner) {
      setErrorMessage('Owner wallet address is required.');
      return;
    }

    if (!getEffectiveAuthToken()) {
      setErrorMessage('Please connect your wallet first to execute recovery sweep.');
      openModal?.();
      return;
    }

    setIsExecutingRecovery(true);

    try {
      const result = await recoveryApi.executeRecovery(owner);
      const txHash =
        result?.userOpTx || result?.txHash || result?.hash || result?.transactionHash || '';

      if (txHash) {
        setLastTxHash(txHash);
      }

      // Refresh status immediately
      const refreshed = await pollStatusOnce(owner);
      if (refreshed?.status === 'COMPLETED' || txHash) {
        completeRestore(txHash);
        if (destinationAddress) {
          fetchWalletLedgerBalances(destinationAddress)
            .then(b => setDestinationBalances(b))
            .catch(() => {});
        }
        setIsSuccessModalOpen(true);
        options?.onSuccess?.();
      }
    } catch (err: any) {
      console.error('Failed to execute recovery:', err);
      setErrorMessage(
        parseContractError(err?.message || err) || 'Failed to execute recovery sweep.'
      );
    } finally {
      setIsExecutingRecovery(false);
    }
  }, [activeOwnerWallet, pollStatusOnce, completeRestore, destinationAddress, openModal, options]);

  // Auto-check status ONLY if activeOwnerWallet is valid AND token is available
  useEffect(() => {
    const token = getEffectiveAuthToken();
    setIsTokenMissing(!token);
    if (activeOwnerWallet && isValidStellarAddress(activeOwnerWallet) && token) {
      pollStatusOnce(activeOwnerWallet);
    }
  }, [activeOwnerWallet, pollStatusOnce]);

  const resetRecoveryFlow = useCallback(() => {
    stopPolling();
    setRecoveryStatus(null);
    setProofSubmitSuccess('');
    setProofSubmitError('');
    setErrorMessage('');
    setEmlRawFile(null);
    setEmlFileName('');
    setParsedEml(null);
    setInputTargetWallet('');
    setDestinationAddress('');
    setTargetBalances([]);
    setDestinationBalances([]);
    setLastTxHash('');
    useRecoveryStore.getState().clearRecoverySession('recover-get-started');
  }, [stopPolling]);

  const closeSuccessModal = useCallback(() => {
    setIsSuccessModalOpen(false);
    resetRecoveryFlow();
  }, [resetRecoveryFlow]);

  return {
    // Wallet & input state
    activeStellarWallet,
    activeOwnerWallet,
    inputTargetWallet,
    setInputTargetWallet,
    destinationAddress,
    setDestinationAddress,
    inputEmail,
    setInputEmail,
    targetRegistrationStatus,
    hasAuthToken: Boolean(getEffectiveAuthToken()),
    isTokenMissing,
    openConnectModal: openModal,

    // EML file state
    emlFileName,
    emlRawFile,
    parsedEml,
    isDraggingEml,
    setIsDraggingEml,
    showManualUpload,
    setShowManualUpload,
    handleEmlFileRead,

    // Balance preview
    targetBalances,
    isLoadingTargetBalances,
    targetWalletError,
    destinationBalances,
    isLoadingDestinationBalances,

    // Status & Polling
    recoveryStatus,
    statusNotice:
      pollNotice || (recoveryStatus?.status ? recoveryStatusNotice(recoveryStatus.status) : ''),
    isPolling,
    pollStatusOnce,
    startPolling,
    stopPolling,
    resetRecoveryFlow,

    // Actions & progress
    isSubmittingProof,
    proofSubmitError,
    proofSubmitSuccess,
    submitRecoveryProof,
    startTrackingRelayerEmail,

    isExecutingRecovery,
    executeRecovery,
    errorMessage,
    setErrorMessage,

    // Modal
    isSuccessModalOpen,
    closeSuccessModal,
    lastTxHash,
  };
}
