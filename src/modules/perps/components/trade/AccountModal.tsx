import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  Info,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Wallet as WalletIcon,
  X,
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import BigNumber from 'bignumber.js';
import { ethers } from 'ethers';

import { useNotificationStore } from '../../../../store/notificationStore';
import { switchOrAddChain } from '../../../evm/utils/evmChainUtils';
import { walletService } from '../../../walletconnect/services/wallet/walletService';
import { useWalletStore } from '../../../walletconnect/store/walletConnectStore';
import {
  type DepositAsset,
  type DepositWithdrawRecord,
  type UserWithdrawInfo,
  type WithdrawAsset,
  getChainWithdrawDetails,
  getDepositAssets,
  getDepositWithdrawHistory,
  getUserWithdrawInfo,
  getWithdrawAssets,
  submitWithdraw,
} from '../../adapters/aster/api/account';
import {
  DEFAULT_BROKER_ID,
  type DepositProgress,
  MAX_DEPOSIT_GAS_LIMIT,
  REQUIRED_CONFIRMATIONS,
  depositAssetOnChain,
  fetchOnChainWalletBalance,
} from '../../adapters/aster/api/deposit';
import { parseAsterError } from '../../adapters/aster/api/errors';
import { EVM_CHAINS, getAsterDepositBridge } from '../../adapters/aster/constants';
import { useAsterAgent } from '../../adapters/aster/hooks/useAsterAgent';
import { EVM_CHAIN_NAME_MAP, signEVMWithdraw } from '../../adapters/aster/signer';
import { depositToHyperliquid } from '../../adapters/hyperliquid/api/deposit';
import { withdrawFromHyperliquid } from '../../adapters/hyperliquid/api/withdraw';
import { useExchangeManager } from '../../core/ExchangeManager';
import { useAccountStore } from '../../core/stores/accountStore';
import { startDepositPolling, useDepositTrackerStore } from '../../core/stores/depositTrackerStore';
import { getCoinIconUrl } from '../../services/coinIconService';
import {
  formatDisplayAmount,
  isPositiveNumber,
  isValidDecimalInput,
  pctOf,
} from '../../utils/inputValidation';
import { Modal } from '../ui/Modal';

interface AccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'deposit' | 'withdraw' | 'transfer' | 'history' | 'faucet';
}

