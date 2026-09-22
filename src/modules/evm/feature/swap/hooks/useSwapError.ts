import { useEffect } from 'react';
import type { MutableRefObject } from 'react';

export interface UseSwapErrorParams {
  swapError: any;
  bridgeErrorMsg: string | null;
  bridgeTxStatus: string;
  resetSwap: () => void;
  setBridgeErrorMsg: (msg: string | null) => void;
  setBridgeTxStatus: (status: 'signing' | 'idle' | 'success' | 'error' | 'preparing') => void;
  setIsWaitingForWallet: (v: boolean) => void;
  isSubmittingRef: MutableRefObject<boolean>;
}

/**
 * Consolidates the three error-handling `useEffect` blocks that were embedded in
 * `SwapAssets.tsx`:
 *
 *  1. Auto-clear hard execution errors after 5 s (user-rejection errors after 1.5 s).
 *  2. Clear any stale hard-status error when a new tx sequence starts.
 *  3. Force-unlock the submitting ref and wallet-wait flag on any error so the
 *     swap button recovers immediately.
 *
 * Soft quote errors (`currentQuote.error`) are intentionally NOT auto-cleared here —
 * those should persist until the user changes their asset selection.
 */
export function useSwapError(params: UseSwapErrorParams): void {
  const {
    swapError,
    bridgeErrorMsg,
    bridgeTxStatus,
    resetSwap,
    setBridgeErrorMsg,
    setBridgeTxStatus,
    setIsWaitingForWallet,
    isSubmittingRef,
  } = params;

  // --- Effect 1: auto-clear hard execution errors after a short delay ---
  // User-rejection errors clear faster (1.5 s) so the button recovers immediately.
  // Genuine failures stay visible for 5 s so the user has time to read them.
  useEffect(() => {
    if (!swapError && !bridgeErrorMsg) return;

    const isUserCancel = /user cancelled|user rejected|user denied|ACTION_REJECTED/i.test(
      (swapError || '') + (bridgeErrorMsg || '')
    );
    const delay = isUserCancel ? 1500 : 5000;

    const timeoutId = setTimeout(() => {
      if (swapError) resetSwap();
      if (bridgeErrorMsg) {
        setBridgeErrorMsg(null);
        setBridgeTxStatus('idle');
      }
    }, delay);

    return () => clearTimeout(timeoutId);
  }, [swapError, bridgeErrorMsg, resetSwap, setBridgeErrorMsg, setBridgeTxStatus]);

  // --- Effect 2: clear stale hard status when a separate error appears ---
  // e.g. swapError arrives while bridgeTxStatus is still 'error' from a prior run
  useEffect(() => {
    if (!swapError && !bridgeErrorMsg && bridgeTxStatus !== 'error') return;
    // Only act when bridgeTxStatus is already 'error' AND there's also a swapError;
    // normal bridge failures are handled by Effect 1 above.
    if (swapError && bridgeTxStatus === 'error') {
      setBridgeTxStatus('idle');
    }
  }, [swapError, bridgeTxStatus, setBridgeTxStatus, bridgeErrorMsg]);

  // --- Effect 3: force-unlock submitting gate and wallet-wait flag on any error ---
  // Prevents the button from being permanently disabled if an error bypasses the
  // finally block in handleUnifiedSwap (e.g. a thrown promise outside try/catch).
  useEffect(() => {
    if (swapError || bridgeErrorMsg || bridgeTxStatus === 'error') {
      setIsWaitingForWallet(false);
      isSubmittingRef.current = false;
    }
  }, [swapError, bridgeErrorMsg, bridgeTxStatus, setIsWaitingForWallet, isSubmittingRef]);
}
