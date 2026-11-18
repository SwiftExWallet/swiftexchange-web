import {
  AlertCircle,
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Check,
  Copy,
  Cpu,
  ExternalLink,
  Eye,
  FileQuestion,
  FileText,
  Gift,
  Layers,
  Loader2,
  Search,
  Shield,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { WalletType } from '../../walletconnect/constants/Wallet';
import { useWalletConnect } from '../../walletconnect/hooks/useWalletConnect';
import { useWalletStore } from '../../walletconnect/store/walletConnectStore';
import { useStellarHistory } from '../hook/useStellarHistory';
import type { UnifiedTransaction } from '../types/allTransaction.types';
import type { StellarHistoryTab } from '../utils/stellarHistoryFilter';

interface AllTransactionsUIProps {
  embedded?: boolean;
}

const filterOptions: { label: string; value: StellarHistoryTab }[] = [
  { label: 'All', value: 'all' },
  { label: 'Send', value: 'send' },
  { label: 'Receive', value: 'receive' },
  { label: 'Trade', value: 'trade' },
  { label: 'Trustline', value: 'trustline' },
  { label: 'Claimable', value: 'claimable' },
  { label: 'Bridge', value: 'bridge' },
  { label: 'Contract', value: 'contract' },
];

const SkeletonRows = () => (
  <>
    {[1, 2, 3, 4].map(i => (
      <tr key={i} className="animate-pulse border-b border-white/5">
        <td className="px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-white/10 shrink-0" />
            <div className="h-4 w-20 bg-white/10 rounded" />
          </div>
        </td>
        <td className="px-6 py-4">
          <div className="h-4 w-40 bg-white/10 rounded" />
        </td>
        <td className="px-6 py-4">
          <div className="h-4 w-24 bg-white/10 rounded" />
        </td>
        <td className="px-6 py-4">
          <div className="h-3 w-28 bg-white/5 rounded" />
        </td>
        <td className="px-6 py-4 text-right">
          <div className="h-7 w-16 bg-white/10 rounded ml-auto" />
        </td>
      </tr>
    ))}
  </>
);

const SkeletonCards = () => (
  <div className="space-y-2 p-1">
    {[1, 2, 3, 4].map(i => (
      <div
        key={i}
        className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/5 animate-pulse"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-white/10 shrink-0" />
          <div className="space-y-2">
            <div className="h-4 w-28 bg-white/10 rounded" />
            <div className="h-3 w-40 bg-white/5 rounded" />
          </div>
        </div>
        <div className="space-y-2 flex flex-col items-end">
          <div className="h-4 w-20 bg-white/10 rounded" />
          <div className="h-3 w-12 bg-white/5 rounded" />
        </div>
      </div>
    ))}
  </div>
);

const AllTransactionsUI = ({ embedded = false }: AllTransactionsUIProps) => {
  const { connectedWallets, openModal } = useWalletConnect();
  const network = useWalletStore(state => state.network);
  const stellarWallet = connectedWallets[WalletType.STELLAR];
  const stellarAddress = stellarWallet?.address || '';

  const [dateFilter, setDateFilter] = useState<'ALL' | '7D' | '30D' | 'CUSTOM'>('ALL');
  const [customDate, setCustomDate] = useState<{ start: string; end: string }>({
    start: '',
    end: '',
  });

  const { items, tab, setTab, loading, done, sentinelRef } = useStellarHistory(stellarAddress);

  const [selectedTx, setSelectedTx] = useState<UnifiedTransaction | null>(null);
  const [copiedHash, setCopiedHash] = useState(false);
  const [isIframeLoading, setIsIframeLoading] = useState(true);

  useEffect(() => {
    if (selectedTx) {
      setIsIframeLoading(true);
    }
  }, [selectedTx]);

  const handleCopyHash = (hash: string) => {
    navigator.clipboard.writeText(hash);
    setCopiedHash(true);
    setTimeout(() => setCopiedHash(false), 2000);
  };

  const filteredTransactions = useMemo(() => {
    if (dateFilter === 'ALL') return items;
    return items.filter(tx => {
      const txDate = new Date(tx.date).getTime();
      const now = Date.now();
      const oneDay = 24 * 60 * 60 * 1000;

      if (dateFilter === '7D') {
        return now - txDate <= 7 * oneDay;
      }
      if (dateFilter === '30D') {
        return now - txDate <= 30 * oneDay;
      }
      if (dateFilter === 'CUSTOM' && customDate.start && customDate.end) {
        const start = new Date(customDate.start).getTime();
        const end = new Date(customDate.end).getTime() + oneDay - 1;
        return txDate >= start && txDate <= end;
      }
      return true;
    });
  }, [items, dateFilter, customDate]);

  if (!stellarWallet) {
    if (embedded) {
      return (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 bg-tertiary rounded-full flex items-center justify-center mb-4 text-muted">
            <AlertCircle size={32} />
          </div>
          <h3 className="text-lg font-bold text-primary mb-2">Wallet Not Connected</h3>
          <p className="text-muted text-sm max-w-xs mb-4">
            Please connect your Stellar wallet to view your transaction history.
          </p>
          <button
            onClick={openModal}
            className="btn btn-primary px-5 py-2.5 rounded-xl font-semibold text-sm shadow-md cursor-pointer"
          >
            Connect Stellar Wallet
          </button>
        </div>
      );
    }
    return (
      <div className="bg-secondary rounded-xl border border-border/50 p-6 h-full flex flex-col items-center justify-center text-center">
        <div className="w-16 h-16 rounded-full bg-warning/10 flex items-center justify-center mb-4">
          <AlertCircle className="w-8 h-8 text-warning" />
        </div>
        <h4 className="heading-4 mb-2">Connect Wallet</h4>
        <p className="text-muted max-w-xs mx-auto mb-4">
          Please connect your Stellar wallet to view your transaction history.
        </p>
        <button
          onClick={openModal}
          className="btn btn-primary px-5 py-2.5 rounded-xl font-semibold text-sm shadow-md cursor-pointer"
        >
          Connect Stellar Wallet
        </button>
      </div>
    );
  }

  const getIcon = (tx: UnifiedTransaction) => {
    switch (tx.type) {
      case 'SEND':
        return <ArrowUpRight className="w-4 h-4 text-warning" />;
      case 'RECEIVE':
        return <ArrowDownLeft className="w-4 h-4 text-success" />;
      case 'TRADE':
        return <ArrowLeftRight className="w-4 h-4 text-primary" />;
      case 'BRIDGE':
        return tx.details?.toLowerCase().includes('withdrawal') ? (
          <ArrowUpRight className="w-4 h-4 text-warning" />
        ) : (
          <Layers className="w-4 h-4 text-info" />
        );
      case 'TRUST':
        return <Shield className="w-4 h-4 text-purple-400" />;
      case 'CLAIMABLE':
        return <Gift className="w-4 h-4 text-pink-400" />;
      case 'CONTRACT':
        return <Cpu className="w-4 h-4 text-cyan-400" />;
      case 'OTHER':
        return <FileText className="w-4 h-4 text-muted" />;
      default:
        return <FileQuestion className="w-4 h-4 text-muted" />;
    }
  };

  const getIconBgClass = (tx: UnifiedTransaction) => {
    switch (tx.type) {
      case 'SEND':
        return 'bg-warning/10 border-warning/20';
      case 'RECEIVE':
        return 'bg-success/10 border-success/20';
      case 'TRUST':
        return 'bg-purple-400/10 border-purple-400/20';
      case 'CLAIMABLE':
        return 'bg-pink-400/10 border-pink-400/20';
      case 'CONTRACT':
        return 'bg-cyan-500/10 border-cyan-500/20';
      case 'OTHER':
        return 'bg-white/5 border-white/10';
      case 'BRIDGE':
        return tx.details?.toLowerCase().includes('withdrawal')
          ? 'bg-warning/10 border-warning/20'
          : 'bg-info/10 border-info/20';
      default:
        return 'bg-primary/10 border-primary/20';
    }
  };

  const getLabel = (tx: UnifiedTransaction) => {
    switch (tx.type) {
      case 'SEND':
        return 'Send';
      case 'RECEIVE':
        return 'Receive';
      case 'TRADE':
        return tx.path || tx.fromAsset ? 'Swap' : 'Order Book';
      case 'BRIDGE':
        return tx.details?.includes('Deposit')
          ? 'Deposit Bridge'
          : tx.details?.includes('Withdrawal')
            ? 'Withdrawal'
            : 'Bridge';
      case 'TRUST':
        return 'Trustline';
      case 'CLAIMABLE':
        return 'Claimable Balance';
      case 'CONTRACT':
        return tx.protocol ? `${tx.protocol} Call` : 'Contract Call';
      case 'OTHER':
        return tx.details || 'Transaction';
      default:
        return 'Transaction';
    }
  };

  const renderDescription = (tx: UnifiedTransaction) => {
    if (tx.type === 'TRADE') {
      if (tx.fromAsset && tx.toAsset) {
        return (
          <div className="flex flex-col">
            <span className="font-semibold text-text-primary text-sm flex items-center gap-1.5">
              <span>{tx.fromAsset}</span>
              <span className="text-muted text-xs">&rarr;</span>
              <span>{tx.toAsset}</span>
            </span>
            {tx.details && (
              <span className="text-xs text-brand-primary/80 font-medium">{tx.details}</span>
            )}
          </div>
        );
      }
      return (
        <div className="flex flex-col">
          <span className="text-sm font-medium text-text-primary">
            Sell {tx.sellAsset} for {tx.buyAsset}
          </span>
          {tx.details && <span className="text-xs text-muted">{tx.details}</span>}
        </div>
      );
    }

    if (tx.type === 'BRIDGE') {
      return (
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-text-primary">
            {tx.details || 'Bridge Transfer'}
          </span>
          {tx.memo && <span className="text-xs text-muted font-mono">Memo: {tx.memo}</span>}
        </div>
      );
    }

    if (tx.type === 'SEND') {
      return (
        <div className="flex flex-col">
          <span className="text-sm text-text-primary">
            To: {tx.to ? `${tx.to.substring(0, 4)}...${tx.to.substring(52)}` : 'Unknown'}
          </span>
          {tx.memo && <span className="text-xs text-muted font-mono">Memo: {tx.memo}</span>}
        </div>
      );
    }

    if (tx.type === 'RECEIVE') {
      return (
        <div className="flex flex-col">
          <span className="text-sm text-text-primary">
            From: {tx.from ? `${tx.from.substring(0, 4)}...${tx.from.substring(52)}` : 'Unknown'}
          </span>
          {tx.memo && <span className="text-xs text-muted font-mono">Memo: {tx.memo}</span>}
        </div>
      );
    }

    if (tx.type === 'TRUST') {
      return (
        <span className="text-sm text-muted">
          {tx.limit && parseFloat(tx.limit) > 0
            ? `Set Trustline for ${tx.assetCode}`
            : `Remove Trustline for ${tx.assetCode}`}
        </span>
      );
    }

    if (tx.type === 'CLAIMABLE') {
      return <span className="text-sm text-muted">{tx.details || 'Claimable Balance'}</span>;
    }

    if (tx.type === 'CONTRACT') {
      return (
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-text-primary font-mono flex items-center gap-1.5">
            {tx.functionName ? `${tx.functionName}()` : tx.details || 'Smart Contract Call'}
          </span>
          <span className="text-xs text-muted flex items-center gap-1.5 mt-0.5">
            {tx.protocol && <span className="text-cyan-400 font-medium">via {tx.protocol}</span>}
            {tx.contractId && (
              <span className="font-mono opacity-70">
                {tx.contractId.slice(0, 4)}...{tx.contractId.slice(-4)}
              </span>
            )}
          </span>
        </div>
      );
    }

    if (tx.type === 'OTHER') {
      return (
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-text-primary">
            {tx.details || 'Operation'}
          </span>
          <span className="text-xs text-muted">Stellar Network Operation</span>
        </div>
      );
    }

    return <span className="text-sm text-muted">{tx.details || 'Transaction'}</span>;
  };

  const renderAmount = (tx: UnifiedTransaction) => {
    if (tx.type === 'TRADE') {
      if (tx.fromAmount && tx.toAmount && tx.fromAsset && tx.toAsset) {
        return (
          <div className="flex flex-col items-start gap-0.5">
            <span className="text-sm font-semibold text-success font-mono">
              +{parseFloat(tx.toAmount).toFixed(4)} {tx.toAsset}
            </span>
            <span className="text-xs text-muted font-mono">
              -{parseFloat(tx.fromAmount).toFixed(4)} {tx.fromAsset}
            </span>
          </div>
        );
      }
      if (tx.toAmount && tx.toAsset) {
        return (
          <span className="text-sm font-semibold text-success font-mono">
            +{parseFloat(tx.toAmount).toFixed(4)} {tx.toAsset}
          </span>
        );
      }
      return (
        <div className="flex flex-col items-start gap-0.5">
          <span className="text-sm font-medium text-text-primary font-mono">
            {parseFloat(tx.sellAmount || '0').toFixed(4)} {tx.sellAsset}
          </span>
          <span className="text-xs text-muted font-mono">
            @ {parseFloat(tx.price || '0').toFixed(7)} {tx.buyAsset}
          </span>
        </div>
      );
    }

    if (tx.type === 'SEND') {
      return (
        <span className="text-sm font-semibold text-warning font-mono">
          -{parseFloat(tx.amount || '0').toFixed(4)} {tx.assetCode}
        </span>
      );
    }

    if (tx.type === 'RECEIVE') {
      return (
        <span className="text-sm font-semibold text-success font-mono">
          +{parseFloat(tx.amount || '0').toFixed(4)} {tx.assetCode}
        </span>
      );
    }

    if (tx.type === 'BRIDGE') {
      const isWithdrawal =
        tx.details?.toLowerCase().includes('withdrawal') ||
        tx.details?.toLowerCase().includes('intent');
      if (tx.amount && tx.amount !== 'N/A') {
        const sign = isWithdrawal ? '-' : '+';
        const color = isWithdrawal ? 'text-warning' : 'text-success';
        return (
          <span className={`text-sm font-semibold ${color} font-mono`}>
            {sign}
            {parseFloat(tx.amount).toFixed(4)} {tx.assetCode !== 'N/A' ? tx.assetCode : ''}
          </span>
        );
      }
      return <span className="text-sm text-info font-medium">{tx.details || 'Bridge'}</span>;
    }

    if (tx.type === 'TRUST') {
      return (
        <span className="text-sm text-purple-400 font-medium">
          {tx.limit && parseFloat(tx.limit) > 0
            ? `Limit: ${tx.assetCode}`
            : `Remove: ${tx.assetCode}`}
        </span>
      );
    }

    if (tx.type === 'CLAIMABLE') {
      if (tx.amount) {
        return (
          <span className="text-sm font-semibold text-success font-mono">
            +{parseFloat(tx.amount).toFixed(4)} {tx.assetCode}
          </span>
        );
      }
      return <span className="text-sm text-pink-400 font-medium">Claimed</span>;
    }

    if (tx.type === 'CONTRACT') {
      if (tx.amount && tx.amount !== 'N/A') {
        return (
          <span className="text-sm font-semibold text-text-primary font-mono">
            {parseFloat(tx.amount).toFixed(4)} {tx.assetCode || ''}
          </span>
        );
      }
      return (
        <span className="text-[11px] font-mono text-cyan-400 px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/20">
          {tx.functionName ? `fn: ${tx.functionName}` : 'Contract Call'}
        </span>
      );
    }

    if (tx.type === 'OTHER') {
      return <span className="text-xs text-muted font-mono">{tx.details || '-'}</span>;
    }

    return <span className="text-sm text-muted">-</span>;
  };

  const getExplorerUrl = (hash: string) => {
    const explorerNetwork = network === 'mainnet' ? 'public' : 'testnet';
    return `https://stellar.expert/explorer/${explorerNetwork}/tx/${hash}`;
  };

  const Content = (
    <div className="flex flex-col h-full">
      {!embedded && (
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 shrink-0">
          <div>
            <h2 className="heading-4">All Transactions</h2>
            <p className="text-muted text-sm mt-1">History of your account activity</p>
          </div>
        </div>
      )}

      <div
        className={`flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 ${embedded ? 'mb-4' : 'mb-6'} shrink-0`}
      >
        <div className="flex flex-wrap gap-2">
          {filterOptions.map(option => (
            <button
              key={option.value}
              onClick={() => setTab(option.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-sm transition-all duration-200 cursor-pointer ${
                tab === option.value
                  ? 'bg-primary text-text-inverse shadow-sm'
                  : 'bg-white/5 text-muted border-white/5 hover:bg-white/10 hover:text-text-primary'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="flex flex-col items-start lg:items-end gap-2 w-full lg:w-auto">
          <div className="flex bg-white/5 rounded-lg border border-white/5 p-1">
            {['ALL', '7D', '30D', 'CUSTOM'].map(d => (
              <button
                key={d}
                onClick={() => setDateFilter(d as any)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-all cursor-pointer ${
                  dateFilter === d
                    ? 'bg-primary/20 text-primary'
                    : 'text-muted hover:text-text-primary'
                }`}
              >
                {d === 'ALL' ? 'All Time' : d === 'CUSTOM' ? 'Custom' : d}
              </button>
            ))}
          </div>
          {dateFilter === 'CUSTOM' && (
            <div className="flex items-center gap-2 bg-white/5 rounded-lg border border-white/5 p-1 px-2 animate-in fade-in slide-in-from-top-2">
              <input
                type="date"
                value={customDate.start}
                onChange={e => setCustomDate(prev => ({ ...prev, start: e.target.value }))}
                className="bg-transparent text-xs text-muted outline-none border-none focus:ring-0 [&::-webkit-calendar-picker-indicator]:filter [&::-webkit-calendar-picker-indicator]:invert cursor-pointer"
                max={customDate.end || undefined}
              />
              <span className="text-muted text-xs">-</span>
              <input
                type="date"
                value={customDate.end}
                onChange={e => setCustomDate(prev => ({ ...prev, end: e.target.value }))}
                className="bg-transparent text-xs text-muted outline-none border-none focus:ring-0 [&::-webkit-calendar-picker-indicator]:filter [&::-webkit-calendar-picker-indicator]:invert cursor-pointer"
                min={customDate.start || undefined}
              />
            </div>
          )}
        </div>
      </div>

      <div
        className={`${!embedded ? 'bg-muted/10 rounded-xl border border-white/5' : ''} flex-1 overflow-hidden flex flex-col min-h-0`}
      >
        {/* Desktop Table View */}
        <div className="hidden md:block overflow-y-auto flex-1">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-secondary z-10">
              <tr className="border-b border-white/5">
                <th className="px-6 py-4 text-xs font-semibold text-muted uppercase tracking-wider">
                  Type
                </th>
                <th className="px-6 py-4 text-xs font-semibold text-muted uppercase tracking-wider">
                  Description
                </th>
                <th className="px-6 py-4 text-xs font-semibold text-muted uppercase tracking-wider">
                  Amount / Details
                </th>
                <th className="px-6 py-4 text-xs font-semibold text-muted uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-4 text-xs font-semibold text-muted uppercase tracking-wider text-right">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredTransactions.length === 0 && !done ? (
                <SkeletonRows />
              ) : filteredTransactions.length === 0 && done ? (
                <tr>
                  <td colSpan={5} className="px-6 py-14 text-center text-muted">
                    <Search className="w-10 h-10 mx-auto mb-3 opacity-50" />
                    <p className="font-semibold text-text-primary mb-1">
                      No {tab === 'all' ? '' : tab} transactions found
                    </p>
                    <p className="text-xs text-muted mt-1">
                      All transaction history for this account has been scanned.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredTransactions.map(tx => (
                  <tr key={tx.id} className="hover:bg-white/5 transition-colors group">
                    <td className="lg:px-6 px-2 py-4">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-9 h-9 rounded-full flex items-center justify-center border shrink-0 ${getIconBgClass(tx)}`}
                        >
                          {getIcon(tx)}
                        </div>
                        <span className="text-sm font-medium text-text-primary">
                          {getLabel(tx)}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">{renderDescription(tx)}</td>
                    <td className="px-6 py-4">{renderAmount(tx)}</td>
                    <td className="px-6 py-4 text-sm text-muted">
                      <div className="flex flex-col">
                        <span>{new Date(tx.date).toLocaleDateString()}</span>
                        <span className="text-xs opacity-70">
                          {new Date(tx.date).toLocaleTimeString()}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="inline-flex items-center justify-end gap-2">
                        <button
                          onClick={() => setSelectedTx(tx)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-primary/20 text-xs font-semibold text-text-primary hover:text-primary border border-white/10 hover:border-primary/40 transition-all cursor-pointer shadow-sm"
                          title="View Details"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>View</span>
                        </button>
                        <a
                          href={getExplorerUrl(tx.hash)}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 rounded-lg text-muted hover:text-text-primary hover:bg-white/10 transition-all"
                          title="Open on Stellar Explorer"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {filteredTransactions.length > 0 && loading && (
            <div className="p-4 flex items-center justify-center gap-2 border-t border-white/5 text-muted">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
            </div>
          )}

          {!done && <div ref={sentinelRef} className="h-6 w-full pointer-events-none" />}
        </div>

        {/* Mobile Card View */}
        <div className="md:hidden overflow-y-auto flex-1 space-y-2">
          {filteredTransactions.length === 0 && !done ? (
            <SkeletonCards />
          ) : filteredTransactions.length === 0 && done ? (
            <div className="text-center py-12 text-muted">
              <Search className="w-10 h-10 mx-auto mb-3 opacity-50" />
              <p className="font-semibold text-text-primary mb-1">
                No {tab === 'all' ? '' : tab} transactions found
              </p>
              <p className="text-xs text-muted mt-1">
                All transaction history for this account has been scanned.
              </p>
            </div>
          ) : (
            filteredTransactions.map(tx => (
              <div
                key={tx.id}
                className="bg-white/5 hover:bg-white/10 rounded-xl lg:p-4 p-3 border border-white/5 flex items-center justify-between group transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`lg:w-12 lg:h-12 w-8 h-8 rounded-full flex items-center justify-center border shrink-0 ${getIconBgClass(tx)}`}
                  >
                    {getIcon(tx)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-text-primary">
                        {getLabel(tx)}
                      </span>
                      <span className="text-[10px] text-muted">
                        {new Date(tx.date).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="mt-0.5">{renderDescription(tx)}</div>
                  </div>
                </div>
                <div className="text-right flex flex-col items-end gap-1">
                  {renderAmount(tx)}
                  <div className="inline-flex items-center gap-1.5 mt-1">
                    <button
                      onClick={() => setSelectedTx(tx)}
                      className="inline-flex items-center gap-1 text-[11px] text-primary font-medium bg-primary/10 hover:bg-primary/20 px-2 py-0.5 rounded border border-primary/20 transition-all cursor-pointer"
                    >
                      <Eye className="w-3 h-3" /> Details
                    </button>
                    <a
                      href={getExplorerUrl(tx.hash)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-muted hover:text-text-primary p-0.5"
                      title="Open Explorer"
                    >
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              </div>
            ))
          )}

          {filteredTransactions.length > 0 && loading && (
            <div className="p-4 flex items-center justify-center gap-2 text-muted">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
            </div>
          )}

          {!done && <div ref={sentinelRef} className="h-6 w-full pointer-events-none" />}
        </div>
      </div>

      {selectedTx && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6 bg-black/75 backdrop-blur-md">
          <div className="absolute inset-0" onClick={() => setSelectedTx(null)} />
          <div className="relative w-full max-w-4xl bg-secondary rounded-2xl shadow-2xl flex flex-col h-[85vh] border border-white/10 overflow-hidden z-10 animate-in zoom-in-95 duration-200">
            <div className="px-5 py-3.5 border-b border-white/10 flex items-center justify-between bg-secondary shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center border shrink-0 ${getIconBgClass(selectedTx)}`}
                >
                  {getIcon(selectedTx)}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-text-primary truncate">
                      {getLabel(selectedTx)} Details
                    </h3>
                    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-success/15 text-success border border-success/30">
                      <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                      Success
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-muted font-mono truncate max-w-[160px] sm:max-w-xs">
                      {selectedTx.hash}
                    </span>
                    <button
                      onClick={() => handleCopyHash(selectedTx.hash)}
                      className="text-muted hover:text-text-primary transition-colors p-0.5 rounded cursor-pointer"
                      title="Copy Hash"
                    >
                      {copiedHash ? (
                        <Check size={12} className="text-success" />
                      ) : (
                        <Copy size={12} />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={getExplorerUrl(selectedTx.hash)}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-medium text-text-primary border border-white/5 flex items-center gap-1.5 transition-all"
                  title="Open on External Explorer"
                >
                  <span className="hidden sm:inline">Open External</span>
                  <ExternalLink size={13} />
                </a>
                <button
                  onClick={() => setSelectedTx(null)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 text-muted hover:text-text-primary border border-white/5 transition-all cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="relative flex-1 bg-[#131b21] overflow-hidden">
              {isIframeLoading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#131b21] z-10 gap-3">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  <p className="text-xs text-muted">Loading transaction on Stellar Explorer...</p>
                </div>
              )}
              <iframe
                src={getExplorerUrl(selectedTx.hash)}
                title="Stellar Explorer Transaction View"
                className="w-full h-full border-0"
                onLoad={() => setIsIframeLoading(false)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );

  if (embedded) {
    return Content;
  }

  return (
    <div className="bg-secondary min-h-screen p-4 sm:p-6 rounded-2xl border border-white/5">
      {Content}
    </div>
  );
};

export default AllTransactionsUI;