const ChainSelector: React.FC<{
  value: number;
  onChange: (v: number) => void;
}> = ({ value, onChange }) => {
  const currentNetwork = useExchangeManager(state => state.currentNetwork);
  const supportedChains = useMemo(() => {
    if (currentNetwork === 'testnet') {
      return [EVM_CHAINS[97], EVM_CHAINS[421614], EVM_CHAINS[11155111]].filter(Boolean);
    }
    return [EVM_CHAINS[56], EVM_CHAINS[42161], EVM_CHAINS[1]].filter(Boolean);
  }, [currentNetwork]);

  useEffect(() => {
    if (supportedChains.length > 0 && !supportedChains.some(c => c.id === value)) {
      onChange(supportedChains[0].id);
    }
  }, [supportedChains, value, onChange]);

  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const selectedChain = supportedChains.find(c => c.id === value) || supportedChains[0];

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between bg-tertiary border border-color rounded-xl px-3.5 py-2.5 text-primary text-[13px] font-medium outline-none cursor-pointer h-11 hover:border-brand/40 transition-colors"
      >
        <span className="font-medium text-primary text-[13px] truncate">
          {selectedChain?.name || 'Select Network'}
        </span>
        <ChevronDown size={14} className="text-secondary shrink-0 ml-1.5" />
      </button>

      {open && supportedChains.length > 0 && (
        <div className="absolute z-50 left-0 right-0 top-12 bg-secondary border border-color rounded-xl shadow-2xl py-1 max-h-52 overflow-y-auto">
          {supportedChains.map(c => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                onChange(c.id);
                setOpen(false);
              }}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 text-[13px] text-left hover:bg-hover transition-colors cursor-pointer ${
                c.id === value ? 'bg-brand/10 text-brand font-semibold' : 'text-primary'
              }`}
            >
              <span className="truncate">{c.name}</span>
              {c.id === value && <Check size={14} className="text-brand shrink-0 ml-2" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const AssetOptionRow: React.FC<{ asset: DepositAsset }> = ({ asset }) => {
  const iconUrl = getCoinIconUrl(asset.name);
  return (
    <div className="flex items-center gap-2">
      {iconUrl ? (
        <img
          src={iconUrl}
          alt={asset.name}
          className="w-4 h-4 rounded-full object-cover shrink-0"
          onError={e => {
            (e.target as HTMLElement).style.display = 'none';
          }}
        />
      ) : (
        <div className="w-4 h-4 rounded-full bg-brand/20 text-brand flex items-center justify-center text-[9px] font-bold shrink-0">
          {asset.name.slice(0, 1)}
        </div>
      )}
      <span className="font-semibold text-[13px] text-primary">
        {asset.displayName || asset.name}
      </span>
    </div>
  );
};

const CustomAssetSelector: React.FC<{
  assets: DepositAsset[];
  value: string;
  onChange: (name: string) => void;
  placeholder?: string;
}> = ({ assets, value, onChange, placeholder = 'Select Asset' }) => {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const selectedAsset = assets.find(a => a.name === value);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between bg-tertiary border border-color rounded-xl px-3.5 py-2.5 text-primary text-[13px] font-medium outline-none cursor-pointer h-11 hover:border-brand/40 transition-colors"
      >
        {selectedAsset ? (
          <AssetOptionRow asset={selectedAsset} />
        ) : (
          <span className="text-secondary">{placeholder}</span>
        )}
        <ChevronDown size={14} className="text-secondary shrink-0 ml-1.5" />
      </button>

      {open && assets.length > 0 && (
        <div className="absolute z-50 left-0 right-0 top-12 bg-secondary border border-color rounded-xl shadow-2xl py-1 max-h-52 overflow-y-auto">
          {assets.map(a => (
            <button
              key={a.name}
              type="button"
              onClick={() => {
                onChange(a.name);
                setOpen(false);
              }}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 text-[13px] text-left hover:bg-hover transition-colors cursor-pointer ${
                a.name === value ? 'bg-brand/10 text-brand font-semibold' : 'text-primary'
              }`}
            >
              <AssetOptionRow asset={a} />
              {a.name === value && <Check size={14} className="text-brand shrink-0 ml-2" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const AmountInput: React.FC<{
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  suffix?: React.ReactNode;
}> = ({ value, onChange, placeholder = '0.00', suffix }) => (
  <div className="relative flex items-center bg-tertiary border border-color rounded-xl h-12 px-3.5 focus-within:border-brand transition-colors">
    <input
      type="text"
      inputMode="decimal"
      placeholder={placeholder}
      value={value}
      onChange={e => {
        const v = e.target.value;
        if (v === '' || isValidDecimalInput(v)) onChange(v);
      }}
      className="flex-1 bg-transparent text-primary text-sm font-mono outline-none placeholder:text-muted"
    />
    {suffix && <div className="shrink-0 ml-2">{suffix}</div>}
  </div>
);

const PctButtons: React.FC<{ total: number; onSelect: (val: string) => void }> = ({
  total,
  onSelect,
}) => (
  <div className="flex gap-2">
    {[25, 50, 75, 100].map(pct => (
      <button
        key={pct}
        type="button"
        onClick={() => onSelect(pctOf(total, pct))}
        className="flex-1 py-1.5 bg-tertiary hover:bg-hover border border-color rounded-lg text-xs text-secondary hover:text-primary transition-colors cursor-pointer font-medium"
      >
        {pct}%
      </button>
    ))}
  </div>
);

const StatusBadge: React.FC<{ state: string }> = ({ state }) => {
  const classes =
    state === 'SUCCESS'
      ? 'bg-success/10 text-success border border-success/30'
      : state === 'FAILED'
        ? 'bg-danger/10 text-danger border border-danger/30'
        : 'bg-warning/10 text-warning border border-warning/30';
  return <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${classes}`}>{state}</span>;
};

export const AccountModal: React.FC<AccountModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'deposit',
}) => {
  const currentExchange = useExchangeManager(s => s.currentExchange);
  const { asterSigner, userAddr } = useAsterAgent();
  const balances = useAccountStore(state => state.balances);

  const pendingDeposits = useDepositTrackerStore(s => s.pendingDeposits);
  const addDepositRecord = useDepositTrackerStore(s => s.addDeposit);
  const removeDepositRecord = useDepositTrackerStore(s => s.removeDeposit);
  const activeTx = useDepositTrackerStore(s => s.activeTransaction);
  const setActiveTx = useDepositTrackerStore(s => s.setActiveTransaction);
  const updateActiveTx = useDepositTrackerStore(s => s.updateActiveTransaction);
  const clearActiveTx = useDepositTrackerStore(s => s.clearActiveTransaction);
  const addWithdrawalRecord = useDepositTrackerStore(s => s.addWithdrawal);

  // Resume targeted deposit & withdrawal polling if user has active transactions
  useEffect(() => {
    if (asterSigner && userAddr && useDepositTrackerStore.getState().hasActiveTransactions()) {
      startDepositPolling(asterSigner, userAddr);
    }
  }, [asterSigner, userAddr]);

  const currentNetwork = useExchangeManager(state => state.currentNetwork);

  const connectedWallets = useWalletStore(state => state.connectedWallets);
  const isEvmConnected = !!connectedWallets.evm?.address;
  const evmAddress = connectedWallets.evm?.address;
  const openWalletModal = useWalletStore(state => state.openModal);

  const tabs = useMemo(() => {
    const list = [
      { key: 'deposit', label: 'Deposit' },
      { key: 'withdraw', label: 'Withdraw' },
      { key: 'history', label: 'History' },
    ];
    if (currentNetwork === 'testnet') {
      list.push({ key: 'faucet', label: 'Faucet' });
    }
    return list;
  }, [currentNetwork]);

  const [activeTab, setActiveTab] = useState<'deposit' | 'withdraw' | 'history' | 'faucet'>(
    initialTab === 'transfer' ? 'deposit' : initialTab || 'deposit'
  );

  useEffect(() => {
    setActiveTab(initialTab === 'transfer' ? 'deposit' : initialTab || 'deposit');
  }, [initialTab]);

  const accountType: 'perp' | 'spot' = 'perp';
  const [selectedChainId, setSelectedChainId] = useState<number>(
    currentExchange === 'hyperliquid'
      ? currentNetwork === 'testnet'
        ? 421614
        : 42161
      : currentNetwork === 'testnet'
        ? 97
        : 56
  );

  // Deposit State
  const [depositAssets, setDepositAssets] = useState<DepositAsset[]>([]);
  const [selectedDepositAsset, setSelectedDepositAsset] = useState<DepositAsset | null>(null);
  const [depositAmount, setDepositAmount] = useState('');
  const [walletTokenBalance, setWalletTokenBalance] = useState('0');
  const [isDepositing, setIsDepositing] = useState(false);
  const [showDepositConfirm, setShowDepositConfirm] = useState(false);

  // Derive progress from persistent store
  const depositProgress: DepositProgress | null = useMemo(() => {
    if (!activeTx || activeTx.type !== 'DEPOSIT') return null;
    return {
      step: activeTx.step,
      message: activeTx.message || '',
      txHash: activeTx.txHash,
    };
  }, [activeTx]);

  const [depositElapsedSec, setDepositElapsedSec] = useState(0);

  // Track deposit progress timer based on persisted transaction timestamp
  useEffect(() => {
    let timer: any;
    if (
      activeTx &&
      activeTx.type === 'DEPOSIT' &&
      activeTx.step !== 'SUCCESS' &&
      activeTx.step !== 'FAILED'
    ) {
      const updateElapsed = () => {
        setDepositElapsedSec(Math.max(0, Math.floor((Date.now() - activeTx.timestamp) / 1000)));
      };
      updateElapsed();
      timer = setInterval(updateElapsed, 1000);
    } else {
      setDepositElapsedSec(0);
    }
    return () => clearInterval(timer);
  }, [activeTx]);

  useEffect(() => {
    if (currentExchange === 'hyperliquid') {
      setSelectedChainId(42161);
      // Hyperliquid only supports USDC natively right now via bridge
      if (activeTab === 'deposit' && selectedDepositAsset?.name !== 'USDC') {
        const usdcAsset = depositAssets.find(a => a.name === 'USDC');
        if (usdcAsset) setSelectedDepositAsset(usdcAsset);
      }
    }
  }, [currentExchange, activeTab, depositAssets, selectedDepositAsset]);

  // Withdraw State
  const [withdrawAssets, setWithdrawAssets] = useState<WithdrawAsset[]>([]);
  const [selectedWithdrawAsset, setSelectedWithdrawAsset] = useState<WithdrawAsset | null>(null);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [destinationAddress, setDestinationAddress] = useState('');
  const [withdrawInfo, setWithdrawInfo] = useState<UserWithdrawInfo | null>(null);
  const [isLoadingWithdrawInfo, setIsLoadingWithdrawInfo] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [showWithdrawConfirm, setShowWithdrawConfirm] = useState(false);

  // Derive withdraw progress from persistent store
  const withdrawProgress: DepositProgress | null = useMemo(() => {
    if (!activeTx || activeTx.type !== 'WITHDRAW') return null;
    return {
      step: activeTx.step,
      message: activeTx.message || '',
    };
  }, [activeTx]);

  // History State
  const [historyRecords, setHistoryRecords] = useState<DepositWithdrawRecord[]>([]);
  const [historyFilter, setHistoryFilter] = useState<'ALL' | 'DEPOSIT' | 'WITHDRAW'>('ALL');
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Sync when modal opens/closes without wiping background transaction
  useEffect(() => {
    if (!isOpen) {
      setShowDepositConfirm(false);
      setShowWithdrawConfirm(false);
      return;
    }
    // If active transaction exists, open directly to corresponding tab!
    const currentActive = useDepositTrackerStore.getState().activeTransaction;
    if (currentActive) {
      setActiveTab(currentActive.type === 'DEPOSIT' ? 'deposit' : 'withdraw');
    } else {
      setActiveTab(initialTab === 'transfer' ? 'deposit' : initialTab || 'deposit');
    }
    if (userAddr && !destinationAddress) setDestinationAddress(userAddr);
  }, [isOpen, initialTab, userAddr]);

  // Fetch Deposit Assets
  useEffect(() => {
    if (!isOpen || activeTab !== 'deposit') return;
    let alive = true;
    getDepositAssets(String(selectedChainId), accountType, 'EVM')
      .then(assets => {
        if (!alive) return;
        setDepositAssets(assets);
        if (assets.length > 0) {
          const prev =
            selectedDepositAsset && assets.find(a => a.name === selectedDepositAsset.name);
          setSelectedDepositAsset(prev || assets[0]);
        } else {
          setSelectedDepositAsset(null);
        }
      })
      .catch(console.error);
    return () => {
      alive = false;
    };
  }, [isOpen, activeTab, selectedChainId, accountType]);

  // Fetch Withdraw Assets & User Limits
  useEffect(() => {
    if (!isOpen || activeTab !== 'withdraw') return;
    let alive = true;
    getWithdrawAssets(String(selectedChainId), accountType, 'EVM')
      .then(assets => {
        if (!alive) return;
        setWithdrawAssets(assets);
        if (assets.length > 0) {
          const prev =
            selectedWithdrawAsset && assets.find(a => a.name === selectedWithdrawAsset.name);
          setSelectedWithdrawAsset(prev || assets[0]);
        } else {
          setSelectedWithdrawAsset(null);
        }
      })
      .catch(console.error);

    if (asterSigner && userAddr) {
      setIsLoadingWithdrawInfo(true);
      getUserWithdrawInfo(asterSigner, userAddr, accountType)
        .then(info => {
          if (alive) setWithdrawInfo(info);
        })
        .catch(console.warn)
        .finally(() => {
          if (alive) setIsLoadingWithdrawInfo(false);
        });
    }
    return () => {
      alive = false;
    };
  }, [isOpen, activeTab, selectedChainId, accountType, asterSigner, userAddr]);

  // Chain-specific withdraw details
  const chainWithdrawDetails = useMemo(
    () =>
      getChainWithdrawDetails(
        withdrawInfo,
        selectedWithdrawAsset?.name || '',
        selectedChainId,
        accountType
      ),
    [withdrawInfo, selectedWithdrawAsset, selectedChainId, accountType]
  );

  // Fetch On-chain Wallet Balance
  const refreshWalletBalance = useCallback(async () => {
    if (!userAddr || !selectedDepositAsset) {
      setWalletTokenBalance('0');
      return;
    }
    try {
      const provider = walletService.getProvider('evm');
      if (!provider) return;
      const bal = await fetchOnChainWalletBalance(provider, userAddr, selectedDepositAsset);
      setWalletTokenBalance(bal);
    } catch (err) {
      console.warn('Failed to fetch wallet balance', err);
    }
  }, [userAddr, selectedDepositAsset]);

  useEffect(() => {
    if (activeTab === 'deposit' && selectedDepositAsset) {
      refreshWalletBalance();
    }
  }, [activeTab, selectedDepositAsset, selectedChainId, refreshWalletBalance]);

  // Aster Bridge Deposit Address for current chain
  const depositBridgeAddress = useMemo(() => {
    try {
      return getAsterDepositBridge(selectedChainId);
    } catch {
      return '';
    }
  }, [selectedChainId]);

  // History Fetcher
  const fetchHistory = useCallback(async () => {
    if (!asterSigner || !userAddr) return;
    setIsLoadingHistory(true);
    try {
      const records = await getDepositWithdrawHistory(asterSigner, userAddr, {
        type: historyFilter === 'ALL' ? undefined : historyFilter,
        limit: 30,
        accountType,
      });
      setHistoryRecords(records || []);
    } catch (err) {
      console.error('History fetch failed', err);
    } finally {
      setIsLoadingHistory(false);
    }
  }, [asterSigner, userAddr, historyFilter, accountType]);

  useEffect(() => {
    if (isOpen && activeTab === 'history') fetchHistory();
  }, [isOpen, activeTab, fetchHistory]);

  // Balance & Withdrawable limits
  const currentBalance = useMemo(() => {
    const sym = selectedWithdrawAsset?.name || 'USDT';
    return balances[sym]?.available || '0';
  }, [balances, selectedWithdrawAsset]);

  const maxWithdrawable = useMemo(() => {
    const fromChain = new BigNumber(chainWithdrawDetails.maxAmount || 0);
    const bal = new BigNumber(currentBalance || 0);
    if (fromChain.isGreaterThan(0)) {
      return BigNumber.min(bal, fromChain).toString();
    }
    return bal.toString();
  }, [currentBalance, chainWithdrawDetails.maxAmount]);

  const netReceiveAmount = useMemo(() => {
    const gross = new BigNumber(withdrawAmount || 0);
    const fee = new BigNumber(chainWithdrawDetails.fee || 0);
    if (gross.isNaN() || gross.isLessThanOrEqualTo(0)) return '0';
    const net = gross.minus(fee);
    return net.isGreaterThan(0) ? net.toString() : '0';
  }, [withdrawAmount, chainWithdrawDetails.fee]);

  // Network Switch Handler
  const handleNetworkChange = async (chainId: number) => {
    setSelectedChainId(chainId);
    try {
      const provider = walletService.getProvider('evm');
      if (provider) await switchOrAddChain(provider, chainId);
    } catch (err) {
      console.warn('Network switch failed', err);
    }
  };

  // Open Deposit Confirmation Modal
  const handleOpenDepositConfirm = () => {
    if (!selectedDepositAsset || !isPositiveNumber(depositAmount)) {
      useNotificationStore.getState().showToast({
        type: 'DYDX',
        title: 'Invalid Amount',
        message: 'Please enter a valid deposit amount.',
      });
      return;
    }

    const num = new BigNumber(depositAmount);
    const bal = new BigNumber(walletTokenBalance || '0');
    if (num.isGreaterThan(bal)) {
      useNotificationStore.getState().showToast({
        type: 'DYDX',
        title: 'Insufficient Wallet Balance',
        message: `Your balance is ${formatDisplayAmount(walletTokenBalance)} ${selectedDepositAsset.name}`,
      });
      return;
    }

    setShowDepositConfirm(true);
  };

  // Direct On-Chain Deposit Handler
  const handleDirectDeposit = async () => {
    if (!selectedDepositAsset || !isPositiveNumber(depositAmount)) {
      useNotificationStore.getState().showToast({
        type: 'DYDX',
        title: 'Invalid Amount',
        message: 'Please enter a valid deposit amount.',
      });
      return;
    }

    const provider = walletService.getProvider('evm');
    if (!provider) {
      useNotificationStore.getState().showToast({
        type: 'DYDX',
        title: 'Wallet Not Connected',
        message: 'Please connect your EVM wallet first.',
      });
      return;
    }

    setShowDepositConfirm(false);
    setIsDepositing(true);
    setActiveTx({
      id: `dep_${Date.now()}`,
      type: 'DEPOSIT',
      step: 'AWAITING_SIGNATURE',
      asset: selectedDepositAsset.name,
      amount: depositAmount,
      chainId: selectedChainId,
      chainName: EVM_CHAINS[selectedChainId]?.name || 'EVM',
      message: 'Initiating deposit transaction in your wallet...',
      timestamp: Date.now(),
    });

    try {
      if (currentExchange === 'hyperliquid') {
        // HYPERLIQUID NATIVE DEPOSIT FLOW
        if (selectedChainId !== 42161) {
          updateActiveTx({
            message: 'Please switch to Arbitrum One in your wallet...',
          });
          await switchOrAddChain(provider, 42161);
        }

        const res = await depositToHyperliquid(provider, depositAmount, progress => {
          if (progress.step === 'DEPOSITING') {
            updateActiveTx({
              step: 'CONFIRMING',
              txHash: progress.txHash,
              message: progress.message || 'Waiting for block confirmation on Arbitrum...',
            });
          }
        });

        useNotificationStore.getState().showToast({
          type: 'DYDX',
          title: 'Deposit Broadcasted',
          message: `Deposited ${res.amount} USDC to Hyperliquid Bridge.`,
        });

        updateActiveTx({
          step: 'SUCCESS',
          message: `Transaction confirmed! It will be credited by Hyperliquid shortly.`,
          txHash: res.txHash,
        });
      } else {
        // ASTER DEPOSIT FLOW
        const res = await depositAssetOnChain(
          provider,
          selectedDepositAsset,
          depositAmount,
          selectedChainId,
          progress => {
            if (progress.step === 'CONFIRMING') {
              updateActiveTx({
                step: 'CONFIRMING',
                txHash: progress.txHash,
                message: progress.message || 'Waiting for on-chain block confirmation...',
              });
            }
          }
        );

        addDepositRecord({
          txHash: res.txHash,
          asset: res.asset,
          amount: res.amount,
          chainId: res.chainId,
          chainName: EVM_CHAINS[res.chainId]?.name || 'EVM',
          explorerUrl: res.explorerUrl || `${EVM_CHAINS[res.chainId]?.explorer}/tx/${res.txHash}`,
          status: 'INDEXING',
        });

        if (asterSigner && userAddr) {
          startDepositPolling(asterSigner, userAddr);
        }

        useNotificationStore.getState().showToast({
          type: 'DYDX',
          title: 'Deposit Broadcasted',
          message: `Deposited ${res.amount} ${res.asset} to Aster. Tracking in progress.`,
        });

        updateActiveTx({
          step: 'SUCCESS',
          message: `Transaction confirmed on-chain! Aster is now indexing your ${res.amount} ${res.asset} deposit.`,
          txHash: res.txHash,
        });
      }

      setDepositAmount('');
      refreshWalletBalance();
    } catch (err: any) {
      const info = parseAsterError(err);
      updateActiveTx({
        step: 'FAILED',
        message: info.userMessage || err?.message || 'Deposit transaction rejected.',
      });
      useNotificationStore.getState().showToast({
        type: 'DYDX',
        title: 'Deposit Failed',
        message: info.userMessage || err?.message || 'Deposit transaction rejected.',
      });
    } finally {
      setIsDepositing(false);
    }
  };

  // Withdraw Flow
  const handleOpenWithdrawConfirm = () => {
    if (!selectedWithdrawAsset || !isPositiveNumber(withdrawAmount)) {
      useNotificationStore.getState().showToast({
        type: 'DYDX',
        title: 'Invalid Amount',
        message: 'Enter a valid withdrawal amount.',
      });
      return;
    }
    if (!ethers.isAddress(destinationAddress)) {
      useNotificationStore.getState().showToast({
        type: 'DYDX',
        title: 'Invalid Address',
        message: 'Enter a valid EVM address (0x...).',
      });
      return;
    }
    const num = new BigNumber(withdrawAmount);
    const max = new BigNumber(maxWithdrawable);
    if (max.isGreaterThan(0) && num.isGreaterThan(max)) {
      useNotificationStore.getState().showToast({
        type: 'DYDX',
        title: 'Exceeds Maximum',
        message: `Max withdrawable: ${formatDisplayAmount(maxWithdrawable)} ${selectedWithdrawAsset.name}`,
      });
      return;
    }
    const remaining = new BigNumber(withdrawInfo?.userRemainingDailyLimit ?? '999999999');
    if (num.isGreaterThan(remaining)) {
      useNotificationStore.getState().showToast({
        type: 'DYDX',
        title: 'Daily Limit Exceeded',
        message: `Remaining: ${remaining.toFormat()} USDT`,
      });
      return;
    }
    setShowWithdrawConfirm(true);
  };

  const handleExecuteWithdraw = async () => {
    if (!selectedWithdrawAsset) return;
    setShowWithdrawConfirm(false);
    setIsWithdrawing(true);
    const withId = `with_${Date.now()}`;
    setActiveTx({
      id: withId,
      type: 'WITHDRAW',
      step: 'AWAITING_SIGNATURE',
      asset: selectedWithdrawAsset.name,
      amount: withdrawAmount,
      chainId: selectedChainId,
      chainName: EVM_CHAINS[selectedChainId]?.name || 'EVM',
      destinationAddress,
      message: 'Please sign the withdrawal authorization in your wallet...',
      timestamp: Date.now(),
    });

    try {
      const provider = walletService.getProvider('evm');
      if (!provider) throw new Error('EVM wallet not connected');
      const ep = new ethers.BrowserProvider(provider as any);
      const userWalletSigner = await ep.getSigner();

      if (currentExchange === 'hyperliquid') {
        // HYPERLIQUID WITHDRAW FLOW
        await withdrawFromHyperliquid(
          userWalletSigner,
          destinationAddress,
          withdrawAmount,
          currentNetwork === 'testnet'
        );

        updateActiveTx({
          step: 'SUCCESS',
          message: `${withdrawAmount} USDC withdrawal submitted to Hyperliquid bridge.`,
        });

        useNotificationStore.getState().showToast({
          type: 'DYDX',
          title: 'Withdrawal Submitted',
          message: `${withdrawAmount} USDC withdrawal submitted to Hyperliquid.`,
        });
      } else {
        // ASTER WITHDRAW FLOW
        if (!asterSigner || !userAddr) return;
        const nonce = Date.now() * 1000;
        const fee = String(chainWithdrawDetails.fee || '0');

        const userSignature = await signEVMWithdraw(
          userWalletSigner,
          selectedChainId,
          {
            destination: destinationAddress,
            token: selectedWithdrawAsset.name,
            amount: withdrawAmount,
            fee,
            nonce,
          },
          currentNetwork === 'testnet' ? 'Testnet' : 'Mainnet'
        );

        updateActiveTx({
          step: 'CONFIRMING',
          message: 'Aster risk engine validating withdrawal request...',
        });

        await submitWithdraw(asterSigner, userAddr, {
          chainId: selectedChainId,
          asset: selectedWithdrawAsset.name,
          amount: withdrawAmount,
          fee,
          receiver: destinationAddress,
          userNonce: String(nonce),
          userSignature,
          accountType,
        });

        addWithdrawalRecord({
          asset: selectedWithdrawAsset.name,
          amount: withdrawAmount,
          chainId: selectedChainId,
          chainName: EVM_CHAINS[selectedChainId]?.name || 'EVM',
          destination: destinationAddress,
          status: 'PROCESSING',
        });

        updateActiveTx({
          step: 'SUCCESS',
          message: `Withdrawal of ${withdrawAmount} ${selectedWithdrawAsset.name} authorized! Aster settlement engine is dispatching funds to your destination wallet.`,
        });

        if (asterSigner && userAddr) {
          startDepositPolling(asterSigner, userAddr);
        }

        useNotificationStore.getState().showToast({
          type: 'DYDX',
          title: 'Withdrawal Submitted',
          message: `${withdrawAmount} ${selectedWithdrawAsset.name} withdrawal submitted.`,
        });
      }

      setWithdrawAmount('');
    } catch (err: any) {
      const info = parseAsterError(err);
      updateActiveTx({
        step: 'FAILED',
        message: info.userMessage || err?.message || 'Withdrawal rejected.',
      });
      useNotificationStore.getState().showToast({
        type: 'DYDX',
        title: 'Withdrawal Failed',
        message: info.userMessage || err?.message || 'Withdrawal rejected.',
      });
    } finally {
      setIsWithdrawing(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      isLocked={false}
      title={activeTab === 'faucet' ? 'Testnet Faucet' : 'Collateral & Account'}
      width="w-[460px]"
    >
      <div className="space-y-4">
        <div className="flex bg-tertiary rounded-xl p-1 border border-color">
          {tabs.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                if (isDepositing || isWithdrawing) return;
                setActiveTab(key as any);
                setShowDepositConfirm(false);
                setShowWithdrawConfirm(false);
              }}
              className={`flex-1 py-2 text-[13px] font-medium rounded-lg text-center transition-all cursor-pointer ${
                activeTab === key
                  ? 'bg-secondary text-primary shadow-sm border border-color font-semibold'
                  : 'text-secondary hover:text-primary'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {activeTab === 'faucet' && (
          <div className="space-y-4">
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-amber-500 dark:text-amber-400 font-semibold text-[13px]">
                  <Sparkles size={16} />
                  <span>Testnet Faucet</span>
                </div>
                {isEvmConnected ? (
                  <span className="text-[10px] font-mono bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-medium">
                    {evmAddress?.slice(0, 6)}...{evmAddress?.slice(-4)}
                  </span>
                ) : (
                  <span className="text-[10px] bg-brand/15 text-brand border border-brand/30 px-2 py-0.5 rounded-full font-semibold">
                    EVM Wallet Required
                  </span>
                )}
              </div>
              <p className="text-[12px] text-secondary leading-relaxed">
                Get free testnet funds to trade risk-free on{' '}
                <strong className="text-primary font-semibold">
                  {currentExchange === 'hyperliquid' ? 'Hyperliquid Testnet' : 'Aster V3 Testnet'}
                </strong>
                . Claim tokens below using your connected EVM wallet:
              </p>
            </div>

            <div className="space-y-2.5">
              {currentExchange === 'hyperliquid' ? (
                <a
                  href="https://app.hyperliquid-testnet.xyz"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between p-3 bg-tertiary hover:bg-hover border border-color hover:border-brand/40 rounded-xl transition-all group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-blue-500/15 flex items-center justify-center text-lg">
                      💧
                    </div>
                    <div>
                      <div className="font-semibold text-primary text-[13px]">
                        Hyperliquid Testnet Faucet
                      </div>
                      <div className="text-[11px] text-secondary">
                        Claim free testnet USDC on Arbitrum Sepolia
                      </div>
                    </div>
                  </div>
                  <ExternalLink
                    size={14}
                    className="text-secondary group-hover:text-primary transition-colors shrink-0"
                  />
                </a>
              ) : (
                <a
                  href="https://www.asterdex-testnet.com/en/faucet"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between p-3 bg-tertiary hover:bg-hover border border-color hover:border-amber-500/40 rounded-xl transition-all group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-amber-500/15 flex items-center justify-center text-lg">
                      ⚡
                    </div>
                    <div>
                      <div className="font-semibold text-primary text-[13px]">
                        Aster DEX Official Testnet Faucet
                      </div>
                      <div className="text-[11px] text-secondary">
                        Claim 1,000 USDT + 1,000 ASTER testnet tokens
                      </div>
                    </div>
                  </div>
                  <ExternalLink
                    size={14}
                    className="text-secondary group-hover:text-primary transition-colors shrink-0"
                  />
                </a>
              )}

              <a
                href="https://www.bnbchain.org/en/testnet-faucet"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between p-3 bg-tertiary hover:bg-hover border border-color hover:border-yellow-500/40 rounded-xl transition-all group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-yellow-500/15 flex items-center justify-center text-lg">
                    ⛽
                  </div>
                  <div>
                    <div className="font-semibold text-primary text-[13px]">
                      BNB Chain Gas Faucet (tBNB)
                    </div>
                    <div className="text-[11px] text-secondary">
                      Required for network gas fees on BSC Testnet (97)
                    </div>
                  </div>
                </div>
                <ExternalLink
                  size={14}
                  className="text-secondary group-hover:text-primary transition-colors shrink-0"
                />
              </a>

              {currentExchange === 'hyperliquid' && (
                <a
                  href="https://faucets.chain.link/arbitrum-sepolia"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between p-3 bg-tertiary hover:bg-hover border border-color hover:border-brand/40 rounded-xl transition-all group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-blue-500/15 flex items-center justify-center text-lg">
                      ⛽
                    </div>
                    <div>
                      <div className="font-semibold text-primary text-[13px]">
                        Arbitrum Sepolia Faucet (Gas ETH)
                      </div>
                      <div className="text-[11px] text-secondary">
                        Gas fees for Arbitrum Sepolia network
                      </div>
                    </div>
                  </div>
                  <ExternalLink
                    size={14}
                    className="text-secondary group-hover:text-primary transition-colors shrink-0"
                  />
                </a>
              )}
            </div>

            <div className="bg-tertiary/60 border border-color rounded-xl p-3 text-[11px] text-secondary leading-relaxed space-y-1">
              <div className="flex items-center gap-1.5 font-medium text-primary">
                <Info size={13} className="text-secondary shrink-0" />
                <span>About Testnet Faucets</span>
              </div>
              <p>
                Testnet tokens are strictly for testing purposes and have no real-world financial
                value. Once claimed on the official faucet, connect your wallet to trade.
              </p>
            </div>
          </div>
        )}

        {activeTab === 'deposit' && (
          <div className="space-y-3.5">
            {pendingDeposits.length > 0 && (
              <div className="space-y-2">
                {pendingDeposits.slice(0, 3).map(dep => {
                  const isIndexing =
                    dep.status === 'INDEXING' || dep.status === 'CONFIRMING_ON_CHAIN';
                  const isConfirmed = dep.status === 'CONFIRMED';
                  return (
                    <div
                      key={dep.id}
                      className={`p-3 rounded-xl border text-[11px] space-y-1.5 transition-all shadow-sm ${
                        isConfirmed
                          ? 'bg-emerald-500/10 border-emerald-500/30'
                          : 'bg-brand/10 border-brand/30'
                      }`}
                    >
                      <div className="flex items-center justify-between font-semibold">
                        <div className="flex items-center gap-1.5">
                          {isIndexing ? (
                            <Loader2 size={13} className="animate-spin text-brand shrink-0" />
                          ) : (
                            <CheckCircle2
                              size={13}
                              className="text-emerald-500 dark:text-emerald-400 shrink-0"
                            />
                          )}
                          <span className="text-primary font-medium">
                            {dep.amount} {dep.asset} on {dep.chainName}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-[9px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wider ${
                              isConfirmed
                                ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                                : 'bg-brand/20 text-brand'
                            }`}
                          >
                            {isConfirmed ? 'Credited' : 'Indexing'}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeDepositRecord(dep.txHash)}
                            className="text-secondary hover:text-primary transition-colors p-0.5 cursor-pointer"
                            title="Dismiss"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      </div>

                      <p className="text-[10px] text-secondary leading-tight">
                        {isIndexing
                          ? 'Mined on blockchain. Aster indexer is confirming block depth (~1–2m on ETH, ~20s on BSC/Arb). Balance updates automatically.'
                          : 'Deposit fully confirmed and credited to your trading balance.'}
                      </p>

                      <div className="flex items-center justify-between pt-1 border-t border-color text-[10px]">
                        <span className="font-mono text-secondary">
                          Tx: {dep.txHash.slice(0, 8)}...{dep.txHash.slice(-6)}
                        </span>
                        <a
                          href={dep.explorerUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-brand hover:underline flex items-center gap-1 font-medium cursor-pointer"
                        >
                          Check on Explorer <ExternalLink size={10} />
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <p className="text-[10px] text-secondary font-medium mb-1 uppercase tracking-wide">
                  Deposit Network
                </p>
                <ChainSelector value={selectedChainId} onChange={handleNetworkChange} />
              </div>
              <div>
                <p className="text-[10px] text-secondary font-medium mb-1 uppercase tracking-wide">
                  Deposit Asset
                </p>
                <CustomAssetSelector
                  assets={depositAssets}
                  value={selectedDepositAsset?.name || ''}
                  onChange={name =>
                    setSelectedDepositAsset(depositAssets.find(a => a.name === name) || null)
                  }
                />
              </div>
            </div>

            {depositProgress ? (
              <div className="space-y-6 pt-1">
                <div>
                  <h4 className="text-sm font-semibold text-primary">
                    Deposit {selectedDepositAsset?.name || 'Asset'}
                  </h4>
                  <p className="text-xs text-secondary mt-0.5">
                    {depositProgress.step === 'SUCCESS'
                      ? 'Deposit confirmed on-chain and indexing.'
                      : depositProgress.step === 'FAILED'
                        ? 'Deposit transaction failed.'
                        : 'Approve the deposit in your wallet to continue.'}
                  </p>
                </div>

                <div className="space-y-0">
                  <div className="flex items-start gap-3">
                    <div className="flex flex-col items-center">
                      <div
                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                          depositProgress.step === 'CONFIRMING' ||
                          depositProgress.step === 'SUCCESS'
                            ? 'border-emerald-500 bg-emerald-500 text-white'
                            : depositProgress.step === 'FAILED'
                              ? 'border-danger bg-danger/10 text-danger'
                              : 'border-brand'
                        }`}
                      >
                        {depositProgress.step === 'CONFIRMING' ||
                        depositProgress.step === 'SUCCESS' ? (
                          <Check className="w-3 h-3 text-white stroke-[3]" />
                        ) : depositProgress.step === 'FAILED' ? (
                          <X className="w-3 h-3 text-danger" />
                        ) : (
                          <div className="w-2.5 h-2.5 border-2 border-brand border-t-transparent rounded-full animate-spin" />
                        )}
                      </div>
                      <div
                        className={`w-0.5 h-12 my-1 transition-colors ${
                          depositProgress.step === 'CONFIRMING' ||
                          depositProgress.step === 'SUCCESS'
                            ? 'bg-emerald-500'
                            : 'bg-tertiary'
                        }`}
                      />
                    </div>

                    <div className="flex-1 pb-4 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`text-sm font-medium ${
                            depositProgress.step === 'CONFIRMING' ||
                            depositProgress.step === 'SUCCESS'
                              ? 'text-emerald-500 dark:text-emerald-400'
                              : 'text-primary'
                          }`}
                        >
                          Confirm in Wallet
                        </span>
                        {depositProgress.step === 'CONFIRMING' ||
                        depositProgress.step === 'SUCCESS' ? (
                          <span className="text-xs font-semibold text-emerald-500 dark:text-emerald-400">
                            Signed
                          </span>
                        ) : depositProgress.step !== 'FAILED' ? (
                          <span className="text-xs text-secondary">Awaiting signature...</span>
                        ) : null}
                      </div>
                      <p className="text-xs text-secondary mt-0.5">
                        Approve the deposit transaction in your wallet
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="flex flex-col items-center">
                      <div
                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                          depositProgress.step === 'SUCCESS'
                            ? 'border-emerald-500 bg-emerald-500 text-white'
                            : depositProgress.step === 'CONFIRMING'
                              ? 'border-brand'
                              : 'border-color'
                        }`}
                      >
                        {depositProgress.step === 'SUCCESS' ? (
                          <Check className="w-3 h-3 text-white stroke-[3]" />
                        ) : depositProgress.step === 'CONFIRMING' ? (
                          <div className="w-2.5 h-2.5 border-2 border-brand border-t-transparent rounded-full animate-spin" />
                        ) : null}
                      </div>
                      <div
                        className={`w-0.5 h-12 my-1 transition-colors ${
                          depositProgress.step === 'SUCCESS' ? 'bg-emerald-500' : 'bg-tertiary'
                        }`}
                      />
                    </div>

                    <div className="flex-1 pb-4 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`text-sm font-medium ${
                            depositProgress.step === 'SUCCESS'
                              ? 'text-emerald-500 dark:text-emerald-400'
                              : depositProgress.step === 'CONFIRMING'
                                ? 'text-primary'
                                : 'text-secondary'
                          }`}
                        >
                          On-Chain Confirmation
                        </span>
                        {depositProgress.step === 'SUCCESS' ? (
                          <span className="text-xs font-semibold text-emerald-500 dark:text-emerald-400">
                            Confirmed
                          </span>
                        ) : depositProgress.step === 'CONFIRMING' ? (
                          <span className="text-xs text-secondary">Broadcasting...</span>
                        ) : null}
                      </div>
                      <p className="text-xs text-secondary mt-0.5">
                        Waiting for block inclusion on{' '}
                        {EVM_CHAINS[selectedChainId]?.name || 'network'}
                      </p>
                      {depositProgress.txHash && (
                        <a
                          href={`${EVM_CHAINS[selectedChainId]?.explorer}/tx/${depositProgress.txHash}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] text-brand hover:underline inline-flex items-center gap-1 mt-1 font-mono"
                        >
                          Tx: {depositProgress.txHash.slice(0, 8)}...
                          {depositProgress.txHash.slice(-6)} <ExternalLink size={10} />
                        </a>
                      )}
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="flex flex-col items-center">
                      <div
                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                          depositProgress.step === 'SUCCESS'
                            ? 'border-emerald-500 bg-emerald-500 text-white'
                            : 'border-color'
                        }`}
                      >
                        {depositProgress.step === 'SUCCESS' ? (
                          <Check className="w-3 h-3 text-white stroke-[3]" />
                        ) : null}
                      </div>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`text-sm font-medium ${
                            depositProgress.step === 'SUCCESS'
                              ? 'text-emerald-500 dark:text-emerald-400'
                              : 'text-secondary'
                          }`}
                        >
                          Indexing & Crediting
                        </span>
                        {depositProgress.step === 'SUCCESS' && (
                          <span className="text-xs font-semibold text-emerald-500 dark:text-emerald-400">
                            Credited
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-secondary mt-0.5 leading-relaxed">
                        Aster indexer detects deposit and credits your trading account
                      </p>
                    </div>
                  </div>
                </div>

                {depositElapsedSec > 15 &&
                  depositProgress.step !== 'SUCCESS' &&
                  depositProgress.step !== 'FAILED' && (
                    <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-[11px] text-amber-500 dark:text-amber-400 space-y-1 animate-in fade-in">
                      <div className="flex items-center gap-1.5 font-semibold">
                        <Info size={13} />
                        <span>
                          Confirming on {EVM_CHAINS[selectedChainId]?.name} ({depositElapsedSec}s)
                        </span>
                      </div>
                      <p className="text-secondary text-[10px] leading-relaxed">
                        Transaction has been submitted on-chain. Aster off-chain indexer confirms
                        block depth before crediting collateral. Your funds are 100% safe.
                      </p>
                    </div>
                  )}

                {depositProgress.step === 'FAILED' && (
                  <div className="p-3 bg-danger/10 border border-danger/30 rounded-xl text-xs text-danger">
                    {depositProgress.message}
                  </div>
                )}

                <div className="pt-2">
                  {depositProgress.step === 'SUCCESS' ? (
                    <button
                      type="button"
                      onClick={() => {
                        clearActiveTx();
                        onClose();
                      }}
                      className="w-full h-11 bg-brand hover:bg-brand-hover text-white font-semibold text-sm rounded-xl transition-colors cursor-pointer"
                    >
                      Done
                    </button>
                  ) : depositProgress.step === 'FAILED' ? (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => clearActiveTx()}
                        className="flex-1 h-11 bg-tertiary hover:bg-hover text-primary text-xs font-semibold rounded-xl border border-color cursor-pointer transition-colors"
                      >
                        Back
                      </button>
                      <button
                        type="button"
                        onClick={handleDirectDeposit}
                        className="flex-1 h-11 bg-brand hover:bg-brand-hover text-white text-xs font-semibold rounded-xl cursor-pointer transition-colors"
                      >
                        Retry
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={onClose}
                      className="w-full py-1 text-xs text-secondary hover:text-primary transition-colors cursor-pointer"
                    >
                      Close (Deposit will continue in background)
                    </button>
                  )}
                </div>
              </div>
            ) : showDepositConfirm ? (
              <div className="space-y-4">
                <div className="text-center py-1">
                  <ShieldCheck size={28} className="text-brand mx-auto mb-1.5" />
                  <h3 className="text-[14px] font-semibold text-primary">Confirm Deposit</h3>
                  <p className="text-[11px] text-secondary mt-0.5">
                    Review on-chain smart contract deposit details before signing.
                  </p>
                </div>

                <div className="bg-tertiary rounded-xl p-3.5 border border-color space-y-2 text-[12px]">
                  <div className="flex justify-between gap-3">
                    <span className="text-secondary shrink-0">Network</span>
                    <span className="text-primary font-medium text-right">
                      {EVM_CHAINS[selectedChainId]?.name} ({selectedChainId})
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-secondary shrink-0">Asset & Amount</span>
                    <span className="text-brand font-semibold text-right font-mono">
                      {depositAmount} {selectedDepositAsset?.name}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-secondary shrink-0">Treasury Bridge</span>
                    <div className="text-right">
                      <span className="text-primary font-mono text-[11px] break-all">
                        {depositBridgeAddress}
                      </span>
                      {EVM_CHAINS[selectedChainId]?.explorer && (
                        <a
                          href={`${EVM_CHAINS[selectedChainId]?.explorer}/address/${depositBridgeAddress}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[10px] text-brand hover:underline flex items-center justify-end gap-1 mt-0.5"
                        >
                          View Contract <ExternalLink size={10} />
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-secondary shrink-0">Target Contract</span>
                    <span className="text-primary font-medium text-right">
                      {selectedDepositAsset?.isNative
                        ? 'Native ETH/BNB Transfer'
                        : 'ERC-20 Token Deposit'}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-secondary shrink-0">Broker ID</span>
                    <span className="text-primary font-mono font-medium text-right">
                      {DEFAULT_BROKER_ID.toString()} (Aster Official)
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-secondary shrink-0">Block Confirmations</span>
                    <span className="text-primary font-mono text-right">
                      {REQUIRED_CONFIRMATIONS[selectedChainId] || 2} blocks
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-secondary shrink-0">Gas Limit Ceiling</span>
                    <span className="text-primary font-mono text-right">
                      {MAX_DEPOSIT_GAS_LIMIT.toLocaleString()} gas
                    </span>
                  </div>
                </div>

                <div className="p-2.5 bg-brand/10 border border-brand/30 rounded-xl text-[11px] text-secondary space-y-1">
                  <div className="flex items-center gap-1.5 text-brand font-medium">
                    <Info size={12} className="shrink-0" />
                    <span>Smart Contract Security Verification</span>
                  </div>
                  <p>
                    This transaction executes directly against the verified Aster Perpetual
                    Treasury. The off-chain indexer will automatically credit your collateral upon
                    block confirmation.
                  </p>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowDepositConfirm(false)}
                    disabled={isDepositing}
                    className="flex-1 h-11 bg-tertiary hover:bg-hover border border-color rounded-xl text-[13px] font-medium text-primary transition-colors cursor-pointer"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={handleDirectDeposit}
                    disabled={isDepositing}
                    className="flex-1 h-11 bg-brand hover:bg-brand-hover text-white font-semibold text-[13px] rounded-xl transition-colors disabled:opacity-50 cursor-pointer shadow-sm flex items-center justify-center gap-2"
                  >
                    {isDepositing ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        <span>Confirming...</span>
                      </>
                    ) : (
                      <span>Confirm & Sign in Wallet</span>
                    )}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <p className="text-[10px] text-secondary font-medium uppercase tracking-wide">
                      Deposit Amount
                    </p>
                    <span className="text-[11px] text-secondary">
                      Wallet:{' '}
                      <span className="text-primary font-mono font-medium">
                        {formatDisplayAmount(walletTokenBalance)} {selectedDepositAsset?.name || ''}
                      </span>
                    </span>
                  </div>
                  <AmountInput
                    value={depositAmount}
                    onChange={setDepositAmount}
                    suffix={
                      <button
                        type="button"
                        onClick={() => setDepositAmount(walletTokenBalance)}
                        className="text-brand text-[11px] font-semibold hover:underline cursor-pointer"
                      >
                        MAX
                      </button>
                    }
                  />
                </div>

                <PctButtons
                  total={parseFloat(walletTokenBalance) || 0}
                  onSelect={setDepositAmount}
                />

                {isEvmConnected ? (
                  <button
                    type="button"
                    onClick={handleOpenDepositConfirm}
                    disabled={
                      isDepositing ||
                      !isPositiveNumber(depositAmount) ||
                      new BigNumber(depositAmount || 0).isGreaterThan(
                        new BigNumber(walletTokenBalance || 0)
                      )
                    }
                    className="w-full h-11 bg-brand hover:bg-brand-hover text-white font-semibold text-[13px] rounded-xl transition-colors disabled:opacity-50 cursor-pointer shadow-sm flex items-center justify-center"
                  >
                    {isDepositing
                      ? 'Processing Deposit...'
                      : new BigNumber(depositAmount || 0).isGreaterThan(
                            new BigNumber(walletTokenBalance || 0)
                          )
                        ? 'Insufficient Wallet Balance'
                        : `Review Deposit ${selectedDepositAsset?.name || ''}`}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      openWalletModal();
                    }}
                    className="w-full h-11 bg-brand hover:bg-brand-hover text-white font-semibold text-[13px] rounded-xl transition-colors cursor-pointer shadow-sm flex items-center justify-center gap-2"
                  >
                    <WalletIcon size={15} />
                    Connect EVM Wallet to Deposit
                  </button>
                )}

                <div className="flex items-center gap-1.5 text-[10px] text-secondary justify-center pt-0.5">
                  <Info size={11} className="text-secondary shrink-0" />
                  <span>
                    {selectedChainId === 1
                      ? 'Ethereum deposits require 2 block confirmations (~30s) to credit.'
                      : `${EVM_CHAINS[selectedChainId]?.name} deposits credit in ~15–30 seconds.`}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'withdraw' && (
          <div>
            {withdrawProgress ? (
              <div className="space-y-6 pt-1">
                <div>
                  <h4 className="text-sm font-semibold text-primary">
                    Withdraw {selectedWithdrawAsset?.name || 'Asset'}
                  </h4>
                  <p className="text-xs text-secondary mt-0.5">
                    {withdrawProgress.step === 'SUCCESS'
                      ? 'Withdrawal authorized and queued for settlement.'
                      : withdrawProgress.step === 'FAILED'
                        ? 'Withdrawal request rejected or failed.'
                        : 'Sign the withdrawal authorization in your wallet to proceed.'}
                  </p>
                </div>

                <div className="space-y-0">
                  <div className="flex items-start gap-3">
                    <div className="flex flex-col items-center">
                      <div
                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                          withdrawProgress.step === 'CONFIRMING' ||
                          withdrawProgress.step === 'SUCCESS'
                            ? 'bg-emerald-500 border-emerald-500 text-white'
                            : withdrawProgress.step === 'FAILED'
                              ? 'border-danger text-danger'
                              : 'border-brand'
                        }`}
                      >
                        {withdrawProgress.step === 'CONFIRMING' ||
                        withdrawProgress.step === 'SUCCESS' ? (
                          <Check className="w-3 h-3 text-white stroke-[3]" />
                        ) : withdrawProgress.step === 'FAILED' ? (
                          <X className="w-3 h-3 text-danger" />
                        ) : (
                          <div className="w-2.5 h-2.5 border-2 border-brand border-t-transparent rounded-full animate-spin" />
                        )}
                      </div>
                      <div
                        className={`w-0.5 h-12 my-1 transition-colors ${
                          withdrawProgress.step === 'CONFIRMING' ||
                          withdrawProgress.step === 'SUCCESS'
                            ? 'bg-emerald-500'
                            : 'bg-tertiary'
                        }`}
                      />
                    </div>
                    <div className="flex-1 pb-4 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`text-sm font-medium ${
                            withdrawProgress.step === 'CONFIRMING' ||
                            withdrawProgress.step === 'SUCCESS'
                              ? 'text-emerald-500 dark:text-emerald-400'
                              : 'text-primary'
                          }`}
                        >
                          Wallet Authorization
                        </span>
                        {withdrawProgress.step === 'CONFIRMING' ||
                        withdrawProgress.step === 'SUCCESS' ? (
                          <span className="text-xs font-semibold text-emerald-500 dark:text-emerald-400">
                            Signed
                          </span>
                        ) : withdrawProgress.step !== 'FAILED' ? (
                          <span className="text-xs text-secondary">Awaiting signature...</span>
                        ) : null}
                      </div>
                      <p className="text-xs text-secondary mt-0.5">
                        EIP-712 cryptographic signature to authorize withdrawal
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="flex flex-col items-center">
                      <div
                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                          withdrawProgress.step === 'SUCCESS'
                            ? 'bg-emerald-500 border-emerald-500 text-white'
                            : withdrawProgress.step === 'CONFIRMING'
                              ? 'border-brand'
                              : 'border-color'
                        }`}
                      >
                        {withdrawProgress.step === 'SUCCESS' ? (
                          <Check className="w-3 h-3 text-white stroke-[3]" />
                        ) : withdrawProgress.step === 'CONFIRMING' ? (
                          <div className="w-2.5 h-2.5 border-2 border-brand border-t-transparent rounded-full animate-spin" />
                        ) : null}
                      </div>
                      <div
                        className={`w-0.5 h-12 my-1 transition-colors ${
                          withdrawProgress.step === 'SUCCESS' ? 'bg-emerald-500' : 'bg-tertiary'
                        }`}
                      />
                    </div>
                    <div className="flex-1 pb-4 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`text-sm font-medium ${
                            withdrawProgress.step === 'SUCCESS'
                              ? 'text-emerald-500 dark:text-emerald-400'
                              : 'text-primary'
                          }`}
                        >
                          Aster Risk Verification
                        </span>
                        {withdrawProgress.step === 'SUCCESS' ? (
                          <span className="text-xs font-semibold text-emerald-500 dark:text-emerald-400">
                            Approved
                          </span>
                        ) : withdrawProgress.step === 'CONFIRMING' ? (
                          <span className="text-xs text-secondary">Validating margin...</span>
                        ) : null}
                      </div>
                      <p className="text-xs text-secondary mt-0.5">
                        Verifying margin health ratio and remaining 24-hour limits
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="flex flex-col items-center">
                      <div
                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                          withdrawProgress.step === 'SUCCESS'
                            ? 'bg-emerald-500 border-emerald-500 text-white'
                            : 'border-color'
                        }`}
                      >
                        {withdrawProgress.step === 'SUCCESS' ? (
                          <Check className="w-3 h-3 text-white stroke-[3]" />
                        ) : null}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`text-sm font-medium ${
                            withdrawProgress.step === 'SUCCESS'
                              ? 'text-emerald-500 dark:text-emerald-400'
                              : 'text-secondary'
                          }`}
                        >
                          On-Chain Settlement
                        </span>
                        {withdrawProgress.step === 'SUCCESS' && (
                          <span className="text-xs font-semibold text-emerald-500 dark:text-emerald-400">
                            Dispatched
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-secondary mt-0.5 leading-relaxed">
                        Funds dispatched to destination address (settles in 1–3 min)
                      </p>
                    </div>
                  </div>
                </div>

                {withdrawProgress.step === 'SUCCESS' && (
                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-600 dark:text-emerald-400 space-y-1">
                    <div className="flex items-center gap-1.5 font-semibold">
                      <CheckCircle2 size={14} />
                      <span>Withdrawal Accepted</span>
                    </div>
                    <p className="text-secondary text-[11px] leading-relaxed">
                      Your withdrawal request has been accepted by Aster DEX. Settlement engines are
                      dispatching the tokens to {destinationAddress.slice(0, 6)}...
                      {destinationAddress.slice(-4)} on {EVM_CHAINS[selectedChainId]?.name}.
                    </p>
                  </div>
                )}

                {withdrawProgress.step === 'FAILED' && (
                  <div className="p-3 bg-danger/10 border border-danger/30 rounded-xl text-xs text-danger">
                    {withdrawProgress.message}
                  </div>
                )}

                <div className="pt-2">
                  {withdrawProgress.step === 'SUCCESS' ? (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          clearActiveTx();
                          setActiveTab('history');
                        }}
                        className="flex-1 h-11 bg-tertiary hover:bg-hover text-primary text-xs font-semibold rounded-xl border border-color cursor-pointer transition-colors"
                      >
                        View in History
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          clearActiveTx();
                          onClose();
                        }}
                        className="flex-1 h-11 bg-brand hover:bg-brand-hover text-white text-xs font-semibold rounded-xl cursor-pointer transition-colors"
                      >
                        Done
                      </button>
                    </div>
                  ) : withdrawProgress.step === 'FAILED' ? (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => clearActiveTx()}
                        className="flex-1 h-11 bg-tertiary hover:bg-hover text-primary text-xs font-semibold rounded-xl border border-color cursor-pointer"
                      >
                        Back
                      </button>
                      <button
                        type="button"
                        onClick={handleExecuteWithdraw}
                        className="flex-1 h-11 bg-brand hover:bg-brand-hover text-white text-xs font-semibold rounded-xl cursor-pointer"
                      >
                        Retry
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={onClose}
                      className="w-full py-1 text-xs text-secondary hover:text-primary transition-colors cursor-pointer text-center"
                    >
                      Close (Withdrawal will continue in background)
                    </button>
                  )}
                </div>
              </div>
            ) : showWithdrawConfirm ? (
              <div className="space-y-4">
                <div className="text-center py-1">
                  <ShieldCheck size={28} className="text-brand mx-auto mb-1.5" />
                  <h3 className="text-[14px] font-semibold text-primary">Confirm Withdrawal</h3>
                  <p className="text-[11px] text-secondary mt-0.5">
                    Please verify the withdrawal details carefully before signing.
                  </p>
                </div>

                <div className="bg-tertiary rounded-xl p-3.5 border border-color space-y-2 text-[12px]">
                  {[
                    [
                      'Network',
                      `${EVM_CHAINS[selectedChainId]?.name} (${EVM_CHAIN_NAME_MAP[selectedChainId]})`,
                    ],
                    [
                      'Asset',
                      selectedWithdrawAsset?.displayName || selectedWithdrawAsset?.name || '',
                    ],
                    ['Destination', destinationAddress],
                    ['Gross Amount', `${withdrawAmount} ${selectedWithdrawAsset?.name}`],
                    ['Gas Fee', `${chainWithdrawDetails.fee} ${selectedWithdrawAsset?.name}`],
                  ].map(([label, val]) => (
                    <div key={label} className="flex justify-between gap-3">
                      <span className="text-secondary shrink-0">{label}</span>
                      <span
                        className={`text-primary font-medium text-right break-all ${label === 'Destination' ? 'font-mono text-[11px]' : ''}`}
                      >
                        {val}
                      </span>
                    </div>
                  ))}
                  <div className="border-t border-color pt-2 flex justify-between font-semibold">
                    <span className="text-secondary">Net To Receive</span>
                    <span className="text-brand font-mono">
                      {formatDisplayAmount(netReceiveAmount)} {selectedWithdrawAsset?.name}
                    </span>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowWithdrawConfirm(false)}
                    disabled={isWithdrawing}
                    className="flex-1 h-11 bg-tertiary hover:bg-hover border border-color rounded-xl text-[13px] font-medium text-primary transition-colors cursor-pointer"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={handleExecuteWithdraw}
                    disabled={isWithdrawing}
                    className="flex-1 h-11 bg-brand hover:bg-brand-hover text-white font-semibold text-[13px] rounded-xl transition-colors disabled:opacity-50 cursor-pointer shadow-sm"
                  >
                    {isWithdrawing ? 'Signing & Submitting...' : 'Confirm & Sign'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3.5">
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <p className="text-[10px] text-secondary font-medium mb-1 uppercase tracking-wide">
                      Withdraw Network
                    </p>
                    <ChainSelector value={selectedChainId} onChange={handleNetworkChange} />
                  </div>
                  <div>
                    <p className="text-[10px] text-secondary font-medium mb-1 uppercase tracking-wide">
                      Withdraw Asset
                    </p>
                    <CustomAssetSelector
                      assets={withdrawAssets}
                      value={selectedWithdrawAsset?.name || ''}
                      onChange={name =>
                        setSelectedWithdrawAsset(withdrawAssets.find(a => a.name === name) || null)
                      }
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <p className="text-[10px] text-secondary font-medium uppercase tracking-wide">
                      Destination EVM Address
                    </p>
                    {destinationAddress &&
                      (ethers.isAddress(destinationAddress) ? (
                        <span className="text-[10px] text-emerald-500 dark:text-emerald-400 flex items-center gap-1">
                          <CheckCircle2 size={10} /> Valid EVM
                        </span>
                      ) : (
                        <span className="text-[10px] text-danger">Invalid Address</span>
                      ))}
                  </div>
                  <div
                    className={`flex items-center bg-tertiary border rounded-xl h-12 px-3.5 transition-colors focus-within:border-brand ${
                      destinationAddress && !ethers.isAddress(destinationAddress)
                        ? 'border-danger/60'
                        : 'border-color'
                    }`}
                  >
                    <input
                      type="text"
                      placeholder="0x..."
                      value={destinationAddress}
                      onChange={e => setDestinationAddress(e.target.value.trim())}
                      className="flex-1 bg-transparent text-primary font-mono text-[12px] outline-none placeholder:text-muted"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <p className="text-[10px] text-secondary font-medium uppercase tracking-wide">
                      Amount
                    </p>
                    <span className="text-[11px] text-secondary">
                      Max:{' '}
                      <span className="text-primary font-mono font-medium">
                        {isLoadingWithdrawInfo
                          ? '...'
                          : `${formatDisplayAmount(maxWithdrawable)} ${selectedWithdrawAsset?.name || ''}`}
                      </span>
                    </span>
                  </div>
                  <AmountInput
                    value={withdrawAmount}
                    onChange={setWithdrawAmount}
                    suffix={
                      <button
                        type="button"
                        onClick={() => setWithdrawAmount(String(maxWithdrawable || currentBalance))}
                        className="text-brand text-[11px] font-semibold hover:underline cursor-pointer"
                      >
                        MAX
                      </button>
                    }
                  />
                </div>

                <div className="bg-tertiary rounded-xl p-3 border border-color space-y-1.5 text-[11px]">
                  <div className="flex justify-between text-secondary">
                    <span>Network Gas Fee</span>
                    <span className="text-primary font-mono font-medium">
                      {isLoadingWithdrawInfo
                        ? '...'
                        : `${chainWithdrawDetails.fee} ${selectedWithdrawAsset?.name || ''}`}
                    </span>
                  </div>
                  {withdrawInfo && (
                    <div className="flex justify-between text-secondary">
                      <span>24h Remaining Limit</span>
                      <span className="text-primary font-mono font-medium">
                        {Number(withdrawInfo.userRemainingDailyLimit).toLocaleString('en-US', {
                          maximumFractionDigits: 0,
                        })}{' '}
                        USDT
                      </span>
                    </div>
                  )}
                  {chainWithdrawDetails.chainLimit > 0 && (
                    <div className="flex justify-between text-secondary">
                      <span>Chain Limit</span>
                      <span className="text-primary font-mono font-medium">
                        {formatDisplayAmount(chainWithdrawDetails.chainLimit)}{' '}
                        {selectedWithdrawAsset?.name}
                      </span>
                    </div>
                  )}
                  <div className="border-t border-color pt-2 flex justify-between font-semibold">
                    <span className="text-secondary">Net To Receive</span>
                    <span className="text-brand font-mono">
                      {formatDisplayAmount(netReceiveAmount)} {selectedWithdrawAsset?.name}
                    </span>
                  </div>
                </div>

                {isEvmConnected ? (
                  <button
                    type="button"
                    onClick={handleOpenWithdrawConfirm}
                    disabled={
                      !isPositiveNumber(withdrawAmount) || !ethers.isAddress(destinationAddress)
                    }
                    className="w-full h-11 bg-brand hover:bg-brand-hover text-white font-semibold text-[13px] rounded-xl transition-colors disabled:opacity-50 cursor-pointer shadow-sm flex items-center justify-center"
                  >
                    Review Withdrawal
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      openWalletModal();
                    }}
                    className="w-full h-11 bg-brand hover:bg-brand-hover text-white font-semibold text-[13px] rounded-xl transition-colors cursor-pointer shadow-sm flex items-center justify-center gap-2"
                  >
                    <WalletIcon size={15} />
                    Connect EVM Wallet to Withdraw
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'history' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex bg-tertiary p-0.5 rounded-lg border border-color text-[11px]">
                {(['ALL', 'DEPOSIT', 'WITHDRAW'] as const).map(f => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setHistoryFilter(f)}
                    className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                      historyFilter === f
                        ? 'bg-secondary text-primary font-semibold shadow-sm'
                        : 'text-secondary hover:text-primary'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={fetchHistory}
                disabled={isLoadingHistory}
                className="text-secondary hover:text-primary transition-colors p-1.5 rounded-lg hover:bg-hover cursor-pointer"
                title="Refresh History"
              >
                <RefreshCw size={13} className={isLoadingHistory ? 'animate-spin' : ''} />
              </button>
            </div>

            <div className="max-h-[320px] overflow-y-auto scrollbar-thin border border-color rounded-xl bg-tertiary/40">
              {historyRecords.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-2 text-secondary text-[12px]">
                  {isLoadingHistory ? (
                    <>
                      <RefreshCw size={18} className="animate-spin text-brand" />
                      <span>Loading records...</span>
                    </>
                  ) : (
                    <span>No deposit or withdrawal history found.</span>
                  )}
                </div>
              ) : (
                <div className="divide-y divide-color">
                  {historyRecords.map(r => {
                    const chain = EVM_CHAINS[r.chainId] || {
                      name: 'EVM',
                      explorer: 'https://etherscan.io',
                    };
                    const isDeposit = r.type === 'DEPOSIT';
                    const timestamp = r.time;
                    const dateStr =
                      timestamp && !isNaN(timestamp)
                        ? new Date(timestamp).toLocaleString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : '—';

                    return (
                      <div
                        key={r.id || r.txHash}
                        className="px-3 py-2.5 hover:bg-hover flex items-center justify-between gap-2 text-[11px] transition-colors"
                      >
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                              isDeposit
                                ? 'bg-emerald-500/10 text-emerald-500 dark:text-emerald-400'
                                : 'bg-danger/10 text-danger'
                            }`}
                          >
                            {isDeposit ? (
                              <ArrowDownToLine size={13} />
                            ) : (
                              <ArrowUpFromLine size={13} />
                            )}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <span className="font-semibold text-primary">{r.asset}</span>
                              <span className="text-[10px] text-secondary bg-secondary px-1.5 py-0.2 rounded border border-color">
                                {chain.name}
                              </span>
                              {r.accountType && (
                                <span className="text-[10px] text-secondary bg-secondary px-1.5 py-0.2 rounded border border-color capitalize">
                                  {r.accountType}
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-muted">{dateStr}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 text-right shrink-0">
                          <div>
                            <div
                              className={`font-mono font-semibold ${isDeposit ? 'text-emerald-500 dark:text-emerald-400' : 'text-danger'}`}
                            >
                              {isDeposit ? '+' : '-'}
                              {parseFloat(r.amount).toFixed(4)}
                            </div>
                            <StatusBadge state={r.state} />
                          </div>
                          {r.txHash && (
                            <a
                              href={`${chain.explorer}/tx/${r.txHash}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-secondary hover:text-brand transition-colors"
                              title="View on Block Explorer"
                            >
                              <ExternalLink size={12} />
                            </a>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};
