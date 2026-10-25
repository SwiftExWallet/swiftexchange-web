import {
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Loader2,
  // Mail,
  ShieldCheck,
  X,
} from 'lucide-react';
import type { ClipboardEvent, DragEvent, FC, FormEvent, ReactNode } from 'react';
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

interface RawStellarBalance {
  asset_type?: string;
  asset_code?: string;
  asset_issuer?: string;
  code?: string;
  asset?: string;
  issuer?: string;
  balance?: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const validateEmail = (val: string): boolean => EMAIL_REGEX.test((val || '').trim());

const truncateHash = (str?: string, start = 8, end = 8): string => {
  if (!str) return '';
  if (str.length <= start + end) return str;
  return `${str.slice(0, start)}...${str.slice(-end)}`;
};

const HOW_IT_WORKS_STEPS = [
  {
    title: 'Private Setup',
    desc: 'An encrypted hash of your email is saved on-chain. Your actual email stays private.',
  },
  {
    title: 'Email Verification',
    desc: 'If you lose wallet access, verify ownership by sending a standard email.',
  },
  {
    title: 'Safe Transfer',
    desc: 'After a short security delay, your protected funds move to your new wallet.',
  },
] as const;

const TX_PROGRESS_STEPS: { key: TxProgressStage; label: string }[] = [
  { key: 'generating-hash', label: 'Generating encrypted email commitment' },
  { key: 'simulating', label: 'Preparing transaction details' },
  { key: 'awaiting-wallet', label: 'Waiting for wallet signature' },
  { key: 'broadcasting', label: 'Submitting to Stellar network' },
];

const SummaryRow: FC<{ label: string; children: ReactNode }> = ({ label, children }) => (
  <div className="flex items-center justify-between gap-4 py-3 text-xs sm:text-sm">
    <span className="text-[var(--color-text-muted)]">{label}</span>
    <div className="font-medium text-[var(--color-text-primary)] text-right">{children}</div>
  </div>
);

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
  const startSetup = useRecoveryStore(state => state.startSetup);
  const confirmOnChainSetup = useRecoveryStore(state => state.confirmOnChainSetup);

  const [email, setEmail] = useState(defaultEmail || '');
  const [confirmEmail, setConfirmEmail] = useState(defaultEmail || '');
  const [copied, setCopied] = useState(false);
  const [copiedHash, setCopiedHash] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [assetNotice, setAssetNotice] = useState('');
  const [isSent, setIsSent] = useState(false);
  const [txStage, setTxStage] = useState<TxProgressStage>('idle');
  const [txHash, setTxHash] = useState('');

  const hasUsdcTrustline = useMemo(() => {
    if (!stellarBalances || !Array.isArray(stellarBalances)) return false;
    return (stellarBalances as RawStellarBalance[]).some(b => {
      const code = b?.asset_code || b?.code || b?.asset;
      const issuer = b?.asset_issuer || b?.issuer;
      if (code === TESTNET_USDC_CODE && (!issuer || issuer === TESTNET_USDC_ISSUER)) {
        return true;
      }
      return typeof code === 'string' && code.includes(TESTNET_USDC_CODE);
    });
  }, [stellarBalances]);

  const availableAssets = useMemo<ProtectedAssetSpec[]>(() => {
    const balances = (stellarBalances as RawStellarBalance[]) || [];
    const xlmRegistry = stellarChain?.assets?.find(a => a?.symbol === 'XLM');
    const xlmIcon =
      xlmRegistry?.logoURI ||
      ChainUrlHelpers.getTokenIcon('XLM', stellarChain, '') ||
      'https://assets.coingecko.com/coins/images/100/small/Stellar_symbol_black_RGB.png';

    const xlmBalanceEntry = balances.find(
      b => b?.asset_type === 'native' || b?.code === 'XLM' || !b?.asset_code
    );
    const usdcBalanceEntry = balances.find(
      b =>
        (b?.asset_code === TESTNET_USDC_CODE || b?.code === TESTNET_USDC_CODE) &&
        (b?.asset_issuer === TESTNET_USDC_ISSUER || b?.issuer === TESTNET_USDC_ISSUER)
    );

    return [
      {
        tokenAddress: SPAREKEY_CONFIG.xlmSac,
        code: 'XLM',
        name: 'Stellar Lumens',
        iconUrl: xlmIcon,
        floor: 20_000_000n,
        balance: xlmBalanceEntry?.balance || '0',
        hasTrustline: true,
      },
      {
        tokenAddress: TESTNET_USDC_SAC,
        code: TESTNET_USDC_CODE,
        name: 'USD Coin',
        issuer: TESTNET_USDC_ISSUER,
        iconUrl: 'https://assets.coingecko.com/coins/images/6319/small/usdc.png',
        floor: 0n,
        balance: usdcBalanceEntry?.balance || '0',
        hasTrustline: hasUsdcTrustline,
      },
    ];
  }, [stellarBalances, stellarChain, hasUsdcTrustline]);

