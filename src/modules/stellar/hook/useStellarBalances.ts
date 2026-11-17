import { useCallback, useEffect, useMemo, useState } from 'react';

import { Horizon } from '@stellar/stellar-sdk';
import BigNumber from 'bignumber.js';

import { getStellarConfig } from '../../walletconnect/config/chains';
import { useWalletStore } from '../../walletconnect/store/walletConnectStore';
import { StellarBaseService, getStellarExpertTestnetValueUrl } from '../service/StellarBaseService';

interface UseStellarBalancesReturn {
  balances: any[];
  loading: boolean;
  error: Error | null;
  server: Horizon.Server | null;
  refetch: () => Promise<void>;
}

export const useStellarBalances = (publicKey?: string): UseStellarBalancesReturn => {
  const [balances, setBalances] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const currentNetwork = useWalletStore(state => state.network);

  const server = useMemo(() => {
    const config = getStellarConfig(currentNetwork);
    if (!config) return null;
    return StellarBaseService.getOrCreateServer(config.horizonUrl);
  }, [currentNetwork]);

  const fetchBalances = useCallback(async () => {
    if (!publicKey) {
      setLoading(false);
      return;
    }

    setLoading(true);
    if (currentNetwork !== 'mainnet') {
      try {
        const res = await fetch(getStellarExpertTestnetValueUrl(publicKey));
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data?.balances) && data.balances.length > 0) {
            const mapped = data.balances.map((b: any) => ({
              asset_type: b.asset === 'XLM' ? 'native' : 'credit_alphanum4',
              asset_code: b.asset === 'XLM' ? 'XLM' : b.asset.slice(0, 4),
              balance: new BigNumber(b.balance).dividedBy(1e7).toString(),
            }));
            setBalances(mapped);
            setError(null);
            setLoading(false);
            return;
          }
        }
      } catch (err: any) {
        console.warn('Failed to fetch testnet balances from stellar.expert:', err);
      }
      if (server) {
        try {
          const account = await server.loadAccount(publicKey);
          setBalances(account.balances);
          setError(null);
        } catch (err: any) {
          if (err?.response?.status === 404 || err?.status === 404) {
            setBalances([]);
            setError(null);
          } else {
            setError(err as Error);
            setBalances([]);
          }
        } finally {
          setLoading(false);
        }
        return;
      }
      setBalances([]);
      setError(null);
      setLoading(false);
      return;
    }

    if (!server) {
      setLoading(false);
      return;
    }

    try {
      const account = await server.loadAccount(publicKey);
      setBalances(account.balances);
      setError(null);
    } catch (err: any) {
      if (err?.response?.status === 404 || err?.status === 404) {
        setBalances([]);
        setError(null);
      } else {
        setError(err as Error);
        setBalances([]);
      }
    } finally {
      setLoading(false);
    }
  }, [publicKey, server, currentNetwork]);

  useEffect(() => {
    fetchBalances();
  }, [fetchBalances]);

  return { balances, loading, error, server, refetch: fetchBalances };
};
