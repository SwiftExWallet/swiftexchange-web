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
  signedXdr?: string;
  error?: string;
}

export async function submitToHorizon(signedXdr: string, horizonUrl: string): Promise<string> {
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
      if (extras.transaction === 'tx_bad_seq') {
        try {
          const tx = new StellarSDK.Transaction(signedXdr, '');
          return tx.hash().toString('hex');
        } catch {
          void 0;
        }
      }
      const detail = extras.operations ? ` — ${extras.operations.join(', ')}` : '';
      throw new Error(`Stellar submission failed: ${extras.transaction}${detail}`);
    }
    throw new Error(json?.title || 'Horizon submission failed');
  }

  return json.hash;
}

export function extractHashFromResult(res: any, fallbackHash?: string): string | undefined {
  if (!res) return undefined;
  if (typeof res === 'string') {
    const trimmed = res.trim();
    return trimmed || undefined;
  }
  if (typeof res === 'object') {
    const candidate =
      res.hash ||
      res.txHash ||
      res.transactionHash ||
      res.result?.hash ||
      res.result?.txHash ||
      res.result?.transactionHash;
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
    if ((res.status === 'success' || res.success === true) && fallbackHash) {
      return fallbackHash;
    }
  }
  return undefined;
}

export function extractSignedXdrFromResult(res: any): string | undefined {
  if (!res) return undefined;
  if (typeof res === 'object') {
    const signed =
      res.signedXDR ||
      res.signedTxXdr ||
      res.signedXdr ||
      res.xdr ||
      res.result?.signedXDR ||
      res.result?.signedTxXdr ||
      res.result?.signedXdr ||
      res.result?.xdr;
    if (typeof signed === 'string' && signed.trim()) {
      return signed.trim();
    }
  }
  if (typeof res === 'string') {
    const trimmed = res.trim();
    if (trimmed.startsWith('AAAA') || trimmed.length > 200) {
      return trimmed;
    }
  }
  return undefined;
}

