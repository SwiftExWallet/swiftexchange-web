import {
  type CctpBridgeTransfer,
  submitCctpApprovalTx,
  submitCctpSourceTx,
} from '../../../../../../service/evmToStellarCctpService';
import {
  refreshStellarPreconditions,
  signAndSubmitTransaction,
} from '../../../../../stellar/utils/transactionService';
import { getStellarConfig } from '../../../../../walletconnect/config/chains';

export interface ExecuteStellarToEvmParams {
  currentTransfer: CctpBridgeTransfer;
  stellarAddress: string;
  evmAddress: string;
  amount: string;
  currentNetwork: 'mainnet' | 'testnet';
  networkPassphrase: string;
  stellarProvider?: any;
  signStellarTx?: (xdr: string) => Promise<string>;
  onMessage?: (msg: string) => void;
  onSuccess?: (transfer: CctpBridgeTransfer) => void;
}

async function signAndBroadcast(
  rawXdr: string,
  networkPassphrase: string,
  currentNetwork: 'mainnet' | 'testnet',
  stellarAddress: string,
  stellarProvider: any,
  signStellarTx?: (xdr: string) => Promise<string>
): Promise<string> {
  const xdr = refreshStellarPreconditions(rawXdr, networkPassphrase);

  if (signStellarTx) {
    const result = await signStellarTx(xdr);
    if (result.length === 64 && /^[0-9a-fA-F]+$/.test(result)) {
      return result;
    }
    const { submitToHorizon } = await import('../../../../../stellar/utils/transactionService');
    const config = getStellarConfig(currentNetwork);
    return submitToHorizon(result, config.horizonUrl);
  }

  const submitRes = await signAndSubmitTransaction({
    xdr,
    network: currentNetwork,
    networkPassphrase,
    provider: stellarProvider,
    stellarAddress,
  });
  console.log('[CCTP Bridge] Approval submitRes:', submitRes);

  if (!submitRes || !submitRes.success || !submitRes.hash) {
    throw new Error(submitRes?.error || 'Stellar transaction failed or was cancelled');
  }

  return submitRes.hash;
}

export async function executeStellarToEvmApproval(
  params: ExecuteStellarToEvmParams
): Promise<CctpBridgeTransfer> {
  const {
    currentTransfer,
    stellarAddress,
    currentNetwork,
    networkPassphrase,
    stellarProvider,
    signStellarTx,
    onMessage,
  } = params;

  const rawXdr = currentTransfer.signingRequest?.xdr || currentTransfer.stellarUnsignedXdr;
  if (!rawXdr) throw new Error('Backend did not return Stellar XDR.');

  onMessage?.('Confirm USDC allowance approval in Stellar wallet...');

  const approvalTxHash = await signAndBroadcast(
    rawXdr,
    networkPassphrase,
    currentNetwork,
    stellarAddress,
    stellarProvider,
    signStellarTx
  );

  onMessage?.('Stellar approval broadcasted. Notifying backend...');

  let updated: CctpBridgeTransfer;
  try {
    updated = await submitCctpApprovalTx(currentTransfer.id, approvalTxHash);
  } catch {
    updated = {
      ...currentTransfer,
      status: 'APPROVAL_PENDING',
      approvalTxHash,
      signingRequest: null,
    };
  }

  return {
    ...updated,
    approvalTxHash: updated.approvalTxHash || approvalTxHash,
    signingRequest: null,
  };
}

export async function executeStellarToEvmBurn(
  params: ExecuteStellarToEvmParams
): Promise<CctpBridgeTransfer> {
  const {
    currentTransfer,
    stellarAddress,
    currentNetwork,
    networkPassphrase,
    stellarProvider,
    signStellarTx,
    onMessage,
  } = params;

  const rawXdr = currentTransfer.signingRequest?.xdr || currentTransfer.stellarUnsignedXdr;
  if (!rawXdr) throw new Error('Backend did not return Stellar burn XDR.');

  onMessage?.('Confirm & broadcast USDC burn in Stellar wallet...');

  const stellarTxHash = await signAndBroadcast(
    rawXdr,
    networkPassphrase,
    currentNetwork,
    stellarAddress,
    stellarProvider,
    signStellarTx
  );
  console.log('[CCTP Bridge] Burn submitRes:', { success: true, hash: stellarTxHash });

  onMessage?.('Stellar burn broadcasted! Notifying bridge relayer...');

  let updated: CctpBridgeTransfer;
  try {
    updated = await submitCctpSourceTx(currentTransfer.id, stellarTxHash);
  } catch {
    updated = {
      ...currentTransfer,
      status: 'SOURCE_PENDING',
      sourceTxHash: stellarTxHash,
      signingRequest: null,
    };
  }

  return {
    ...updated,
    status: 'SOURCE_PENDING',
    sourceTxHash: updated.sourceTxHash || stellarTxHash,
    signingRequest: null,
  };
}

export async function rebuildStellarToEvmBurnTransfer(
  params: ExecuteStellarToEvmParams
): Promise<CctpBridgeTransfer> {
  return executeStellarToEvmBurn(params);
}
