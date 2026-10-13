import type { FC } from 'react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { HelpSupportModal } from './components/HelpSupportModal';
import { HowRecoveryWorksPage } from './components/HowRecoveryWorksPage';
import { ProtectWalletForm } from './components/ProtectWalletForm';
import { RecoverWalletFlow } from './components/RecoverWalletFlow';
import { RecoveryActiveStatus } from './components/RecoveryActiveStatus';
import { RecoveryHero } from './components/RecoveryHero';
import { useRecoveryStore } from './store/recoveryStore';

const RecoveryPage: FC = () => {
  const [searchParams] = useSearchParams();
  const currentStep = useRecoveryStore(state => state.currentStep);
  const setCurrentStep = useRecoveryStore(state => state.setCurrentStep);
  const setTargetWallet = useRecoveryStore(state => state.setTargetWallet);

  const [isHelpOpen, setIsHelpOpen] = useState(false);

  useEffect(() => {
    const queryWallet = searchParams.get('wallet') || searchParams.get('target');
    const queryStep = searchParams.get('step');

    if (queryWallet) {
      setTargetWallet(queryWallet);
    }
    if (queryStep === 'recover') {
      setCurrentStep('recover-get-started');
    } else if (queryStep === 'setup') {
      setCurrentStep('setup');
    } else if (queryStep === 'how-it-works') {
      setCurrentStep('how-it-works');
    }
  }, [searchParams, setTargetWallet, setCurrentStep]);

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] flex-col bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] transition-colors selection:bg-blue-600/30 selection:text-white">
      <main className="flex-1 px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        <div className="mx-auto max-w-7xl">
          {currentStep === 'welcome' && (
            <RecoveryHero
              onGoToSetup={() => setCurrentStep('setup')}
              onStartRecovery={() => setCurrentStep('recover-get-started')}
              onLearnMore={() => setCurrentStep('how-it-works')}
            />
          )}

          {currentStep === 'how-it-works' && (
            <HowRecoveryWorksPage
              onBack={() => setCurrentStep('welcome')}
              onGoToSetup={() => setCurrentStep('setup')}
              onStartRecovery={() => setCurrentStep('recover-get-started')}
            />
          )}

          {(currentStep === 'setup' || currentStep === 'setup-verifying') && (
            <ProtectWalletForm
              onSuccess={() => setCurrentStep('active')}
              onOpenHelp={() => setIsHelpOpen(true)}
            />
          )}

          {currentStep === 'active' && (
            <RecoveryActiveStatus
              onChangeEmail={() => setCurrentStep('setup')}
              onInitiateTestRecovery={() => setCurrentStep('recover-get-started')}
            />
          )}

          {(currentStep === 'recover-get-started' ||
            currentStep === 'recover-awaiting-email' ||
            currentStep === 'recover-timelock' ||
            currentStep === 'recover-ready' ||
            currentStep === 'recover-completed') && (
            <RecoverWalletFlow
              onBackToWelcome={() => setCurrentStep('welcome')}
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
