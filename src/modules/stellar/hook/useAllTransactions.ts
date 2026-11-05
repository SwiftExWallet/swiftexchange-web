import { useCallback, useEffect, useRef, useState } from 'react';

import * as StellarSDK from '@stellar/stellar-sdk';

import { useWalletStore } from '../../walletconnect/store/walletConnectStore';
import { AQUARIUS_MAINNET_ROUTER, AQUARIUS_TESTNET_ROUTER } from '../service/aquariusService';
import { TradeTransactionService } from '../service/tradeTransactionService';
import type { TransactionType, UnifiedTransaction } from '../types/allTransaction.types';

interface UseAllTransactionsProps {
  userAddress?: string;
  category?: TransactionType | 'ALL';
}

export function useAllTransactions({ userAddress, category }: UseAllTransactionsProps) {
  const currentNetwork = useWalletStore(state => state.network);
  const [service, setService] = useState(() => new TradeTransactionService());

  const cacheRef = useRef<
    Record<
      string,
      {
        transactions: UnifiedTransaction[];
        pagination: { hasMore: boolean; cursor?: string };
      }
    >
  >({});

  useEffect(() => {
    cacheRef.current = {};
    setService(new TradeTransactionService());
  }, [currentNetwork, userAddress]);

  const [transactions, setTransactions] = useState<UnifiedTransaction[]>([]);
  const [pagination, setPagination] = useState<{ hasMore: boolean; cursor?: string }>({
    hasMore: false,
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const mapOperationToTransaction = useCallback(
    (op: any, accountId: string): UnifiedTransaction | null => {
      const base = {
        id: op.id,
        date: op.created_at,
        isSuccess: op.transaction_successful,
        hash: op.transaction_hash,
      };

      if (op.type === 'payment') {
        const from = op.from || op.source_account;
        const to = op.to || op.into;
        const memo = op.transaction_attr?.memo || op.memo;
        const isNumericMemo = memo && /^\d+$/.test(memo);

        if (from === accountId && to !== accountId) {
          if (isNumericMemo) {
            return {
              ...base,
              type: 'BRIDGE',
              assetCode: op.asset_type === 'native' ? 'XLM' : op.asset_code,
              amount: op.amount,
              to: to,
              memo: memo,
              details: 'Withdrawal (via NEAR Intent)',
            };
          }
          return {
            ...base,
            type: 'SEND',
            assetCode: op.asset_type === 'native' ? 'XLM' : op.asset_code,
            amount: op.amount,
            to: to,
            memo: memo,
          };
        } else if (to === accountId) {
          if (isNumericMemo) {
            return {
              ...base,
              type: 'BRIDGE',
              assetCode: op.asset_type === 'native' ? 'XLM' : op.asset_code,
              amount: op.amount,
              from: from,
              memo: memo,
              details: 'Deposit (via NEAR Intent)',
            };
          }
          return {
            ...base,
            type: 'RECEIVE',
            assetCode: op.asset_type === 'native' ? 'XLM' : op.asset_code,
            amount: op.amount,
            from: from,
            memo: memo,
          };
        }
      }

      if (op.type === 'create_account') {
        if (op.account === accountId) {
          return {
            ...base,
            type: 'RECEIVE',
            assetCode: 'XLM',
            amount: op.starting_balance,
            from: op.source_account,
            details: 'Account Created',
          };
        } else if (op.source_account === accountId || op.funder === accountId) {
          return {
            ...base,
            type: 'SEND',
            assetCode: 'XLM',
            amount: op.starting_balance,
            to: op.account,
            details: 'Account Funded / Created',
          };
        }
      }

      if (op.type === 'account_merge') {
        if (op.account === accountId) {
          return {
            ...base,
            type: 'SEND',
            assetCode: 'XLM',
            to: op.into,
            details: 'Account Merged',
          };
        } else if (op.into === accountId) {
          return {
            ...base,
            type: 'RECEIVE',
            assetCode: 'XLM',
            from: op.account,
            details: 'Account Merged Into',
          };
        }
      }

      if (op.type === 'path_payment_strict_send' || op.type === 'path_payment_strict_receive') {
        const fromAsset = op.source_asset_type === 'native' ? 'XLM' : op.source_asset_code;
        const toAsset = op.asset_type === 'native' ? 'XLM' : op.asset_code;
        return {
          ...base,
          type: 'TRADE',
          fromAsset,
          toAsset,
          fromAmount: op.source_amount,
          toAmount: op.amount,
          path: op.path || [fromAsset, toAsset],
          details: 'via Horizon AMM',
        };
      }

      if (op.type === 'invoke_host_function') {
        let contractId = (op as any).contract_id || (op as any).contract || '';
        let functionName = '';
        let sorobanFrom = '';
        let sorobanTo = '';
        let sorobanAmount = '';

        if (Array.isArray(op.parameters) && op.parameters.length > 0) {
          try {
            const raw0 = op.parameters[0]?.value || op.parameters[0];
            if (raw0 && typeof raw0 === 'string') {
              const v0 = StellarSDK.xdr.ScVal.fromXDR(raw0, 'base64');
              const val0 = StellarSDK.scValToNative(v0);
              if (typeof val0 === 'string') contractId = val0;
              else if (
                val0 &&
                typeof val0 === 'object' &&
                typeof (val0 as any).toString === 'function'
              ) {
                contractId = (val0 as any).toString();
              }
            }
          } catch {
            // Ignore parse errors for optional ScVal parameters
          }
          try {
            const raw1 = op.parameters[1]?.value || op.parameters[1];
            if (raw1 && typeof raw1 === 'string') {
              const v1 = StellarSDK.xdr.ScVal.fromXDR(raw1, 'base64');
              const val1 = StellarSDK.scValToNative(v1);
              if (typeof val1 === 'string') functionName = val1;
              else if (
                val1 &&
                typeof val1 === 'object' &&
                typeof (val1 as any).toString === 'function'
              ) {
                functionName = (val1 as any).toString();
              }
            }
          } catch {
            // Ignore parse errors for optional ScVal parameters
          }

          if (op.parameters.length >= 4) {
            try {
              const raw2 = op.parameters[2]?.value || op.parameters[2];
              if (raw2 && typeof raw2 === 'string') {
                const v2 = StellarSDK.scValToNative(StellarSDK.xdr.ScVal.fromXDR(raw2, 'base64'));
                sorobanFrom = typeof v2 === 'string' ? v2 : (v2 as any)?.toString?.() || '';
              }
            } catch {
              // Ignore parse errors for optional ScVal parameters
            }
            try {
              const raw3 = op.parameters[3]?.value || op.parameters[3];
              if (raw3 && typeof raw3 === 'string') {
                const v3 = StellarSDK.scValToNative(StellarSDK.xdr.ScVal.fromXDR(raw3, 'base64'));
                sorobanTo = typeof v3 === 'string' ? v3 : (v3 as any)?.toString?.() || '';
              }
            } catch {
              // Ignore parse errors for optional ScVal parameters
            }
            if (op.parameters.length >= 5) {
              try {
                const raw4 = op.parameters[4]?.value || op.parameters[4];
                if (raw4 && typeof raw4 === 'string') {
                  const v4 = StellarSDK.scValToNative(StellarSDK.xdr.ScVal.fromXDR(raw4, 'base64'));
                  if (typeof v4 === 'bigint' || typeof v4 === 'number') {
                    sorobanAmount = (Number(v4) / 10000000).toFixed(4);
                  }
                }
              } catch {
                // Ignore parse errors for optional ScVal parameters
              }
            }
          }
        }

        let protocol = '';
        if (
          contractId === AQUARIUS_MAINNET_ROUTER ||
          contractId === AQUARIUS_TESTNET_ROUTER ||
          functionName === 'swap_chained'
        ) {
          protocol = 'Aquarius';
        } else if (
          functionName === 'swap_exact_tokens_for_tokens' ||
          functionName === 'swap_tokens_for_exact_tokens' ||
          functionName.startsWith('swap')
        ) {
          protocol = 'Soroswap';
        }

        const changes = op.asset_balance_changes || [];
        const outgoing = changes.filter((c: any) => c.from === accountId);
        const incoming = changes.filter((c: any) => c.to === accountId);

        if (outgoing.length > 0 && incoming.length > 0) {
          const outAsset =
            outgoing[0].asset_type === 'native' ? 'XLM' : outgoing[0].asset_code || 'XLM';
          const outAmount = outgoing
            .reduce((s: number, c: any) => s + Number(c.amount || 0), 0)
            .toFixed(7);

          const inAsset =
            incoming[0].asset_type === 'native' ? 'XLM' : incoming[0].asset_code || 'XLM';
          const inAmount = incoming
            .reduce((s: number, c: any) => s + Number(c.amount || 0), 0)
            .toFixed(7);

          return {
            ...base,
            type: 'TRADE',
            fromAsset: outAsset,
            toAsset: inAsset,
            fromAmount: outAmount,
            toAmount: inAmount,
            path: [outAsset, inAsset],
            contractId: contractId || undefined,
            functionName: functionName || undefined,
            protocol: protocol || undefined,
            details: protocol ? `via ${protocol}` : 'Soroban Swap',
          };
        }

        if (functionName === 'transfer' || functionName === 'transfer_from') {
          if (sorobanFrom === accountId && sorobanTo !== accountId) {
            return {
              ...base,
              type: 'SEND',
              assetCode: outgoing[0]?.asset_code || 'Tokens',
              amount:
                sorobanAmount || (outgoing[0] ? Number(outgoing[0].amount).toFixed(4) : op.amount),
              to: sorobanTo,
              contractId: contractId || undefined,
              functionName,
              protocol: protocol || undefined,
              details: protocol ? `via ${protocol}` : 'Token Transfer',
            };
          }
          if (sorobanTo === accountId) {
            return {
              ...base,
              type: 'RECEIVE',
              assetCode: incoming[0]?.asset_code || 'Tokens',
              amount:
                sorobanAmount || (incoming[0] ? Number(incoming[0].amount).toFixed(4) : op.amount),
              from: sorobanFrom,
              contractId: contractId || undefined,
              functionName,
              protocol: protocol || undefined,
              details: protocol ? `via ${protocol}` : 'Token Received',
            };
          }
        }

        if (incoming.length > 0) {
          const inAsset =
            incoming[0].asset_type === 'native' ? 'XLM' : incoming[0].asset_code || 'XLM';
          const inAmount = incoming
            .reduce((s: number, c: any) => s + Number(c.amount || 0), 0)
            .toFixed(7);

          const isBridge = functionName === 'withdraw';
          return {
            ...base,
            type: isBridge ? 'BRIDGE' : 'RECEIVE',
            assetCode: inAsset,
            amount: inAmount,
            contractId: contractId || undefined,
            functionName: functionName || undefined,
            protocol: protocol || undefined,
            details: isBridge
              ? 'Deposit Bridge'
              : protocol
                ? `via ${protocol}`
                : functionName
                  ? `Call ${functionName}`
                  : 'Contract Interaction',
          };
        }

        if (outgoing.length > 0) {
          const outAsset =
            outgoing[0].asset_type === 'native' ? 'XLM' : outgoing[0].asset_code || 'XLM';
          const outAmount = outgoing
            .reduce((s: number, c: any) => s + Number(c.amount || 0), 0)
            .toFixed(7);

          const isBridge = functionName === 'deposit_for_burn' || functionName === 'deposit';
          return {
            ...base,
            type: isBridge ? 'BRIDGE' : 'SEND',
            assetCode: outAsset,
            amount: outAmount,
            contractId: contractId || undefined,
            functionName: functionName || undefined,
            protocol: protocol || undefined,
            details: isBridge
              ? 'Bridge Deposit'
              : protocol
                ? `via ${protocol}`
                : functionName
                  ? `Call ${functionName}`
                  : 'Contract Interaction',
          };
        }

        return {
          ...base,
          type: 'CONTRACT',
          contractId: contractId || undefined,
          functionName: functionName || undefined,
          protocol: protocol || undefined,
          details: functionName
            ? `Call ${functionName}()`
            : contractId
              ? `Contract ${contractId.slice(0, 4)}...${contractId.slice(-4)}`
              : 'Smart Contract Call',
        };
      }

      if (op.type === 'extend_footprint_ttl' || op.type === 'restore_footprint') {
        return {
          ...base,
          type: 'CONTRACT',
          details:
            op.type === 'extend_footprint_ttl' ? 'Extend Contract TTL' : 'Restore Contract State',
        };
      }

      if (op.type === 'set_options') {
        return {
          ...base,
          type: 'OTHER',
          details: 'Account Options Updated',
        };
      }

      if (
        op.type === 'manage_sell_offer' ||
        op.type === 'manage_buy_offer' ||
        op.type === 'create_passive_sell_offer'
      ) {
        return {
          ...base,
          type: 'TRADE',
          sellAsset: op.selling_asset_type === 'native' ? 'XLM' : op.selling_asset_code || 'XLM',
          buyAsset: op.buying_asset_type === 'native' ? 'XLM' : op.buying_asset_code || 'XLM',
          sellAmount: op.amount || '0',
          buyAmount: '0',
          price: op.price,
          offerId: op.offer_id,
          details: 'Order Book',
        };
      }

      if (op.type === 'change_trust') {
        return {
          ...base,
          type: 'TRUST',
          assetCode: op.asset_type === 'native' ? 'XLM' : op.asset_code,
          limit: op.limit,
          trustee: op.trustee,
          trustor: op.trustor,
          details: `Trustline ${parseFloat(op.limit) > 0 ? 'Set' : 'Removed'}`,
        };
      }

      if (op.type === 'create_claimable_balance') {
        const assetParts = (op.asset || '').split(':');
        const assetCode =
          assetParts.length > 1 ? assetParts[0] : op.asset === 'native' ? 'XLM' : 'Unknown';

        return {
          ...base,
          type: 'CLAIMABLE',
          assetCode: assetCode,
          amount: op.amount,
          sponsor: op.sponsor,
          claimants: op.claimants,
          details: 'Claimable Balance Created',
        };
      }

      if (op.type === 'claim_claimable_balance') {
        return {
          ...base,
          type: 'CLAIMABLE',
          details: 'Claimable Balance Claimed',
        };
      }

      return {
        ...base,
        type: 'OTHER',
        details: op.type,
      };
    },
    []
  );

  const categoryKey = category === 'SEND' || category === 'RECEIVE' ? 'PAYMENTS' : 'ALL';

  const fetchTransactions = useCallback(
    async (cursor?: string) => {
      if (!userAddress) {
        setIsLoading(false);
        setIsLoadingMore(false);
        return;
      }

      if (cursor) {
        setIsLoadingMore(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      try {
        const { operations, nextCursor, hasMore } = await service.getAllOperations(
          userAddress,
          50,
          cursor,
          categoryKey
        );

        const mapped = operations
          .map(op => mapOperationToTransaction(op, userAddress))
          .filter((tx): tx is UnifiedTransaction => tx !== null);

        setTransactions(prev => {
          const next = cursor ? [...prev, ...mapped] : mapped;
          cacheRef.current[categoryKey] = {
            transactions: next,
            pagination: { cursor: nextCursor, hasMore },
          };
          return next;
        });
        setPagination({ cursor: nextCursor, hasMore });
      } catch (err) {
        console.error('Failed to fetch transactions', err);
        setError('Failed to load transaction history');
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [userAddress, service, mapOperationToTransaction, categoryKey]
  );

  useEffect(() => {
    if (!userAddress) {
      setIsLoading(false);
      return;
    }

    if (cacheRef.current[categoryKey]) {
      setTransactions(cacheRef.current[categoryKey].transactions);
      setPagination(cacheRef.current[categoryKey].pagination);
      setIsLoading(false);
    } else {
      fetchTransactions();
    }
  }, [userAddress, categoryKey, fetchTransactions]);

  const loadMore = useCallback(() => {
    if (pagination.hasMore && pagination.cursor && !isLoadingMore) {
      fetchTransactions(pagination.cursor);
    }
  }, [pagination.hasMore, pagination.cursor, isLoadingMore, fetchTransactions]);

  const refresh = useCallback(() => {
    cacheRef.current[categoryKey] = undefined as any;
    fetchTransactions();
  }, [categoryKey, fetchTransactions]);

  return {
    transactions,
    isLoading,
    isLoadingMore,
    error,
    hasMore: pagination.hasMore,
    loadMore,
    refresh,
  };
}
