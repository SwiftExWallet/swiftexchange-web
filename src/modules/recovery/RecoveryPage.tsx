import { Shield } from 'lucide-react';
import type { FC } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { WalletType } from '@/modules/walletconnect/constants/Wallet';
import { useWalletConnect } from '@/modules/walletconnect/hooks/useWalletConnect';

import { useWalletStore } from '../walletconnect/store/walletConnectStore';
import { HelpSupportModal } from './components/HelpSupportModal';
import { HowRecoveryWorksPage } from './components/HowRecoveryWorksPage';
import { ProtectWalletForm } from './components/ProtectWalletForm';
import { RecoverWalletFlow } from './components/RecoverWalletFlow';
import { RecoveryActiveStatus } from './components/RecoveryActiveStatus';
import { RecoveryHero } from './components/RecoveryHero';
import { checkOnChainRegistration } from './services/sparekeyContractService';
import { useRecoveryStore } from './store/recoveryStore';

const RecoveryPage: FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentNetwork = useWalletStore(state => state.network);
  const setNetwork = useWalletStore(state => state.setNetwork);
  const currentStep = useRecoveryStore(state => state.currentStep);
  const isConfigured = useRecoveryStore(state => state.isConfigured);
  const storeWallet = useRecoveryStore(state => state.walletAddress);

  const { connectedWallets } = useWalletConnect();
  const rawStellar =
    connectedWallets?.[WalletType.STELLAR]?.address || connectedWallets?.stellar?.address;
  const activeStellarWallet =
    typeof rawStellar === 'string' && rawStellar.startsWith('G') && rawStellar.length === 56
      ? rawStellar
      : '';

  const isWalletConfigured = Boolean(
    isConfigured &&
    activeStellarWallet &&
    storeWallet &&
    activeStellarWallet.toLowerCase() === storeWallet.toLowerCase()
  );

  const [isHelpOpen, setIsHelpOpen] = useState(false);

  const rawTab = (
    searchParams.get('tab') ||
    searchParams.get('view') ||
    searchParams.get('action') ||
    searchParams.get('step') ||
    ''
  ).toLowerCase();

  const activeTabKey: 'welcome' | 'register' | 'recover' | 'how-it-works' | 'status' = [
    'register',
    'setup',
    'protect',
  ].includes(rawTab)
    ? 'register'
    : ['recover', 'restore', 'claim'].includes(rawTab) || rawTab.startsWith('recover-')
      ? 'recover'
      : ['status', 'active', 'settings', 'guardian'].includes(rawTab)
        ? 'status'
        : ['how-it-works', 'learn', 'architecture', 'faq'].includes(rawTab)
          ? 'how-it-works'
          : ['overview', 'welcome', 'home'].includes(rawTab)
            ? 'welcome'
            : currentStep === 'welcome'
              ? 'welcome'
              : currentStep === 'how-it-works'
                ? 'how-it-works'
                : currentStep === 'setup' || currentStep === 'setup-verifying'
                  ? 'register'
                  : currentStep === 'active'
                    ? 'status'
                    : currentStep.startsWith('recover-')
                      ? 'recover'
                      : isWalletConfigured
                        ? 'status'
                        : 'welcome';

  const navigateToTab = useCallback(
    (
      tab: 'welcome' | 'register' | 'recover' | 'how-it-works' | 'status',
      options?: {
        targetWallet?: string;
        email?: string;
        replace?: boolean;
      }
    ) => {
      const newParams = new URLSearchParams(searchParams);

      newParams.delete('tab');
      newParams.delete('view');
      newParams.delete('action');
      newParams.delete('step');

      const store = useRecoveryStore.getState();

      if (tab === 'welcome') {
        newParams.set('tab', 'overview');
        newParams.delete('wallet');
        newParams.delete('target');
        newParams.delete('email');
        store.setCurrentStep('welcome');
      } else if (tab === 'register') {
        newParams.set('tab', 'register');
        if (options?.email) newParams.set('email', options.email);
        store.setCurrentStep('setup');
      } else if (tab === 'recover') {
        newParams.set('tab', 'recover');
        if (options?.targetWallet) {
          newParams.set('wallet', options.targetWallet);
          store.setTargetWallet(options.targetWallet);
        } else {
          newParams.delete('wallet');
          newParams.delete('target');
          store.setTargetWallet('');
        }
        if (!store.currentStep.startsWith('recover-')) {
          store.setCurrentStep('recover-get-started');
        }
      } else if (tab === 'how-it-works') {
        newParams.set('tab', 'how-it-works');
        store.setCurrentStep('how-it-works');
      } else if (tab === 'status') {
        newParams.set('tab', 'status');
        store.setCurrentStep('active');
      }

      setSearchParams(newParams, { replace: options?.replace ?? false });
    },
    [searchParams, setSearchParams]
  );

  useEffect(() => {
    const rawTab = (
      searchParams.get('tab') ||
      searchParams.get('view') ||
      searchParams.get('action') ||
      searchParams.get('step') ||
      ''
    ).toLowerCase();

    const queryWallet = searchParams.get('wallet') || searchParams.get('target');
    const queryEmail = searchParams.get('email');
    const store = useRecoveryStore.getState();

    if (queryWallet) {
      store.setTargetWallet(queryWallet);
    }
    if (queryEmail && !store.isConfigured) {
      store.startSetup(queryEmail, queryWallet || '');
    }

    if (['overview', 'welcome', 'home'].includes(rawTab)) {
      if (store.currentStep !== 'welcome') {
        store.setCurrentStep('welcome');
      }
    } else if (['register', 'setup', 'protect'].includes(rawTab)) {
      if (store.currentStep !== 'setup' && store.currentStep !== 'setup-verifying') {
        store.setCurrentStep('setup');
      }
    } else if (
      [
        'recover',
        'restore',
        'claim',
        'recover-get-started',
        'recover-awaiting-email',
        'recover-timelock',
        'recover-ready',
        'recover-completed',
      ].includes(rawTab)
    ) {
      if (!store.currentStep.startsWith('recover-')) {
        store.setCurrentStep('recover-get-started');
      }
    } else if (['how-it-works', 'learn', 'architecture', 'faq'].includes(rawTab)) {
      if (store.currentStep !== 'how-it-works') {
        store.setCurrentStep('how-it-works');
      }
    } else if (['status', 'active', 'settings', 'guardian'].includes(rawTab)) {
      if (store.currentStep !== 'active') {
        store.setCurrentStep('active');
      }
    } else if (!rawTab) {
      if (store.isConfigured || store.isOnChainVerified) {
        store.setCurrentStep('active');
      } else {
        store.setCurrentStep('welcome');
      }
    }
  }, [searchParams]);

  useEffect(() => {
    let isMounted = true;
    const hasExplicitTab =
      searchParams.get('tab') ||
      searchParams.get('view') ||
      searchParams.get('action') ||
      searchParams.get('step');

    if (activeStellarWallet && activeStellarWallet.startsWith('G')) {
      checkOnChainRegistration(activeStellarWallet)
        .then(res => {
          if (!isMounted) return;
          const reg = Boolean(res?.isRegistered);
          if (reg) {
            useRecoveryStore.getState().confirmOnChainSetup({
              email:
                res?.owner === activeStellarWallet ? useRecoveryStore.getState().email || '' : '',
              commitmentHex: res?.commitmentHex || '',
              saltHex: res?.saltHex || '',
              walletAddress: activeStellarWallet,
            });
            if (!hasExplicitTab) {
              navigateToTab('status', { replace: true });
            }
          }
        })
        .catch(err => {
          if (!isMounted) return;
          console.warn('Could not query on-chain registration on mount:', err);
        });
    }

    return () => {
      isMounted = false;
    };
  }, [activeStellarWallet, navigateToTab, searchParams]);

  if (currentNetwork !== 'testnet') {
    return (
      <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center p-6 bg-[var(--color-bg-primary)]">
        <div className="max-w-md w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)]/90 p-8 text-center space-y-4 shadow-xl">
          <div className="mx-auto w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
            <Shield className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold font-['Space_Grotesk'] text-[var(--color-text-primary)]">
            Testnet Exclusive Feature
          </h2>
          <p className="text-xs sm:text-sm text-[var(--color-text-secondary)] leading-relaxed">
            The Zero-Knowledge Smart Contract Recovery Guardian is currently deployed and live on
            Stellar Testnet.
          </p>
          <div className="pt-2">
            <button
              onClick={() => setNetwork?.('testnet')}
              className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-blue-600 px-6 text-sm font-semibold text-white shadow-lg shadow-blue-600/30 hover:bg-blue-500 transition-colors cursor-pointer"
            >
              Switch to Stellar Testnet
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] flex-col bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] transition-colors selection:bg-blue-600/30 selection:text-white">
      <main className="flex-1 px-3 py-2 sm:px-4 sm:py-4 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-6 sm:mb-8 border-b border-[var(--color-border)]">
            <nav className="flex items-center gap-6 sm:gap-8 overflow-x-auto whitespace-nowrap [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <button
                type="button"
                onClick={() => navigateToTab('welcome')}
                className={`relative pb-3 text-xs sm:text-sm font-medium transition-colors cursor-pointer shrink-0 ${
                  activeTabKey === 'welcome'
                    ? 'text-blue-500 font-semibold'
                    : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                }`}
              >
                <span>Overview</span>
                {activeTabKey === 'welcome' && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 rounded-full" />
                )}
              </button>

              <button
                type="button"
                onClick={() => navigateToTab('register')}
                className={`relative pb-3 text-xs sm:text-sm font-medium transition-colors cursor-pointer shrink-0 ${
                  activeTabKey === 'register'
                    ? 'text-blue-500 font-semibold'
                    : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                }`}
              >
                <span>Register Guardian</span>
                {activeTabKey === 'register' && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 rounded-full" />
                )}
              </button>

              <button
                type="button"
                onClick={() => navigateToTab('status')}
                className={`relative pb-3 text-xs sm:text-sm font-medium transition-colors cursor-pointer shrink-0 ${
                  activeTabKey === 'status'
                    ? 'text-blue-500 font-semibold'
                    : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                }`}
              >
                <span>Protection Status</span>
                {activeTabKey === 'status' && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 rounded-full" />
                )}
              </button>

              <button
                type="button"
                onClick={() => navigateToTab('recover')}
                className={`relative pb-3 text-xs sm:text-sm font-medium transition-colors cursor-pointer shrink-0 ${
                  activeTabKey === 'recover'
                    ? 'text-blue-500 font-semibold'
                    : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                }`}
              >
                <span>Recover Funds</span>
                {activeTabKey === 'recover' && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 rounded-full" />
                )}
              </button>

              <button
                type="button"
                onClick={() => navigateToTab('how-it-works')}
                className={`relative pb-3 text-xs sm:text-sm font-medium transition-colors cursor-pointer shrink-0 ${
                  activeTabKey === 'how-it-works'
                    ? 'text-blue-500 font-semibold'
                    : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                }`}
              >
                <span>How It Works</span>
                {activeTabKey === 'how-it-works' && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 rounded-full" />
                )}
              </button>
            </nav>
          </div>
          {activeTabKey === 'welcome' && (
            <RecoveryHero
              onGoToSetup={() => navigateToTab('register')}
              onStartRecovery={() => navigateToTab('recover')}
              onLearnMore={() => navigateToTab('how-it-works')}
              onViewStatus={() => navigateToTab('status')}
            />
          )}

          {activeTabKey === 'how-it-works' && (
            <HowRecoveryWorksPage
              onBack={() => navigateToTab('welcome')}
              onGoToSetup={() => navigateToTab('register')}
              onStartRecovery={() => navigateToTab('recover')}
            />
          )}

          {activeTabKey === 'register' && (
            <ProtectWalletForm
              onSuccess={() => navigateToTab('status')}
              onCancel={() => navigateToTab(isWalletConfigured ? 'status' : 'welcome')}
              onOpenHelp={() => setIsHelpOpen(true)}
              onGoToRecover={() => navigateToTab('recover')}
            />
          )}

          {activeTabKey === 'status' && (
            <RecoveryActiveStatus
              onChangeEmail={() => navigateToTab('register')}
              onInitiateTestRecovery={() => navigateToTab('recover')}
            />
          )}

          {activeTabKey === 'recover' && (
            <RecoverWalletFlow
              onBackToWelcome={() => navigateToTab(isWalletConfigured ? 'status' : 'welcome')}
              onOpenHelp={() => setIsHelpOpen(true)}
            />
          )}
        </div>
      </main>

      <HelpSupportModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
    </div>
  );
};

export default RecoveryPage;