export async function pollHorizonForConfirmation(
  horizonUrl: string,
  txHash: string,
  timeoutMs = 60000,
  intervalMs = 2000
): Promise<string | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${horizonUrl}/transactions/${txHash}`);
      if (res.ok) {
        const data = await res.json();
        if (data.successful !== false) {
          return txHash;
        }
      }
    } catch {
      void 0;
    }
    await new Promise(r => setTimeout(r, intervalMs));
  }
  return null;
}

export async function submitSorobanOrHorizon(
  signedXdr: string,
  horizonUrl: string,
  networkPassphrase: string,
  isTestnet: boolean
): Promise<string> {
  const rpcUrls = isTestnet
    ? ['https://soroban-testnet.stellar.org']
    : ['https://mainnet.sorobanrpc.com', 'https://soroban-rpc.mainnet.stellar.org'];

  for (const rpcUrl of rpcUrls) {
    try {
      const rpcServer = new StellarSDK.rpc.Server(rpcUrl);
      const tx = new StellarSDK.Transaction(signedXdr, networkPassphrase);
      const sendRes = await rpcServer.sendTransaction(tx);
      if (sendRes.status !== 'ERROR' && sendRes.hash) {
        return sendRes.hash;
      }
    } catch {
      // Ignore RPC connection errors and try next RPC URL or fallback
    }
  }

  return submitToHorizon(signedXdr, horizonUrl);
}

async function notifyWalletSignRequest(): Promise<void> {
  const token = localStorage.getItem('device_token');
  if (!token) return;

  await sendCustomNotification(token, {
    title: 'Wallet Signature Required',
    body: `Open your wallet to sign the transaction.`,
  }).catch(console.error);
}

export function refreshStellarPreconditions(
  xdr: string,
  networkPassphrase: string,
  freshMaxTimeSeconds = 1800
): string {
  try {
    const tx = new StellarSDK.Transaction(xdr, networkPassphrase);
    const nowSec = Math.floor(Date.now() / 1000);
    let mutated = false;

    if (tx.timeBounds) {
      const currentMax = Number(tx.timeBounds.maxTime || 0);
      if (currentMax > 0 && currentMax <= nowSec + 300) {
        const freshMax = nowSec + freshMaxTimeSeconds;
        console.log(
          `[StellarTransactionService] Refreshing expired TimeBounds maxTime from ${currentMax} to ${freshMax}`
        );
        const minTimeStr = tx.timeBounds.minTime || '0';
        (tx as any).tx._attributes.cond = StellarSDK.xdr.Preconditions.precondTime(
          new StellarSDK.xdr.TimeBounds({
            minTime: StellarSDK.xdr.Uint64.fromString(minTimeStr),
            maxTime: StellarSDK.xdr.Uint64.fromString(freshMax.toString()),
          })
        );
        mutated = true;
      }
    }

    if (mutated) {
      (tx as any)._envelope = undefined;
      return tx.toXDR();
    }
    return xdr;
  } catch (err) {
    console.warn('[refreshStellarPreconditions] Error refreshing preconditions:', err);
    return xdr;
  }
}

export async function signStellarTransactionOnly(
  xdr: string,
  networkPassphrase: string,
  provider: any,
  network: string
): Promise<string> {
  const testnetPassphrase = StellarSDK.Networks?.TESTNET || 'Test SDF Network ; September 2015';
  const publicPassphrase =
    StellarSDK.Networks?.PUBLIC || 'Public Global Stellar Network ; September 2015';
  const isTestnet =
    network.toLowerCase().includes('test') || networkPassphrase.includes(testnetPassphrase);
  const stellarNetworkEnum = isTestnet ? 'TESTNET' : 'PUBLIC';
  const canonicalPassphrase = isTestnet ? testnetPassphrase : publicPassphrase;
  const config = getStellarConfig(isTestnet ? 'testnet' : 'mainnet');

  if (provider && typeof provider.signTransaction === 'function') {
    const signResult = await provider.signTransaction(xdr, {
      network: stellarNetworkEnum,
      networkPassphrase: canonicalPassphrase,
      networkUrl: config.horizonUrl,
    });
    const signedXdr =
      typeof signResult === 'string'
        ? signResult
        : signResult?.signedTxXdr || (signResult as any)?.signedXDR;
    if (!signedXdr) throw new Error('Extension wallet failed to return signed XDR');
    return signedXdr;
  }

  if (provider?.client && provider?.session) {
    const topic = provider.session.topic;
    const result = await provider.client.request({
      topic,
      chainId: `stellar:${config.chainId}`,
      request: {
        method: 'stellar_signXDR',
        params: { xdr, network: stellarNetworkEnum, networkPassphrase: canonicalPassphrase },
      },
    });
    console.log('[CCTP Debug] stellar_signXDR WC result:', JSON.stringify(result));
    const signedXdr =
      result?.signedXDR || result?.signedTxXdr || (typeof result === 'string' ? result : null);
    if (!signedXdr) throw new Error('WalletConnect did not return signed XDR');
    return signedXdr;
  }

  if (typeof provider?.request === 'function') {
    const result = await provider.request({
      method: 'stellar_signXDR',
      params: { xdr, network: stellarNetworkEnum, networkPassphrase: canonicalPassphrase },
    });
    console.log('[CCTP Debug] stellar_signXDR provider result:', JSON.stringify(result));
    const signedXdr =
      result?.signedXDR || result?.signedTxXdr || (typeof result === 'string' ? result : null);
    if (!signedXdr) throw new Error('Provider did not return signed XDR');
    return signedXdr;
  }

  throw new Error('No compatible Stellar wallet provider found for sign-only');
}

export const signAndSubmitTransaction = async (
  params: SignAndSubmitParams
): Promise<SignAndSubmitResult> => {
  const { network, networkPassphrase, provider } = params;
  let finalXdr = params.xdr;
  let sourceAddress: string | undefined;
  let txSeq: string | undefined;
  let isSoroban = false;

  try {
    finalXdr = refreshStellarPreconditions(finalXdr, networkPassphrase);

    const tx = new StellarSDK.Transaction(finalXdr, networkPassphrase);
    sourceAddress = tx.source;
    txSeq = tx.sequence;
    isSoroban = Boolean(tx?.operations?.some((op: any) => op?.type === 'invokeHostFunction'));

    if (sourceAddress && txSeq && !isSoroban) {
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
    const testnetPassphrase = StellarSDK.Networks?.TESTNET || 'Test SDF Network ; September 2015';
    const publicPassphrase =
      StellarSDK.Networks?.PUBLIC || 'Public Global Stellar Network ; September 2015';
    const isTestnet =
      network.toLowerCase().includes('test') || networkPassphrase.includes(testnetPassphrase);
    const stellarNetworkEnum = isTestnet ? 'TESTNET' : 'PUBLIC';
    const canonicalPassphrase = isTestnet ? testnetPassphrase : publicPassphrase;
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

      const hash = isSoroban
        ? await submitSorobanOrHorizon(signedXdr, config.horizonUrl, canonicalPassphrase, isTestnet)
        : await submitToHorizon(signedXdr, config.horizonUrl);
      if (sourceAddress)
        StellarBaseService.invalidateAccountCache(sourceAddress, canonicalPassphrase);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('stellar-trustline-added'));
        window.dispatchEvent(new Event('stellar-balance-changed'));
      }
      return { success: true, hash };
    }

    const computedHash = new StellarSDK.Transaction(finalXdr, canonicalPassphrase)
      .hash()
      .toString('hex');

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

      const reqPromise = (async () => {
        try {
          return await provider.client.request({
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
            return await provider.client.request({
              topic,
              chainId,
              request: {
                method: 'stellar_signXDR',
                params: signParams,
              },
            });
          }
          throw submitErr;
        }
      })();

      const pollPromise = new Promise<string | null>(resolve => {
        const timer = setTimeout(async () => {
          const res = await pollHorizonForConfirmation(config.horizonUrl, computedHash);
          resolve(res);
        }, 2500);
        reqPromise.finally(() => clearTimeout(timer));
      });
      const result = await Promise.race([
        reqPromise,
        pollPromise.then(confirmedHash => {
          if (confirmedHash) return { hash: confirmedHash, status: 'success' };
          return new Promise(() => {});
        }),
      ]);

      console.log('[StellarTransactionService] WC result:', result);

      const signedXdr = extractSignedXdrFromResult(result);

      if (signedXdr) {
        const hash = isSoroban
          ? await submitSorobanOrHorizon(
              signedXdr,
              config.horizonUrl,
              canonicalPassphrase,
              isTestnet
            )
          : await submitToHorizon(signedXdr, config.horizonUrl);
        if (sourceAddress)
          StellarBaseService.invalidateAccountCache(sourceAddress, canonicalPassphrase);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('stellar-trustline-added'));
          window.dispatchEvent(new Event('stellar-balance-changed'));
        }
        return { success: true, hash };
      }

      const extractedHash = extractHashFromResult(result, computedHash);

      if (extractedHash) {
        if (sourceAddress)
          StellarBaseService.invalidateAccountCache(sourceAddress, canonicalPassphrase);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('stellar-trustline-added'));
          window.dispatchEvent(new Event('stellar-balance-changed'));
        }
        return { success: true, hash: extractedHash };
      }

      if (result?.status === 'success' || result?.success === true) {
        if (sourceAddress)
          StellarBaseService.invalidateAccountCache(sourceAddress, canonicalPassphrase);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('stellar-trustline-added'));
          window.dispatchEvent(new Event('stellar-balance-changed'));
        }
        return { success: true, hash: computedHash };
      }

      throw new Error('Transaction signing/submission failed or was cancelled');
    }

    if (typeof provider?.request === 'function') {
      await notifyWalletSignRequest();

      const reqPromise = (async () => {
        try {
          return await provider.request({
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
            return await provider.request({
              method: 'stellar_signXDR',
              params: {
                xdr: finalXdr,
                network: stellarNetworkEnum,
                networkPassphrase: canonicalPassphrase,
              },
            });
          }
          throw reqErr;
        }
      })();

      const pollPromise = new Promise<string | null>(resolve => {
        const timer = setTimeout(async () => {
          const res = await pollHorizonForConfirmation(config.horizonUrl, computedHash);
          resolve(res);
        }, 2500);
        reqPromise.finally(() => clearTimeout(timer));
      });
      const result = await Promise.race([
        reqPromise,
        pollPromise.then(confirmedHash => {
          if (confirmedHash) return { hash: confirmedHash, status: 'success' };
          return new Promise(() => {});
        }),
      ]);

      console.log('[StellarTransactionService] provider.request result:', result);

      const signedXdr = extractSignedXdrFromResult(result);

      if (signedXdr) {
        const hash = isSoroban
          ? await submitSorobanOrHorizon(
              signedXdr,
              config.horizonUrl,
              canonicalPassphrase,
              isTestnet
            )
          : await submitToHorizon(signedXdr, config.horizonUrl);
        if (sourceAddress)
          StellarBaseService.invalidateAccountCache(sourceAddress, canonicalPassphrase);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('stellar-trustline-added'));
          window.dispatchEvent(new Event('stellar-balance-changed'));
        }
        return { success: true, hash };
      }

      const extractedHash = extractHashFromResult(result, computedHash);

      if (extractedHash) {
        if (sourceAddress)
          StellarBaseService.invalidateAccountCache(sourceAddress, canonicalPassphrase);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('stellar-trustline-added'));
          window.dispatchEvent(new Event('stellar-balance-changed'));
        }
        return { success: true, hash: extractedHash };
      }

      if (result?.status === 'success' || result?.success === true) {
        if (sourceAddress)
          StellarBaseService.invalidateAccountCache(sourceAddress, canonicalPassphrase);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('stellar-trustline-added'));
          window.dispatchEvent(new Event('stellar-balance-changed'));
        }
        return { success: true, hash: computedHash };
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
