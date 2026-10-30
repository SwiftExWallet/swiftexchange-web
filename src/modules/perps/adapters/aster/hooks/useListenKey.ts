import { useCallback, useEffect, useRef, useState } from 'react';

import type { Signer } from 'ethers';

import {
  LISTEN_KEY_KEEPALIVE_MS,
  createListenKey,
  deleteListenKey,
  keepaliveListenKey,
} from '../api/listenKey';

export function useListenKey(
  signer: Signer | null,
  userAddr: string | null
): {
  listenKey: string | null;
  error: Error | null;
  refresh: () => Promise<void>;
} {
  const [listenKey, setListenKey] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const keepaliveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isRefreshingRef = useRef<Promise<void> | null>(null);

  const active = !!signer && !!userAddr;

  const clearKeepalive = () => {
    if (keepaliveRef.current !== null) {
      clearInterval(keepaliveRef.current);
      keepaliveRef.current = null;
    }
  };

  const startKeepalive = () => {
    clearKeepalive();
    keepaliveRef.current = setInterval(async () => {
      if (!signer || !userAddr) return;
      try {
        await keepaliveListenKey(signer, userAddr);
      } catch (e) {
        console.error('[useListenKey] Keepalive failed, auto-refreshing key:', e);
        // Automatically renew listenKey on Aster error or keepalive failure (e.g. -1125: This listenKey does not exist)
        try {
          await refresh();
        } catch (refreshErr) {
          console.error(
            '[useListenKey] Failed to refresh listenKey after keepalive failure:',
            refreshErr
          );
        }
      }
    }, LISTEN_KEY_KEEPALIVE_MS);
  };

  const refresh = useCallback(async () => {
    if (!active || !signer || !userAddr) return;
    if (isRefreshingRef.current) return isRefreshingRef.current;

    const refreshPromise = (async () => {
      try {
        await deleteListenKey(signer, userAddr).catch(() => {});
        const key = await createListenKey(signer, userAddr);
        setListenKey(key);
        setError(null);
        startKeepalive();
      } catch (e) {
        setError(e instanceof Error ? e : new Error(String(e)));
        throw e;
      } finally {
        isRefreshingRef.current = null;
      }
    })();

    isRefreshingRef.current = refreshPromise;
    return refreshPromise;
  }, [active, signer, userAddr]);

  // Tab visibility and network recovery: verify/refresh listenKey when waking up
  useEffect(() => {
    if (!active || !signer || !userAddr) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && active && signer && userAddr) {
        keepaliveListenKey(signer, userAddr).catch(() => {
          // If keepalive fails when tab wakes up, refresh listenKey immediately
          refresh().catch(() => {});
        });
      }
    };

    const handleOnline = () => {
      if (active && signer && userAddr) {
        refresh().catch(() => {});
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnline);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
    };
  }, [active, signer, userAddr, refresh]);

  useEffect(() => {
    if (!active || !signer || !userAddr) return;

    let cancelled = false;

    createListenKey(signer, userAddr)
      .then(key => {
        if (cancelled) return;
        setListenKey(key);
        setError(null);
        startKeepalive();
      })
      .catch(e => {
        if (cancelled) return;
        setError(e instanceof Error ? e : new Error(String(e)));
      });

    return () => {
      cancelled = true;
      clearKeepalive();
      setListenKey(null);
      // Explicitly delete listenKey on unmount (PROD-04)
      if (signer && userAddr) {
        deleteListenKey(signer, userAddr).catch(() => {});
      }
    };
  }, [active, signer, userAddr]);

  return { listenKey, error, refresh };
}
