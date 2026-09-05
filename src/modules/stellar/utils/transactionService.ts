import * as StellarSDK from '@stellar/stellar-sdk';

import { sendCustomNotification } from '../../../service/notificationService';
import { getStellarConfig } from '../../walletconnect/config/chains';
import { StellarBaseService } from '../service/StellarBaseService';
import { StellarSequenceTracker } from './StellarSequenceTracker';

export interface SignAndSubmitParams {
  xdr: string;
  network: string;
  networkPassphrase: string;
  provider: any;
  stellarAddress?: string;
}

export interface SignAndSubmitResult {
  success: boolean;
  hash?: string;
  error?: string;
}

async function submitToHorizon(signedXdr: string, horizonUrl: string): Promise<string> {
  const broadcastUrl = `${horizonUrl}/transactions`;
  const body = new URLSearchParams({ tx: signedXdr });

  const res = await fetch(broadcastUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const json = await res.json();

  if (!res.ok) {
    const extras = json?.extras?.result_codes;
    if (extras) {
      const detail = extras.operations ? ` — ${extras.operations.join(', ')}` : '';
      throw new Error(`Stellar submission failed: ${extras.transaction}${detail}`);
    }
    throw new Error(json?.title || 'Horizon submission failed');
  }

  return json.hash;
}

async function notifyWalletSignRequest(): Promise<void> {
  const token = localStorage.getItem('device_token');
  if (!token) return;

  await sendCustomNotification(token, {
    title: 'Wallet Signature Required',
    body: `Open your wallet to sign the transaction.`,
  }).catch(console.error);
}

export const signAndSubmitTransaction = async (
  params: SignAndSubmitParams
): Promise<SignAndSubmitResult> => {
  const { network, networkPassphrase, provider } = params;
  let finalXdr = params.xdr;
  let sourceAddress: string | undefined;
  let txSeq: string | undefined;

  try {
    const tx = new StellarSDK.Transaction(finalXdr, networkPassphrase);
    sourceAddress = tx.source;
    txSeq = tx.sequence;

    if (sourceAddress && txSeq) {
      try {
        const config = getStellarConfig(network.toLowerCase() as any);
        const horizonServer = new StellarSDK.Horizon.Server(config.horizonUrl);
        const accountResponse = await horizonServer.loadAccount(sourceAddress);
        const networkSeqStr = accountResponse.sequenceNumber();
        const networkSeq = BigInt(networkSeqStr);
        const isKnown = StellarSequenceTracker.isKnownSequence(sourceAddress, txSeq);

        if (isKnown || BigInt(txSeq) > networkSeq + 1n) {
          const baseSeqUsed = BigInt(txSeq) - 1n;
          StellarSequenceTracker.syncSequence(sourceAddress, baseSeqUsed.toString());
          if (isKnown) {
            StellarSequenceTracker.removeKnownSequence(sourceAddress, txSeq);
          }
          console.log(
            `[StellarTransactionService] Tracker synchronized to sequence ${baseSeqUsed} for ${sourceAddress}`
          );
        } else {
          const baseSeq = StellarSequenceTracker.getAndIncrementSequence(
            sourceAddress,
            networkSeqStr
          );
          const expectedTxSeq = (BigInt(baseSeq) + 1n).toString();

          if (expectedTxSeq !== txSeq) {
            console.log(
              `[StellarTransactionService] Mutating XDR sequence from ${txSeq} to ${expectedTxSeq} for ${sourceAddress}`
            );
            (tx as any).tx._attributes.seqNum = (StellarSDK as any).xdr.SequenceNumber.fromString(
              expectedTxSeq
            );
            (tx as any)._envelope = undefined;
            finalXdr = tx.toXDR();
            txSeq = expectedTxSeq;
          }
          StellarSequenceTracker.removeKnownSequence(sourceAddress, expectedTxSeq);
        }
      } catch (seqError) {
        console.warn(
          '[StellarTransactionService] Failed to check/correct sequence number:',
          seqError
        );
      }
    }
  } catch (parseErr) {
    console.warn('[StellarTransactionService] Failed to parse transaction XDR:', parseErr);
  }

  try {
    const isTestnet =
      network.toLowerCase().includes('test') || networkPassphrase.includes('Test SDF Network');
    const stellarNetworkEnum = isTestnet ? 'TESTNET' : 'PUBLIC';
    const canonicalPassphrase = isTestnet
      ? 'Test SDF Network ; September 2015'
      : 'Public Global Stellar Network ; September 2015';
    const config = getStellarConfig(isTestnet ? 'testnet' : 'mainnet');

    if (provider && typeof provider.signTransaction === 'function') {
      const extension = provider;

      await notifyWalletSignRequest();
      const signResult = await extension.signTransaction(finalXdr, {
        network: stellarNetworkEnum,
        networkPassphrase: canonicalPassphrase,
        networkUrl: config.horizonUrl,
        accountToSign: sourceAddress,
      });

      if (signResult && typeof signResult === 'object' && signResult.error) {
        throw new Error(signResult.error);
      }

      const signedXdr =
        typeof signResult === 'string'
          ? signResult
          : signResult?.signedTxXdr || (signResult as any)?.signedXDR;

      if (!signedXdr) {
        throw new Error('Extension failed to sign the transaction');
      }

      const hash = await submitToHorizon(signedXdr, config.horizonUrl);
      if (sourceAddress)
        StellarBaseService.invalidateAccountCache(sourceAddress, canonicalPassphrase);
      return { success: true, hash };
    }

    if (provider?.client && provider?.session) {
      const stellarNetwork = config.chainId;
      const topic = provider.session.topic;
      const chainId = `stellar:${stellarNetwork}`;

      const signParams = {
        xdr: finalXdr,
        network: stellarNetworkEnum,
        networkPassphrase: canonicalPassphrase,
      };

      await notifyWalletSignRequest();

      let result: any;
      try {
        result = await provider.client.request({
          topic,
          chainId,
          request: {
            method: 'stellar_signAndSubmitXDR',
            params: signParams,
          },
        });
      } catch (submitErr: any) {
        const isUnsupported =
          submitErr?.message?.includes('Method not supported') ||
          submitErr?.message?.includes('not found') ||
          submitErr?.code === 5001 ||
          submitErr?.code === -32601;

        if (isUnsupported) {
          result = await provider.client.request({
            topic,
            chainId,
            request: {
              method: 'stellar_signXDR',
              params: signParams,
            },
          });
        } else {
          throw submitErr;
        }
      }

      if (result?.status === 'success' || result?.hash) {
        const computedHash = new StellarSDK.Transaction(finalXdr, canonicalPassphrase)
          .hash()
          .toString('hex');
        if (sourceAddress)
          StellarBaseService.invalidateAccountCache(sourceAddress, canonicalPassphrase);
        return { success: true, hash: result.hash || computedHash };
      }

      const signedXdr =
        result?.signedXDR || result?.signedTxXdr || (typeof result === 'string' ? result : null);
      if (signedXdr) {
        const hash = await submitToHorizon(signedXdr, config.horizonUrl);
        if (sourceAddress)
          StellarBaseService.invalidateAccountCache(sourceAddress, canonicalPassphrase);
        return { success: true, hash };
      }

      throw new Error('Transaction signing/submission failed or was cancelled');
    }

    if (typeof provider?.request === 'function') {
      await notifyWalletSignRequest();
      let result: any;
      try {
        result = await provider.request({
          method: 'stellar_signAndSubmitXDR',
          params: {
            xdr: finalXdr,
            network: stellarNetworkEnum,
            networkPassphrase: canonicalPassphrase,
          },
        });
      } catch (reqErr: any) {
        const isUnsupported =
          reqErr?.message?.includes('Method not supported') ||
          reqErr?.message?.includes('not found') ||
          reqErr?.code === 5001 ||
          reqErr?.code === -32601;

        if (isUnsupported) {
          result = await provider.request({
            method: 'stellar_signXDR',
            params: {
              xdr: finalXdr,
              network: stellarNetworkEnum,
              networkPassphrase: canonicalPassphrase,
            },
          });
        } else {
          throw reqErr;
        }
      }

      if (result?.status === 'success' || result?.hash) {
        const computedHash = new StellarSDK.Transaction(finalXdr, canonicalPassphrase)
          .hash()
          .toString('hex');
        if (sourceAddress)
          StellarBaseService.invalidateAccountCache(sourceAddress, canonicalPassphrase);
        return { success: true, hash: result.hash || computedHash };
      }

      const signedXdr =
        result?.signedXDR || result?.signedTxXdr || (typeof result === 'string' ? result : null);
      if (signedXdr) {
        const hash = await submitToHorizon(signedXdr, config.horizonUrl);
        if (sourceAddress)
          StellarBaseService.invalidateAccountCache(sourceAddress, canonicalPassphrase);
        return { success: true, hash };
      }

      throw new Error('Transaction failed');
    }

    throw new Error('No compatible Stellar wallet provider found');
  } catch (error: any) {
    console.error('[StellarTransactionService] Error:', error);
    const errStr = error?.message || String(error);

    if (sourceAddress && txSeq) {
      const baseSeqUsed = (BigInt(txSeq) - 1n).toString();
      StellarSequenceTracker.rollbackSequence(sourceAddress, baseSeqUsed);
      if (
        errStr.includes('tx_bad_seq') ||
        errStr.includes('sequence_mismatch') ||
        errStr.includes('bad sequence')
      ) {
        StellarSequenceTracker.reset(sourceAddress);
      }
    }

    return { success: false, error: errStr };
  }
};
