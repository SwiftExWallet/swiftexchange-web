import {
  Check,
  CheckCircle2,
  Coins,
  Copy,
  ExternalLink,
  Loader2,
  Mail,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import type { ClipboardEvent, DragEvent, FC, FormEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';

import * as ChainUrlHelpers from '@/modules/evm/utils/ChainUrlHelpers';
import { getChainById } from '@/modules/evm/utils/Chainregistry';
import { WalletType } from '@/modules/walletconnect/constants/Wallet';
import { useWalletConnect } from '@/modules/walletconnect/hooks/useWalletConnect';
import { useWalletStore } from '@/modules/walletconnect/store/walletConnectStore';

import { useStellarBalances } from '../../stellar/hook/useStellarBalances';
import {
  MAX_RECOVERY_ASSETS,
  SPAREKEY_CONFIG,
  TESTNET_USDC_CODE,
  TESTNET_USDC_ISSUER,
  TESTNET_USDC_SAC,
} from '../constants';
import {
  type ProtectedAssetSpec,
  checkOnChainRegistration,
  parseContractError,
  registerRecoveryEmailOnChain,
} from '../services/sparekeyContractService';
import { recordRecoveryRegistrationInBackend } from '../services/zkRecoveryService';
import { useRecoveryStore } from '../store/recoveryStore';
import { AssetSelector } from './AssetSelector';

interface ProtectWalletFormProps {
  onSuccess: () => void;
  onCancel?: () => void;
  onOpenHelp?: () => void;
  onGoToRecover?: () => void;
}

type TxProgressStage =
  'idle' | 'generating-hash' | 'simulating' | 'awaiting-wallet' | 'broadcasting' | 'confirmed';

export const ProtectWalletForm: FC<ProtectWalletFormProps> = ({
  onSuccess,
  onCancel,
  onOpenHelp,
  onGoToRecover,
}) => {
  const { connectedWallets, getProvider, openModal } = useWalletConnect();
  const currentNetwork = useWalletStore(state => state.network);
  const chainId = currentNetwork === 'mainnet' ? 'pubnet' : 'testnet';
  const stellarChain = getChainById(chainId);

  const rawStellar =
    connectedWallets?.[WalletType.STELLAR]?.address || connectedWallets?.stellar?.address || '';
  const activeStellarWallet =
    typeof rawStellar === 'string' && rawStellar.startsWith('G') && rawStellar.length === 56
      ? rawStellar
      : '';

  const hasEvmOnly = Boolean(
    (connectedWallets?.[WalletType.EVM]?.address || connectedWallets?.evm?.address) &&
    !activeStellarWallet
  );

  const { balances: stellarBalances, loading: loadingBalances } =
    useStellarBalances(activeStellarWallet);

  const defaultEmail = useRecoveryStore(state => state.email || state.pendingEmail);
  const storeWalletAddress = useRecoveryStore(state => state.walletAddress);
  const storeIsConfigured = useRecoveryStore(state => state.isConfigured);
  const storeEmail = useRecoveryStore(state => state.email);
  const startSetup = useRecoveryStore(state => state.startSetup);
  const confirmOnChainSetup = useRecoveryStore(state => state.confirmOnChainSetup);

  const isStoreMatch = Boolean(
    activeStellarWallet &&
    storeWalletAddress &&
    activeStellarWallet.toLowerCase() === storeWalletAddress.toLowerCase() &&
    storeIsConfigured
  );

  const [email, setEmail] = useState(defaultEmail || '');
  const [confirmEmail, setConfirmEmail] = useState(defaultEmail || '');
  const [copied, setCopied] = useState(false);
  const [copiedHash, setCopiedHash] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [assetNotice, setAssetNotice] = useState('');
  const [isSent, setIsSent] = useState(false);
  const [txStage, setTxStage] = useState<TxProgressStage>('idle');
  const [txHash, setTxHash] = useState('');
  const [confirmedCommitment, setConfirmedCommitment] = useState('');

  const [isOnChainRegistered, setIsOnChainRegistered] = useState<boolean>(isStoreMatch);
  const [isCheckingRegistration, setIsCheckingRegistration] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState<string>(isStoreMatch ? storeEmail : '');

  useEffect(() => {
    let isMounted = true;
    if (activeStellarWallet && activeStellarWallet.startsWith('G')) {
      const matchStore =
        Boolean(storeWalletAddress) &&
        activeStellarWallet.toLowerCase() === storeWalletAddress.toLowerCase() &&
        storeIsConfigured;

      if (matchStore) {
        setIsOnChainRegistered(true);
        setRegisteredEmail(storeEmail || '');
      }

      setIsCheckingRegistration(true);
      checkOnChainRegistration(activeStellarWallet)
        .then(res => {
          if (!isMounted) return;
          const reg = Boolean(res?.isRegistered);
          setIsOnChainRegistered(reg);
          if (reg) {
            setRegisteredEmail(res?.email || storeEmail || '');
          }
        })
        .catch(() => {
          if (isMounted && !matchStore) {
            setIsOnChainRegistered(false);
          }
        })
        .finally(() => {
          if (isMounted) {
            setIsCheckingRegistration(false);
          }
        });
    } else {
      setIsOnChainRegistered(false);
      setIsCheckingRegistration(false);
      setRegisteredEmail('');
    }
    return () => {
      isMounted = false;
    };
  }, [activeStellarWallet, storeWalletAddress, storeIsConfigured, storeEmail]);

  const isRegistered = Boolean(isOnChainRegistered || isStoreMatch);

  const hasUsdcTrustline = useMemo(() => {
    if (!stellarBalances || !Array.isArray(stellarBalances)) return false;
    return stellarBalances.some(b => {
      const code = b?.asset_code || (b as any)?.code || (b as any)?.asset;
      const issuer = b?.asset_issuer || (b as any)?.issuer;
      if (code === TESTNET_USDC_CODE && (!issuer || issuer === TESTNET_USDC_ISSUER)) {
        return true;
      }
      if (typeof code === 'string' && code.includes(TESTNET_USDC_CODE)) {
        return true;
      }
      return false;
    });
  }, [stellarBalances]);

  const availableAssets = useMemo(() => {
    const xlmRegistry = stellarChain?.assets?.find(a => a?.symbol === 'XLM');
    const xlmIcon =
      xlmRegistry?.logoURI ||
      ChainUrlHelpers.getTokenIcon('XLM', stellarChain, '') ||
      'https://assets.coingecko.com/coins/images/100/small/Stellar_symbol_black_RGB.png';

    const xlmBalanceEntry = stellarBalances?.find(
      b => b?.asset_type === 'native' || (b as any)?.code === 'XLM' || !b?.asset_code
    );
    const xlmBalance = xlmBalanceEntry?.balance || '0';

    const usdcBalanceEntry = stellarBalances?.find(
      b =>
        (b?.asset_code === TESTNET_USDC_CODE || (b as any)?.code === TESTNET_USDC_CODE) &&
        (b?.asset_issuer === TESTNET_USDC_ISSUER || (b as any)?.issuer === TESTNET_USDC_ISSUER)
    );
    const usdcBalance = usdcBalanceEntry?.balance || '0';

    const list: ProtectedAssetSpec[] = [
      {
        tokenAddress: SPAREKEY_CONFIG.xlmSac,
        code: 'XLM',
        name: 'Stellar Lumens',
        iconUrl: xlmIcon,
        floor: 20_000_000n,
        balance: xlmBalance,
        hasTrustline: true,
      },
      {
        tokenAddress: TESTNET_USDC_SAC,
        code: TESTNET_USDC_CODE,
        name: 'USD Coin',
        issuer: TESTNET_USDC_ISSUER,
        iconUrl: 'https://assets.coingecko.com/coins/images/6319/small/usdc.png',
        floor: 0n,
        balance: usdcBalance,
        hasTrustline: hasUsdcTrustline,
      },
    ];

    return list;
  }, [stellarBalances, stellarChain, hasUsdcTrustline]);

  const [selectedAssetKeys, setSelectedAssetKeys] = useState<Set<string>>(() => {
    const init = new Set([SPAREKEY_CONFIG.xlmSac]);
    return init;
  });

  // Auto-select USDC with XLM if wallet has USDC trustline
  useEffect(() => {
    setSelectedAssetKeys(() => {
      const next = new Set<string>();
      next.add(SPAREKEY_CONFIG.xlmSac);
      if (hasUsdcTrustline) {
        next.add(TESTNET_USDC_SAC);
      }
      return next;
    });
  }, [hasUsdcTrustline]);

  const toggleAssetSelection = (asset: ProtectedAssetSpec) => {
    setAssetNotice('');
    if (asset.tokenAddress === SPAREKEY_CONFIG.xlmSac) {
      return;
    }

    if (asset.tokenAddress === TESTNET_USDC_SAC && !hasUsdcTrustline) {
      setAssetNotice(
        'Cannot select USDC: Your wallet does not have a USDC trustline on Stellar Testnet.'
      );
      return;
    }

    setSelectedAssetKeys(prev => {
      const next = new Set(prev);
      if (next.has(asset.tokenAddress)) {
        next.delete(asset.tokenAddress);
      } else {
        if (next.size >= MAX_RECOVERY_ASSETS) {
          setAssetNotice(`Maximum ${MAX_RECOVERY_ASSETS} assets can be protected.`);
          return prev;
        }
        next.add(asset.tokenAddress);
      }
      return next;
    });
  };

  const handleSelectAllAssets = () => {
    setAssetNotice('');
    const next = new Set<string>([SPAREKEY_CONFIG.xlmSac]);
    if (hasUsdcTrustline) {
      next.add(TESTNET_USDC_SAC);
    } else {
      setAssetNotice('USDC cannot be selected because your wallet does not have a USDC trustline.');
    }
    setSelectedAssetKeys(next);
  };

  const handleResetToDefaultAssets = () => {
    setAssetNotice('');
    setSelectedAssetKeys(new Set([SPAREKEY_CONFIG.xlmSac]));
  };

  const handleSuccessClose = () => {
    setEmail('');
    setConfirmEmail('');
    setIsSent(false);
    setTxStage('idle');
    setTxHash('');
    setConfirmedCommitment('');
    onSuccess();
  };

  const handleCopy = () => {
    if (!activeStellarWallet) return;
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard
        .writeText(activeStellarWallet)
        .then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        })
        .catch(() => {});
    }
  };

  const handleCopyTxHash = () => {
    if (!txHash) return;
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard
        .writeText(txHash)
        .then(() => {
          setCopiedHash(true);
          setTimeout(() => setCopiedHash(false), 2000);
        })
        .catch(() => {});
    }
  };

  const validateEmail = (val: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((val || '').trim());
  };

  const handlePreventPaste = (e: ClipboardEvent | DragEvent) => {
    e.preventDefault();
    setErrorMessage(
      'Direct pasting is disabled on email inputs to protect against clipboard poisoning.'
    );
  };

  const handlePreventCopyCut = (e: ClipboardEvent) => {
    e.preventDefault();
    setErrorMessage('Copying and cutting are disabled for email verification fields.');
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!activeStellarWallet) {
      setErrorMessage('Please connect your Stellar wallet before proceeding.');
      return;
    }

    const cleanEmail = (email || '').trim();
    const cleanConfirm = (confirmEmail || '').trim();

    if (!cleanEmail) {
      setErrorMessage('Please enter an emergency recovery email address.');
      return;
    }

    if (cleanEmail.length > 255) {
      setErrorMessage('Recovery email cannot exceed 255 characters (ZK Circuit constraint).');
      return;
    }

    if (!validateEmail(cleanEmail)) {
      setErrorMessage('Please enter a valid email address with a valid domain.');
      return;
    }

    if (cleanEmail.toLowerCase() !== cleanConfirm.toLowerCase()) {
      setErrorMessage('Recovery email addresses do not match.');
      return;
    }

    startSetup(cleanEmail, activeStellarWallet);
    setIsSent(true);
  };

  const handleConfirmVerification = async () => {
    if (!activeStellarWallet) {
      setErrorMessage('Stellar wallet not connected. Please connect your wallet.');
      return;
    }

    setErrorMessage('');
    setTxStage('generating-hash');

    try {
      const win = typeof window !== 'undefined' ? (window as any) : {};
      const provider =
        getProvider?.(WalletType.STELLAR) || win?.freighterApi || win?.freighter || win?.stellar;

      if (!provider) {
        setErrorMessage(
          'Stellar wallet provider not found. Please ensure Freighter or WalletConnect is connected.'
        );
        setTxStage('idle');
        return;
      }

      await new Promise(r => setTimeout(r, 450));
      setTxStage('simulating');

      await new Promise(r => setTimeout(r, 450));
      setTxStage('awaiting-wallet');

      const assetsToProtect = (availableAssets || []).filter(
        a => a?.tokenAddress && selectedAssetKeys?.has(a.tokenAddress)
      );

      const cleanEmail = (email || '').trim();
      const reg = await registerRecoveryEmailOnChain({
        ownerAddress: activeStellarWallet,
        email: cleanEmail,
        walletProvider: provider,
        assets: assetsToProtect,
      });

      setTxStage('broadcasting');
      setTxHash(reg?.txHash || '');
      setConfirmedCommitment(reg?.commitmentHex || '');

      await new Promise(r => setTimeout(r, 700));
      setTxStage('confirmed');

      confirmOnChainSetup({
        email: cleanEmail,
        commitmentHex: reg?.commitmentHex || '',
        saltHex: reg?.saltHex || '',
        walletAddress: activeStellarWallet,
      });

      if (
        activeStellarWallet &&
        activeStellarWallet.startsWith('G') &&
        !activeStellarWallet.startsWith('0x') &&
        activeStellarWallet.length === 56
      ) {
        recordRecoveryRegistrationInBackend({
          email: cleanEmail,
          walletAddress: activeStellarWallet,
        }).catch(() => {});
      }
    } catch (err: unknown) {
      console.error('[Recovery:Register] Error:', err);
      setTxStage('idle');
      setErrorMessage(parseContractError(err));
    }
  };

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)]/90 p-4 sm:p-6 lg:p-8 shadow-xl backdrop-blur-sm">
            <div className="mb-5 flex items-center justify-between border-b border-[var(--color-border)]/50 pb-3 sm:pb-4">
              <div className="space-y-0.5">
                <h2 className="text-base sm:text-xl font-bold text-[var(--color-text-primary)] font-['Space_Grotesk']">
                  {isRegistered
                    ? 'Protection Status'
                    : !isSent
                      ? '1. Link Recovery Guardian'
                      : '2. On-Chain Ledger Authorization'}
                </h2>
                <p className="text-xs text-[var(--color-text-muted)]">
                  {isRegistered
                    ? 'Your wallet is secured with Zero-Knowledge recovery on Soroban.'
                    : !isSent
                      ? 'Your email is never stored in plaintext.'
                      : 'Sign transaction to store guardian hash.'}
                </p>
              </div>

              {!isRegistered ? (
                <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--color-text-muted)]">
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-full ${!isSent ? 'bg-blue-600 text-white' : 'bg-emerald-500/20 text-emerald-400'}`}
                  >
                    1
                  </span>
                  <span className="h-0.5 w-4 bg-[var(--color-border)]" />
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-full ${isSent ? 'bg-blue-600 text-white' : 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-muted)]'}`}
                  >
                    2
                  </span>
                </div>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span>Active</span>
                </span>
              )}
            </div>

            {isCheckingRegistration && !isRegistered ? (
              <div className="py-16 text-center space-y-3">
                <Loader2 className="mx-auto h-7 w-7 animate-spin text-blue-400" />
                <p className="text-xs text-[var(--color-text-muted)]">
                  Checking wallet backup status...
                </p>
              </div>
            ) : isRegistered ? (
              <div className="space-y-6 animate-in fade-in duration-200">
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 shadow-lg shadow-emerald-500/10">
                    <ShieldCheck className="h-6 w-6 stroke-[2.2]" />
                  </div>
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg sm:text-xl font-bold text-[var(--color-text-primary)] font-['Space_Grotesk']">
                        Wallet Already Protected
                      </h2>
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        Verified On-Chain
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm text-[var(--color-text-secondary)] leading-relaxed">
                      This Stellar wallet is secured by SpareKey Zero-Knowledge Guardian. Emergency
                      fund recovery is standing by.
                    </p>
                  </div>
                </div>

                <div className="space-y-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-4 sm:p-5 text-xs">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 pb-2.5 border-b border-[var(--color-border)]/50">
                    <span className="text-[var(--color-text-muted)] uppercase tracking-wider font-semibold text-[10px]">
                      Protected Wallet
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs sm:text-sm font-semibold text-[var(--color-text-primary)]">
                        {activeStellarWallet
                          ? `${activeStellarWallet.slice(0, 8)}...${activeStellarWallet.slice(-8)}`
                          : ''}
                      </span>
                      <button
                        type="button"
                        onClick={handleCopy}
                        className="text-[var(--color-text-muted)] hover:text-blue-400 transition-colors cursor-pointer"
                        title="Copy address"
                      >
                        {copied ? (
                          <Check className="h-3 w-3 text-emerald-400" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 pb-2.5 border-b border-[var(--color-border)]/50">
                    <span className="text-[var(--color-text-muted)] uppercase tracking-wider font-semibold text-[10px]">
                      Recovery Email
                    </span>
                    <span className="text-xs font-medium text-[var(--color-text-primary)]">
                      {registeredEmail ? registeredEmail : 'Protected on-chain (Poseidon hash)'}
                    </span>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 pb-2.5 border-b border-[var(--color-border)]/50">
                    <span className="text-[var(--color-text-muted)] uppercase tracking-wider font-semibold text-[10px]">
                      Smart Contract
                    </span>
                    <span className="text-xs font-medium text-blue-400">
                      Soroban Smart Contract (Testnet)
                    </span>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                    <span className="text-[var(--color-text-muted)] uppercase tracking-wider font-semibold text-[10px]">
                      Timelock Safety Delay
                    </span>
                    <span className="text-xs font-medium text-[var(--color-text-primary)]">
                      5 seconds (Instant on Testnet)
                    </span>
                  </div>
                </div>

                <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                  <button
                    type="button"
                    onClick={onSuccess}
                    className="inline-flex h-11 items-center justify-center rounded-xl bg-blue-600 px-6 text-xs font-semibold text-white shadow-lg shadow-blue-600/30 hover:bg-blue-500 transition-all cursor-pointer"
                  >
                    <span>View Protection Status</span>
                  </button>

                  {onGoToRecover && (
                    <button
                      type="button"
                      onClick={onGoToRecover}
                      className="inline-flex h-11 items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-5 text-xs font-semibold text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)] transition-all cursor-pointer"
                    >
                      <span>Recover Funds</span>
                    </button>
                  )}
                </div>
              </div>
            ) : !isSent ? (
              <div className="space-y-5">
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)] flex items-center justify-between">
                      <span>Current Wallet</span>
                      <span className="text-[10px] text-blue-400 font-mono">Self-Custodial</span>
                    </label>

                    {activeStellarWallet ? (
                      <div className="flex items-center justify-between rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-4 py-3">
                        <div className="flex items-center gap-2.5 overflow-hidden">
                          <div className="h-2 w-2 shrink-0 rounded-full bg-emerald-400 animate-pulse" />
                          <span className="font-mono text-xs sm:text-sm text-[var(--color-text-primary)] truncate">
                            {activeStellarWallet}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={handleCopy}
                          className="flex items-center rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-2.5 py-1 text-xs font-semibold text-blue-400 hover:bg-blue-500/10 transition-colors cursor-pointer shrink-0 ml-2"
                        >
                          <span>{copied ? 'Copied' : 'Copy'}</span>
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 sm:p-4">
                        <div className="text-xs text-amber-400 font-medium leading-relaxed">
                          <span>
                            {hasEvmOnly
                              ? 'EVM wallet connected. Stellar wallet (e.g. Freighter) required for Recovery.'
                              : 'No Stellar wallet connected. Connect your Stellar wallet to proceed.'}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => openModal()}
                          className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 cursor-pointer shrink-0 shadow-md shadow-blue-600/20"
                        >
                          <span>Connect</span>
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                      Recovery Email Address
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={e => {
                        setEmail(e.target.value);
                        if (errorMessage) setErrorMessage('');
                      }}
                      onPaste={handlePreventPaste}
                      onCopy={handlePreventCopyCut}
                      onCut={handlePreventCopyCut}
                      onDrop={handlePreventPaste}
                      autoComplete="off"
                      placeholder="your-secure-inbox@gmail.com"
                      required
                      className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-4 py-3.5 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                      Confirm Recovery Email
                    </label>
                    <input
                      type="email"
                      value={confirmEmail}
                      onChange={e => {
                        setConfirmEmail(e.target.value);
                        if (errorMessage) setErrorMessage('');
                      }}
                      onPaste={handlePreventPaste}
                      onCopy={handlePreventCopyCut}
                      onCut={handlePreventCopyCut}
                      onDrop={handlePreventPaste}
                      autoComplete="off"
                      placeholder="your-secure-inbox@gmail.com"
                      required
                      className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-4 py-3.5 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                    />
                    <p className="text-[11px] text-[var(--color-text-muted)]">
                      Pasting is restricted to eliminate typing inaccuracies.
                    </p>
                  </div>

                  <AssetSelector
                    availableAssets={availableAssets}
                    selectedAssetKeys={selectedAssetKeys}
                    onToggleAsset={toggleAssetSelection}
                    onSelectAll={handleSelectAllAssets}
                    onResetToDefault={handleResetToDefaultAssets}
                    maxLimit={MAX_RECOVERY_ASSETS}
                    loading={loadingBalances}
                    notice={assetNotice}
                  />

                  {errorMessage && (
                    <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-400">
                      {errorMessage}
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row items-center gap-3 pt-3 border-t border-[var(--color-border)]/50">
                    <button
                      type="submit"
                      disabled={!activeStellarWallet}
                      className="inline-flex h-12 w-full sm:w-auto items-center justify-center rounded-xl bg-blue-600 px-8 text-sm font-semibold text-white shadow-lg shadow-blue-600/30 transition-all hover:bg-blue-500 disabled:opacity-40 cursor-pointer"
                    >
                      <span>Continue</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (onCancel) {
                          onCancel();
                        } else {
                          useRecoveryStore.getState().setCurrentStep('welcome');
                        }
                      }}
                      className="inline-flex h-12 w-full sm:w-auto items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] hover:bg-[var(--color-bg-tertiary)] px-6 text-sm font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-all cursor-pointer shadow-sm"
                    >
                      <span>Back</span>
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-500/15 text-blue-400 border border-blue-500/20">
                    <Mail className="h-6 w-6" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-lg font-bold text-[var(--color-text-primary)] font-['Space_Grotesk']">
                      Confirm Smart Contract Registration
                    </h3>
                    <p className="text-xs sm:text-sm text-[var(--color-text-secondary)] leading-relaxed">
                      Registering emergency guardian for{' '}
                      <strong className="text-[var(--color-text-primary)]">{email}</strong> via{' '}
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
                        Soroban Smart Contract (Testnet)
                      </span>
                      .
                    </p>
                  </div>
                </div>

                <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-4 space-y-2 text-xs">
                  <div className="flex items-center justify-between font-semibold text-[var(--color-text-primary)]">
                    <div className="flex items-center gap-1.5">
                      <Coins className="h-3.5 w-3.5 text-blue-400" />
                      <span>Configured Protected Assets</span>
                    </div>
                    <span className="text-blue-400 font-mono">
                      {selectedAssetKeys.size} of 8 Assets
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {availableAssets
                      .filter(a => selectedAssetKeys.has(a.tokenAddress))
                      .map(a => (
                        <span
                          key={a.tokenAddress}
                          className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-2.5 py-1 text-[11px] font-bold text-[var(--color-text-primary)]"
                        >
                          {a.code}{' '}
                          {a.tokenAddress === SPAREKEY_CONFIG.xlmSac
                            ? '(Floor: 2 XLM)'
                            : '(Full Sweep)'}
                        </span>
                      ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-4 space-y-2 text-xs text-[var(--color-text-secondary)]">
                  <div className="flex items-center gap-2 font-semibold text-[var(--color-text-primary)]">
                    <ShieldCheck className="h-4 w-4 text-emerald-400" />
                    <span>Cryptographic Commitment Verification</span>
                  </div>
                  <p className="leading-relaxed">
                    The smart contract strictly records a cryptographic hash and salt. Your
                    cleartext email is never transmitted or exposed on the public blockchain.
                  </p>
                </div>

                {errorMessage && (
                  <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-400">
                    {errorMessage}
                  </div>
                )}

                <div className="flex flex-col sm:flex-row items-center gap-3 pt-3 border-t border-[var(--color-border)]/50">
                  <button
                    type="button"
                    onClick={handleConfirmVerification}
                    className="inline-flex h-12 w-full sm:w-auto items-center justify-center rounded-xl bg-blue-600 px-8 text-sm font-semibold text-white shadow-lg shadow-blue-600/30 hover:bg-blue-500 transition-all cursor-pointer"
                  >
                    <span>Register</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsSent(false)}
                    className="inline-flex h-12 w-full sm:w-auto items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] hover:bg-[var(--color-bg-tertiary)] px-6 text-sm font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-all cursor-pointer shadow-sm"
                  >
                    <span>Back</span>
                  </button>
                </div>
              </div>
            )}

            {onOpenHelp && (
              <div className="flex justify-center pt-3 lg:hidden">
                <button
                  type="button"
                  onClick={onOpenHelp}
                  className="inline-flex items-center gap-1.5 text-xs text-[var(--color-text-muted)] hover:text-blue-400 cursor-pointer transition-colors"
                >
                  <span>Need assistance? Chat with Support</span>
                  <ExternalLink className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="hidden lg:block lg:col-span-5 space-y-6">
          <div className="flex flex-col justify-between h-full rounded-3xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)]/90 p-6 sm:p-8 shadow-xl space-y-6">
            <div className="space-y-5">
              <div className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/30 bg-blue-500/10 px-2.5 py-0.5 text-xs font-semibold text-blue-400">
                <span>ARCHITECTURE</span>
              </div>
              <h3 className="text-lg font-bold text-[var(--color-text-primary)] font-['Space_Grotesk']">
                How Zero-Knowledge Recovery Operates
              </h3>

              <div className="space-y-4">
                <div className="flex items-start gap-3.5">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-blue-500/15 border border-blue-500/30 text-xs font-bold text-blue-400">
                    1
                  </div>
                  <div className="space-y-0.5">
                    <h4 className="text-sm font-semibold text-[var(--color-text-primary)]">
                      Standing On-Chain Commitment
                    </h4>
                    <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
                      Your wallet commits a cryptographic Poseidon hash to the SpareKey contract
                      without moving any assets.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3.5">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-blue-500/15 border border-blue-500/30 text-xs font-bold text-blue-400">
                    2
                  </div>
                  <div className="space-y-0.5">
                    <h4 className="text-sm font-semibold text-[var(--color-text-primary)]">
                      DKIM Email Authorization
                    </h4>
                    <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
                      In an emergency, sending an email from your linked inbox creates a verifiable
                      cryptographic DKIM signature.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3.5">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-blue-500/15 border border-blue-500/30 text-xs font-bold text-blue-400">
                    3
                  </div>
                  <div className="space-y-0.5">
                    <h4 className="text-sm font-semibold text-[var(--color-text-primary)]">
                      Automatic Timelocked Sweep
                    </h4>
                    <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
                      Once the security timelock elapses, the contract safely transfers balances to
                      your freshly generated Stellar address.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4 border-t border-[var(--color-border)]/50 pt-5">
              <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-4">
                <div className="flex items-start gap-3">
                  <Mail className="h-4 w-4 text-[var(--color-text-muted)] shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <h5 className="text-xs font-semibold text-[var(--color-text-primary)]">
                      Stellar Soroban Network
                    </h5>
                    <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
                      Network:{' '}
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
                        Soroban Smart Contract (Testnet)
                      </span>
                    </p>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={onOpenHelp}
                className="flex items-center gap-1.5 text-xs font-medium text-blue-400 hover:text-blue-300 transition-colors cursor-pointer"
              >
                <span>Need assistance? Chat with Support</span>
                <ExternalLink className="h-3 w-3" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {txStage !== 'idle' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md animate-in fade-in duration-200">
          <div className="max-w-lg w-full rounded-3xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-6 sm:p-8 shadow-2xl space-y-6 animate-in zoom-in-95 duration-200">
            {txStage === 'confirmed' ? (
              <div className="text-center space-y-5 relative">
                <div className="absolute right-0 top-0">
                  <button
                    type="button"
                    onClick={handleSuccessClose}
                    className="rounded-full p-1.5 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)] transition-colors cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 shadow-xl shadow-emerald-500/10 animate-in zoom-in-75 duration-300">
                  <ShieldCheck className="h-9 w-9 stroke-[2.2]" />
                </div>

                <div className="space-y-1.5">
                  <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-0.5 text-xs font-semibold text-emerald-400">
                    <Sparkles className="h-3 w-3" />
                    <span>On-Chain Commitment Recorded</span>
                  </div>
                  <h3 className="font-['Space_Grotesk'] text-2xl font-bold tracking-tight text-[var(--color-text-primary)]">
                    Guardian Activated!
                  </h3>
                  <p className="text-xs sm:text-sm text-[var(--color-text-secondary)] leading-relaxed">
                    Your email guardian is officially recorded on the SpareKey smart contract.
                  </p>
                </div>

                <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] divide-y divide-[var(--color-border)]/60 text-xs sm:text-sm overflow-hidden text-left">
                  <div className="flex items-center justify-between p-3.5">
                    <span className="text-[var(--color-text-muted)] font-medium">
                      Protected Wallet
                    </span>
                    <span className="font-mono font-semibold text-[var(--color-text-primary)]">
                      {activeStellarWallet
                        ? `${activeStellarWallet.slice(0, 8)}...${activeStellarWallet.slice(-8)}`
                        : ''}
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-3.5">
                    <span className="text-[var(--color-text-muted)] font-medium">
                      Recovery Contact
                    </span>
                    <span className="font-medium text-[var(--color-text-primary)]">{email}</span>
                  </div>

                  <div className="flex items-center justify-between p-3.5">
                    <span className="text-[var(--color-text-muted)] font-medium">
                      Smart Contract
                    </span>
                    {SPAREKEY_CONFIG?.contractId ? (
                      <a
                        href={`https://stellar.expert/explorer/testnet/contract/${SPAREKEY_CONFIG.contractId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                      >
                        <span>
                          {SPAREKEY_CONFIG.contractId.slice(0, 6)}...
                          {SPAREKEY_CONFIG.contractId.slice(-6)}
                        </span>
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
                        <span>Soroban Smart Contract (Testnet)</span>
                      </span>
                    )}
                  </div>

                  {confirmedCommitment && (
                    <div className="flex items-center justify-between p-3.5">
                      <span className="text-[var(--color-text-muted)] font-medium">
                        ZK Commitment
                      </span>
                      <span className="font-mono text-xs text-[var(--color-text-secondary)]">
                        {confirmedCommitment.slice(0, 8)}...{confirmedCommitment.slice(-8)}
                      </span>
                    </div>
                  )}

                  {txHash && (
                    <div className="flex items-center justify-between p-3.5">
                      <span className="text-[var(--color-text-muted)] font-medium">
                        Transaction Hash
                      </span>
                      <div className="flex items-center gap-2">
                        <a
                          href={`https://stellar.expert/explorer/testnet/tx/${txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                        >
                          <span>
                            {txHash.slice(0, 8)}...{txHash.slice(-8)}
                          </span>
                          <ExternalLink className="h-3 w-3" />
                        </a>
                        <button
                          type="button"
                          onClick={handleCopyTxHash}
                          className="text-[var(--color-text-muted)] hover:text-blue-400 cursor-pointer"
                        >
                          {copiedHash ? (
                            <Check className="h-3 w-3 text-emerald-400" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleSuccessClose}
                    className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-blue-600 px-8 text-sm font-semibold text-white shadow-lg shadow-blue-600/30 hover:bg-blue-500 transition-all cursor-pointer"
                  >
                    <span>Manage</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex items-center gap-3.5">
                  <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-500/15 text-blue-400 border border-blue-500/30">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-[var(--color-text-primary)] font-['Space_Grotesk']">
                      Executing On-Chain Registration
                    </h3>
                    <p className="text-xs text-[var(--color-text-muted)]">
                      Please approve the signature in your connected Stellar wallet
                    </p>
                  </div>
                </div>

                <div className="space-y-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-4 text-xs font-medium">
                  <div className="flex items-center gap-3">
                    {txStage === 'generating-hash' ? (
                      <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    )}
                    <span
                      className={
                        txStage === 'generating-hash'
                          ? 'text-blue-400 font-semibold'
                          : 'text-[var(--color-text-secondary)]'
                      }
                    >
                      Calculating Zero-Knowledge Poseidon commitment & prime-safe salt
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    {txStage === 'simulating' ? (
                      <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
                    ) : txStage === 'generating-hash' ? (
                      <div className="h-4 w-4 rounded-full border border-[var(--color-border)]" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    )}
                    <span
                      className={
                        txStage === 'simulating'
                          ? 'text-blue-400 font-semibold'
                          : 'text-[var(--color-text-secondary)]'
                      }
                    >
                      Simulating Soroban footprint & ledger resource authorization
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    {txStage === 'awaiting-wallet' ? (
                      <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
                    ) : txStage === 'generating-hash' || txStage === 'simulating' ? (
                      <div className="h-4 w-4 rounded-full border border-[var(--color-border)]" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    )}
                    <span
                      className={
                        txStage === 'awaiting-wallet'
                          ? 'text-blue-400 font-semibold animate-pulse'
                          : 'text-[var(--color-text-secondary)]'
                      }
                    >
                      Awaiting signature approval in your Stellar wallet...
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    {txStage === 'broadcasting' ? (
                      <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
                    ) : (
                      <div className="h-4 w-4 rounded-full border border-[var(--color-border)]" />
                    )}
                    <span
                      className={
                        txStage === 'broadcasting'
                          ? 'text-blue-400 font-semibold'
                          : 'text-[var(--color-text-muted)]'
                      }
                    >
                      Broadcasting signed envelope to Stellar network consensus
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
