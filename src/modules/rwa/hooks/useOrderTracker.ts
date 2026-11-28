import { useCallback, useEffect, useState } from 'react';

import { fetchApiResponseFromProxy } from '@/service/apiService';

import { tokenBalance } from '../api/balances';
import { CHAIN_INFO } from '../config/rwaConfig';
import { applyUpdate, isFinal, readStatusResponse } from '../orders/orderState';
import { loadOrders, upsertOrder } from '../orders/orderStore';
import type { RwaOrderRecord } from '../types/rwa.types';

export const useOrderTracker = (wallet: string | null | undefined, onFilled?: () => void) => {
  const [orders, setOrders] = useState<RwaOrderRecord[]>(() => loadOrders(wallet));

  const reload = useCallback(() => {
    setOrders(loadOrders(wallet));
  }, [wallet]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    if (!wallet) return;
    const open = orders.filter(r => !isFinal(r.stage) && r.orderHash);
    if (!open.length) return;

    let cancelled = false;
    const poll = async () => {
      for (const rec of open) {
        if (cancelled) return;
        try {
          const chain = CHAIN_INFO[rec.chain].backend;
          const [statusRes, outBal] = await Promise.all([
            fetchApiResponseFromProxy<any>(
              `/swap/1inch/orderStatus?chain=${chain}&orderHash=${rec.orderHash}&swapProvider=1inch`,
              'GET'
            ).catch(() => null),
            tokenBalance(rec.chain, rec.outToken, wallet).catch(() => null),
          ]);
          const { status, fillTx } = readStatusResponse(statusRes?.data || statusRes);
          const next = applyUpdate(rec, { status, fillTx, outBalance: outBal });
          if (next.stage !== rec.stage || next.fillTx !== rec.fillTx) {
            upsertOrder(wallet, next);
            if (!cancelled) setOrders(loadOrders(wallet));
            if (next.stage === 'filled' && onFilled) onFilled();
          }
        } catch {
          // ignore transient poll errors
        }
      }
    };

    const timer = setInterval(poll, 4000);
    poll();
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [wallet, orders, onFilled]);

  return { orders, reload };
};
