import type { FC } from 'react';

import { useRecoverWalletFlow } from '../hooks/useRecoverWalletFlow';
import { InitiateRecoveryStep } from './recovery-flow/InitiateRecoveryStep';
import { RecoverySuccessModal } from './recovery-flow/RecoverySuccessModal';
import { TrackingRecoveryStep } from './recovery-flow/TrackingRecoveryStep';

export interface RecoverWalletFlowProps {
  onBackToWelcome?: () => void;
  onOpenHelp?: () => void;
}

export const RecoverWalletFlow: FC<RecoverWalletFlowProps> = ({ onBackToWelcome, onOpenHelp }) => {
  const {
    activeStellarWallet,
    activeOwnerWallet,
    inputTargetWallet,
    setInputTargetWallet,
    inputEmail,
    setInputEmail,
    targetRegistrationStatus,
    destinationAddress,
    setDestinationAddress,
    emlFileName,
    parsedEml,
    handleEmlFileRead,
    destinationBalances,
    isLoadingDestinationBalances,
    targetBalances,
    isLoadingTargetBalances,
    targetWalletError,
    recoveryStatus,
    statusNotice,
    isPolling,
    pollStatusOnce,
    startTrackingRelayerEmail,
    resetRecoveryFlow,
    isSubmittingProof,
    proofSubmitError,
    proofSubmitSuccess,
    submitRecoveryProof,
    isExecutingRecovery,
    executeRecovery,
    errorMessage,
    isSuccessModalOpen,
    closeSuccessModal,
    lastTxHash,
    hasAuthToken,
    openConnectModal,
  } = useRecoverWalletFlow();

  const hasActiveRecovery = Boolean(
    recoveryStatus?.status || (proofSubmitSuccess && !proofSubmitError)
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {hasActiveRecovery ? (
        <TrackingRecoveryStep
          ownerWallet={activeOwnerWallet}
          destinationAddress={destinationAddress}
          status={recoveryStatus?.status || 'STARTED'}
          statusNotice={statusNotice}
          isPolling={isPolling}
          onRefresh={() => pollStatusOnce(activeOwnerWallet)}
          onExecute={executeRecovery}
          isExecuting={isExecutingRecovery}
          errorMessage={errorMessage}
          onResetOrBack={resetRecoveryFlow}
          destinationBalances={destinationBalances}
          isLoadingDestinationBalances={isLoadingDestinationBalances}
          hasAuthToken={hasAuthToken}
          onConnectWallet={openConnectModal}
        />
      ) : (
        <InitiateRecoveryStep
          ownerWallet={inputTargetWallet}
          onOwnerWalletChange={setInputTargetWallet}
          recoveryEmail={inputEmail}
          onRecoveryEmailChange={setInputEmail}
          targetRegistrationStatus={targetRegistrationStatus}
          destinationAddress={destinationAddress}
          onDestinationAddressChange={setDestinationAddress}
          targetBalances={targetBalances}
          isLoadingBalances={isLoadingTargetBalances}
          targetWalletError={targetWalletError}
          emlFileName={emlFileName}
          parsedEml={parsedEml}
          onEmlFileSelected={handleEmlFileRead}
          onSubmitEml={submitRecoveryProof}
          onTrackStatus={startTrackingRelayerEmail}
          isSubmitting={isSubmittingProof}
          isCheckingStatus={isPolling}
          submitError={proofSubmitError}
          submitSuccess={proofSubmitSuccess}
          activeStellarWallet={activeStellarWallet}
          hasAuthToken={hasAuthToken}
          onConnectWallet={openConnectModal}
          onOpenHelp={onOpenHelp}
        />
      )}

      {/* Confirmed Recovery Success Modal */}
      <RecoverySuccessModal
        isOpen={isSuccessModalOpen}
        onClose={closeSuccessModal}
        ownerAddress={activeOwnerWallet}
        destinationAddress={destinationAddress}
        txHash={lastTxHash}
        balances={destinationBalances.length > 0 ? destinationBalances : targetBalances}
        onNavigateHome={() => {
          resetRecoveryFlow();
          onBackToWelcome?.();
        }}
      />
    </div>
  );
};

export default RecoverWalletFlow;