  const [selectedAssetKeys, setSelectedAssetKeys] = useState<Set<string>>(
    () => new Set([SPAREKEY_CONFIG.xlmSac])
  );

  useEffect(() => {
    const next = new Set<string>([SPAREKEY_CONFIG.xlmSac]);
    if (hasUsdcTrustline) {
      next.add(TESTNET_USDC_SAC);
    }
    setSelectedAssetKeys(next);
  }, [hasUsdcTrustline]);

  const toggleAssetSelection = (asset: ProtectedAssetSpec) => {
    setAssetNotice('');
    if (asset.tokenAddress === SPAREKEY_CONFIG.xlmSac) return;

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
    onSuccess();
  };

  const copyText = (text: string, onCopied: (val: boolean) => void) => {
    if (!text || !navigator?.clipboard?.writeText) return;
    navigator.clipboard
      .writeText(text)
      .then(() => {
        onCopied(true);
        setTimeout(() => onCopied(false), 2000);
      })
      .catch(() => {});
  };

  const handleCopy = () => copyText(activeStellarWallet, setCopied);
  const handleCopyTxHash = () => copyText(txHash, setCopiedHash);

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
      const win =
        typeof window !== 'undefined' ? (window as unknown as Record<string, unknown>) : {};
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

      const assetsToProtect = availableAssets.filter(
        a => a?.tokenAddress && selectedAssetKeys.has(a.tokenAddress)
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

  const activeStageIndex = TX_PROGRESS_STEPS.findIndex(s => s.key === txStage);

  return (
    <div className="max-w-5xl mx-auto">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
        {/* Main Card */}
        <div className="lg:col-span-7 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-5 sm:p-7 shadow-lg">
          {/* Card Header */}
          <div className="mb-6 flex items-start justify-between gap-4 border-b border-[var(--color-border)]/60 pb-4">
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-[var(--color-text-primary)] font-['Space_Grotesk']">
                {!isSent ? 'Set Up Recovery Email' : 'Review & Confirm'}
              </h2>
              <p className="mt-0.5 text-xs sm:text-sm text-[var(--color-text-muted)]">
                {!isSent
                  ? 'Link an email to recover your funds if you lose wallet access.'
                  : 'Approve the transaction in your wallet to activate recovery.'}
              </p>
            </div>

            <span className="shrink-0 rounded-lg bg-[var(--color-bg-primary)] px-2.5 py-1 text-xs font-medium text-[var(--color-text-secondary)] border border-[var(--color-border)]">
              Step {isSent ? '2' : '1'} of 2
            </span>
          </div>

          {!isSent ? (
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Connected Wallet Box */}
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-[var(--color-text-secondary)]">
                  Connected Wallet
                </label>

                {activeStellarWallet ? (
                  <div className="flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3.5 py-2.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400" />
                      <span className="font-mono text-xs sm:text-sm text-[var(--color-text-primary)] truncate">
                        {activeStellarWallet}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={handleCopy}
                      className="ml-3 shrink-0 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-2.5 py-1 text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors cursor-pointer"
                    >
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5">
                    <span className="text-xs text-amber-400">
                      {hasEvmOnly
                        ? 'EVM wallet detected. Please connect a Stellar wallet (e.g. Freighter).'
                        : 'Connect your Stellar wallet to continue.'}
                    </span>
                    <button
                      type="button"
                      onClick={() => openModal()}
                      className="shrink-0 rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 transition-colors cursor-pointer"
                    >
                      Connect
                    </button>
                  </div>
                )}
              </div>

              {/* Email Inputs */}
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-[var(--color-text-secondary)]">
                    Recovery Email
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
                    placeholder="name@example.com"
                    required
                    className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3.5 py-3 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] outline-none transition-colors focus:border-blue-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-[var(--color-text-secondary)]">
                    Confirm Email
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
                    placeholder="Re-enter your email"
                    required
                    className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3.5 py-3 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] outline-none transition-colors focus:border-blue-500"
                  />
                  <p className="text-[11px] text-[var(--color-text-muted)]">
                    Copy and paste is disabled to prevent typos.
                  </p>
                </div>
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
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-400">
                  {errorMessage}
                </div>
              )}

              <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
                <button
                  type="submit"
                  disabled={!activeStellarWallet}
                  className="inline-flex h-11 w-full sm:w-auto items-center justify-center rounded-xl bg-blue-600 px-7 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-40 cursor-pointer"
                >
                  Continue
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
                  className="inline-flex h-11 w-full sm:w-auto items-center justify-center rounded-xl border border-[var(--color-border)] bg-transparent hover:bg-[var(--color-bg-tertiary)] px-5 text-sm font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors cursor-pointer"
                >
                  Back
                </button>
              </div>
            </form>
          ) : (
            /* State 4: Review & Confirm (Step 2) */
            <div className="space-y-5">
              <div className="divide-y divide-[var(--color-border)]/50 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-4">
                <SummaryRow label="Recovery Email">{email}</SummaryRow>
                <SummaryRow label="Wallet">{truncateHash(activeStellarWallet)}</SummaryRow>
                <SummaryRow label="Network">Stellar Testnet</SummaryRow>
                <SummaryRow label="Protected Assets">
                  <div className="flex flex-wrap justify-end gap-1.5">
                    {availableAssets
                      .filter(a => selectedAssetKeys.has(a.tokenAddress))
                      .map(a => (
                        <span
                          key={a.tokenAddress}
                          className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-2 py-0.5 text-xs font-medium text-[var(--color-text-primary)]"
                        >
                          {a.code}
                          {a.tokenAddress === SPAREKEY_CONFIG.xlmSac ? ' (2 XLM reserved)' : ''}
                        </span>
                      ))}
                  </div>
                </SummaryRow>
              </div>

              <div className="flex items-start gap-2.5 rounded-xl bg-[var(--color-bg-primary)]/60 p-3.5 text-xs text-[var(--color-text-secondary)]">
                <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-400 mt-0.5" />
                <p className="leading-relaxed">
                  Only an encrypted hash of your email is stored on-chain. Your email address is
                  never publicly visible.
                </p>
              </div>

              {errorMessage && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-400">
                  {errorMessage}
                </div>
              )}

              <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleConfirmVerification}
                  className="inline-flex h-11 w-full sm:w-auto items-center justify-center rounded-xl bg-blue-600 px-7 text-sm font-semibold text-white hover:bg-blue-500 transition-colors cursor-pointer"
                >
                  Confirm & Register
                </button>

                <button
                  type="button"
                  onClick={() => setIsSent(false)}
                  className="inline-flex h-11 w-full sm:w-auto items-center justify-center rounded-xl border border-[var(--color-border)] bg-transparent hover:bg-[var(--color-bg-tertiary)] px-5 text-sm font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors cursor-pointer"
                >
                  Back
                </button>
              </div>
            </div>
          )}

          {onOpenHelp && (
            <div className="flex justify-center pt-5 lg:hidden">
              <button
                type="button"
                onClick={onOpenHelp}
                className="inline-flex items-center gap-1.5 text-xs text-[var(--color-text-muted)] hover:text-blue-400 cursor-pointer transition-colors"
              >
                <span>Need help? Contact Support</span>
                <ExternalLink className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>

        {/* Right Info Panel */}
        <div className="hidden lg:flex lg:col-span-5 flex-col justify-between rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-6 sm:p-7 shadow-lg space-y-6">
          <div className="space-y-5">
            <div>
              <h3 className="text-base font-bold text-[var(--color-text-primary)] font-['Space_Grotesk']">
                How Email Recovery Works
              </h3>
              <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                Self-custodial backup powered by zero-knowledge proofs.
              </p>
            </div>

            <div className="space-y-4">
              {HOW_IT_WORKS_STEPS.map((step, idx) => (
                <div key={step.title} className="flex items-start gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-xs font-semibold text-blue-400">
                    {idx + 1}
                  </span>
                  <div className="space-y-0.5">
                    <h4 className="text-xs sm:text-sm font-semibold text-[var(--color-text-primary)]">
                      {step.title}
                    </h4>
                    <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
                      {step.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {onOpenHelp && (
            <div className="border-t border-[var(--color-border)]/60 pt-4">
              <button
                type="button"
                onClick={onOpenHelp}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-text-secondary)] hover:text-blue-400 transition-colors cursor-pointer"
              >
                <span>Need help? Contact Support</span>
                <ExternalLink className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Transaction Progress & Confirmation Modal */}
      {txStage !== 'idle' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="max-w-md w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-6 shadow-2xl">
            {txStage === 'confirmed' ? (
              <div className="space-y-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400">
                      <ShieldCheck className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-['Space_Grotesk'] text-lg font-bold text-[var(--color-text-primary)]">
                        Wallet Registered
                      </h3>
                      <p className="text-xs text-emerald-400 font-medium">
                        Aapka wallet recovery ke liye successfully register ho gaya hai.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleSuccessClose}
                    className="rounded-lg p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="divide-y divide-[var(--color-border)]/50 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-4">
                  <SummaryRow label="Wallet">{truncateHash(activeStellarWallet)}</SummaryRow>
                  <SummaryRow label="Recovery Email">{email}</SummaryRow>

                  <SummaryRow label="Network">Stellar Testnet</SummaryRow>

                  {txHash && (
                    <SummaryRow label="Transaction">
                      <div className="flex items-center gap-2">
                        <a
                          href={`https://stellar.expert/explorer/testnet/tx/${txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 font-mono text-xs text-blue-400 hover:text-blue-300"
                        >
                          <span>{truncateHash(txHash)}</span>
                          <ExternalLink className="h-3 w-3" />
                        </a>
                        <button
                          type="button"
                          onClick={handleCopyTxHash}
                          className="text-[var(--color-text-muted)] hover:text-blue-400 cursor-pointer"
                        >
                          {copiedHash ? (
                            <Check className="h-3.5 w-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>
                    </SummaryRow>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-3">
                  {onGoToRecover && (
                    <button
                      type="button"
                      onClick={onGoToRecover}
                      className="inline-flex h-11 flex-1 items-center justify-center rounded-xl bg-blue-600 px-6 text-sm font-semibold text-white hover:bg-blue-500 transition-colors cursor-pointer"
                    >
                      Recover Funds
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleSuccessClose}
                    className="inline-flex h-11 flex-1 items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-6 text-sm font-semibold text-[var(--color-text-primary)] hover:bg-[var(--color-bg-tertiary)] transition-colors cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="flex items-center gap-3">
                  <Loader2 className="h-5 w-5 shrink-0 animate-spin text-blue-400" />
                  <div>
                    <h3 className="text-base font-bold text-[var(--color-text-primary)] font-['Space_Grotesk']">
                      Activating Protection
                    </h3>
                    <p className="text-xs text-[var(--color-text-muted)]">
                      Please confirm the signature request in your wallet.
                    </p>
                  </div>
                </div>

                <div className="space-y-2.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-4 text-xs">
                  {TX_PROGRESS_STEPS.map((step, index) => {
                    const isActive = index === activeStageIndex;
                    const isCompleted = index < activeStageIndex;

                    return (
                      <div key={step.key} className="flex items-center gap-2.5">
                        {isActive ? (
                          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-blue-400" />
                        ) : isCompleted ? (
                          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                        ) : (
                          <div className="h-4 w-4 shrink-0 rounded-full border border-[var(--color-border)]" />
                        )}
                        <span
                          className={
                            isActive
                              ? 'font-medium text-[var(--color-text-primary)]'
                              : isCompleted
                                ? 'text-[var(--color-text-secondary)]'
                                : 'text-[var(--color-text-muted)]'
                          }
                        >
                          {step.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
