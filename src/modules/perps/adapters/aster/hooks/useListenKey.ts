import { useCallback, useEffect, useRef, useState } from 'react';

import type { Signer } from 'ethers';

import { isAsterDepositRequiredError, isAsterNoAgentError } from '../api/errors';
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
        if (isAsterDepositRequiredError(e) || isAsterNoAgentError(e)) {
          clearKeepalive();
          setListenKey(null);
          return;
        }
        try {
          await refresh();
        } catch {
          void 0;
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
      } catch (e: any) {
        if (isAsterDepositRequiredError(e) || isAsterNoAgentError(e)) {
          setListenKey(null);
          clearKeepalive();
          return;
        }
        setError(e instanceof Error ? e : new Error(String(e)));
        throw e;
      } finally {
        isRefreshingRef.current = null;
      }
    })();

    isRefreshingRef.current = refreshPromise;
    return refreshPromise;
  }, [active, signer, userAddr]);

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
    };
  }, [active, signer, userAddr]);

  return { listenKey, error, refresh };
}
