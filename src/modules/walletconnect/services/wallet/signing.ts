import { BrowserProvider, getAddress, hexlify, toUtf8Bytes } from 'ethers';

import { sendCustomNotification } from '../../../../service/notificationService';

// ---------------------------------------------------------------------------
// SIWE (EIP-4361) personal_sign — multi-fallback
// ---------------------------------------------------------------------------

export async function signSiweMessage(
  evmAddress: string,
  provider: unknown,
  message: string,
  chainId?: number | string
): Promise<string> {
  try {
    const token = localStorage.getItem('device_token');
    if (token) {
      sendCustomNotification(token, {
        title: 'Authentication Required',
        body: 'Please open your wallet to sign in to SwiftExchange.',
      }).catch(err => console.error('[WalletService] Auth notification error:', err));
    }
  } catch (e) {
    console.debug('[WalletService] Auth notification skipped:', e);
  }

  const hexMsg = message.startsWith('0x') ? message : hexlify(toUtf8Bytes(message));
  const lowerAddr = evmAddress.toLowerCase();
  const checksumAddr = getAddress(evmAddress);

  console.info(
    `[Auth:SIWE] Requesting SIWE personal_sign for ${evmAddress} on chain ${chainId ?? 'default'}`
  );

  // 1. Direct WalletConnect v2 sign-client dispatch (topic & chainId specific)
  const wcProvider = provider as any;
  if (wcProvider?.client && wcProvider?.session?.topic) {
    const topic = wcProvider.session.topic;
    const sessionChains: string[] = wcProvider.session.namespaces?.eip155?.chains || [];
    const sessionAccounts: string[] = wcProvider.session.namespaces?.eip155?.accounts || [];
    const accountChain = sessionAccounts[0]?.split(':')?.[1];
    const defaultChain = sessionChains[0]?.replace('eip155:', '') || accountChain || '1';
    const targetChain = chainId ? `eip155:${chainId}` : `eip155:${defaultChain}`;
    const requestId = Date.now() * 1000 + Math.floor(Math.random() * 1000);

    console.info(
      `[Auth:SIWE] Direct WalletConnect sign dispatch to topic ${topic.slice(0, 8)}... on ${targetChain}`
    );

    try {
      const signature = await wcProvider.client.request({
        topic,
        chainId: targetChain,
        request: {
          id: requestId,
          method: 'personal_sign',
          params: [hexMsg, lowerAddr],
        },
      });
      console.info(`[Auth:SIWE] ✓ SIWE signature received via WC client for ${evmAddress}`);
      return signature;
    } catch (err1: any) {
      if (err1?.message === 'USER_REJECTED' || err1?.code === 4001) throw err1;
      console.warn('[Auth:SIWE] Standard params failed on WC client, trying swapped params:', err1);
      try {
        const signature = await wcProvider.client.request({
          topic,
          chainId: targetChain,
          request: {
            id: requestId + 1,
            method: 'personal_sign',
            params: [lowerAddr, hexMsg],
          },
        });
        console.info(
          `[Auth:SIWE] ✓ SIWE signature received via WC client (swapped) for ${evmAddress}`
        );
        return signature;
      } catch (err2: any) {
        if (err2?.message === 'USER_REJECTED' || err2?.code === 4001) throw err2;
        console.warn(
          '[Auth:SIWE] Swapped params failed on WC client, falling back to provider.request:',
          err2
        );
      }
    }
  }

  // 2. Standard EIP-1193 / Injected provider dispatch
  if (provider && typeof (provider as any).request === 'function') {
    try {
      const signature = await (provider as any).request({
        method: 'personal_sign',
        params: [hexMsg, lowerAddr],
      });
      console.info(`[Auth:SIWE] ✓ SIWE signature verified for ${evmAddress}`);
      return signature;
    } catch (err1: any) {
      if (err1?.message === 'USER_REJECTED') {
        throw err1;
      }
      try {
        const signature = await (provider as any).request({
          method: 'personal_sign',
          params: [hexMsg, checksumAddr],
        });
        console.info(`[Auth:SIWE] ✓ SIWE signature verified (checksum) for ${evmAddress}`);
        return signature;
      } catch (err2: any) {
        if (err2?.message === 'USER_REJECTED') {
          throw err2;
        }
        try {
          const signature = await (provider as any).request({
            method: 'personal_sign',
            params: [lowerAddr, hexMsg],
          });
          console.info(`[Auth:SIWE] ✓ SIWE signature verified (swapped params) for ${evmAddress}`);
          return signature;
        } catch (err3: any) {
          if (err3?.message === 'USER_REJECTED') throw err3;
        }
      }
    }
  }

  try {
    const browserProvider = new BrowserProvider(provider as any);
    const signer = await browserProvider.getSigner(evmAddress);
    const signature = await signer.signMessage(message);
    console.info(`[Auth:SIWE] ✓ SIWE signature verified (BrowserProvider) for ${evmAddress}`);
    return signature;
  } catch (error) {
    console.error('[Auth:SIWE] ✕ SIWE signature failed:', error);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Stellar off-chain payload signing (SEP-53 / Ed25519)
//
// Flow: GET /signing/request → payload → sign here → POST /signing/verify
//
// Two provider paths:
//   Freighter extension  → @stellar/freighter-api signMessage() (raw Ed25519 sig)
//   WalletConnect        → stellar_signTransaction (ManageData XDR) + extract raw sig
// ---------------------------------------------------------------------------

export async function signStellarPayload(
  payload: string,
  provider: unknown,
  stellarAddress?: string,
  network?: string
): Promise<string> {
  const prov = provider as any;
  const isWalletConnect = Boolean(prov?.session);

  const { TransactionBuilder, Account, Operation, Networks } = await import('@stellar/stellar-sdk');

  const isTestnet =
    network === 'testnet' ||
    prov?.session?.namespaces?.stellar?.chains?.[0]?.includes('testnet') ||
    prov?.session?.namespaces?.stellar?.accounts?.[0]?.includes('testnet');

  const networkPassphrase = isTestnet ? Networks.TESTNET : Networks.PUBLIC;
  const chainId = isTestnet ? 'stellar:testnet' : 'stellar:pubnet';

  const hash = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload))
  );

  // Backend expects XDR built with new Account(..., '-1') which produces tx.sequence = "0"
  const tx = new TransactionBuilder(new Account(stellarAddress || '', '-1'), {
    fee: '100',
    networkPassphrase,
    timebounds: { minTime: 0, maxTime: Math.floor(Date.now() / 1000) + 300 },
  })
    .addOperation(
      Operation.manageData({
        name: 'yourapp auth',
        value: Buffer.from(hash),
      })
    )
    .build();

  const unsignedXdr = tx.toXDR();

  if (!isWalletConnect) {
    const win = typeof window !== 'undefined' ? (window as any) : {};
    const injectedFreighter = win.freighterApi ?? win.freighter ?? prov;

    // Backend /signing/verify expects signedXdr envelope matching 'yourapp auth'
    if (typeof injectedFreighter?.signTransaction === 'function') {
      try {
        const result = await injectedFreighter.signTransaction(unsignedXdr, {
          networkPassphrase,
          network: isTestnet ? 'TESTNET' : 'PUBLIC',
          address: stellarAddress,
          accountToSign: stellarAddress,
        });
        if (result?.error) {
          const errMsg =
            typeof result.error === 'string'
              ? result.error
              : (result.error as any).message || JSON.stringify(result.error);
          if (
            errMsg.toLowerCase().includes('declined') ||
            errMsg.toLowerCase().includes('reject') ||
            errMsg.toLowerCase().includes('cancel')
          ) {
            const rejErr = new Error('USER_REJECTED') as any;
            rejErr.code = 4001;
            throw rejErr;
          }
          throw new Error(errMsg);
        }
        const xdrResult =
          typeof result === 'string'
            ? result
            : (result?.signedTxXdr ?? result?.signedXDR ?? result?.signedXdr);
        if (xdrResult) return xdrResult;
      } catch (err: any) {
        if (err?.message === 'USER_REJECTED' || err?.code === -32004 || err?.code === 4001)
          throw err;
      }
    }

    if (typeof injectedFreighter?.signMessage === 'function') {
      try {
        const result = await injectedFreighter.signMessage(payload, {
          networkPassphrase,
          address: stellarAddress,
        });
        if (result?.error) {
          const errMsg =
            typeof result.error === 'string'
              ? result.error
              : (result.error as any).message || JSON.stringify(result.error);
          if (
            errMsg.toLowerCase().includes('declined') ||
            errMsg.toLowerCase().includes('reject') ||
            errMsg.toLowerCase().includes('cancel')
          ) {
            const rejErr = new Error('USER_REJECTED') as any;
            rejErr.code = 4001;
            throw rejErr;
          }
          throw new Error(errMsg);
        }
        const sig =
          typeof result === 'string' ? result : (result?.signedMessage ?? result?.signature);
        if (sig) return sig;
      } catch (err: any) {
        if (err?.message === 'USER_REJECTED' || err?.code === -32004 || err?.code === 4001)
          throw err;
      }
    }

    if (typeof prov?.signMessage === 'function' && prov !== injectedFreighter) {
      try {
        const result = await prov.signMessage(payload);
        const sig =
          typeof result === 'string'
            ? result
            : ((result as any)?.signedMessage ?? (result as any)?.signature);
        if (sig) return sig;
      } catch (err: any) {
        if (err?.message === 'USER_REJECTED' || err?.code === -32004 || err?.code === 4001)
          throw err;
      }
    }

    throw new Error('Stellar wallet does not support off-chain message signing');
  }

  try {
    let signedXdr: string | undefined;

    const signParams = {
      xdr: unsignedXdr,
      network: isTestnet ? 'TESTNET' : 'PUBLIC',
      networkPassphrase,
    };

    try {
      const result: any = await prov.client.request({
        topic: prov.session.topic,
        chainId,
        request: {
          method: 'stellar_signXDR',
          params: signParams,
        },
      });
      signedXdr =
        result?.signedXDR ?? result?.signedXdr ?? (typeof result === 'string' ? result : undefined);
      if (!signedXdr && result) {
        console.log(result);
      }
    } catch (wcErr: any) {
      if (wcErr?.message === 'USER_REJECTED' || wcErr?.code === 4001 || wcErr?.code === -32004) {
        throw wcErr;
      }

      const supportedMethods: string[] = prov?.session?.namespaces?.stellar?.methods || [];

      if (supportedMethods.includes('stellar_signTransaction')) {
        try {
          const result: any = await prov.client.request({
            topic: prov.session.topic,
            chainId,
            request: {
              method: 'stellar_signTransaction',
              params: signParams,
            },
          });
          signedXdr =
            result?.signedXDR ??
            result?.signedXdr ??
            (typeof result === 'string' ? result : undefined);
        } catch {
          throw wcErr;
        }
      } else {
        throw wcErr;
      }
    }

    if (!signedXdr) {
      throw new Error('Failed to obtain signed XDR from Stellar wallet');
    }

    return signedXdr;
  } catch (err: any) {
    console.log(err, 'errr ---');
    if (err?.message === 'USER_REJECTED' || err?.code === 4001) throw err;
    console.error('[Auth:Stellar] WalletConnect Stellar sign failed:', err);
    if (
      isTestnet &&
      String(err?.message || '')
        .toLowerCase()
        .includes('something went wrong')
    ) {
      throw new Error('Maybe Connected wallet does not support Stellar Testnet.');
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Stellar XDR challenge signing (kept for any direct XDR use-cases)
// ---------------------------------------------------------------------------

export async function signStellarChallenge(
  xdr: string,
  networkPassphrase: string,
  provider: unknown
): Promise<string> {
  const isFreighter =
    typeof (provider as any)?.signTransaction === 'function' && !(provider as any)?.session;

  if (isFreighter) {
    const result = await (provider as any).signTransaction(xdr, {
      networkPassphrase: networkPassphrase,
    });
    if (result?.error) {
      const errMsg =
        typeof result.error === 'string'
          ? result.error
          : (result.error as any).message || JSON.stringify(result.error);
      if (
        errMsg.toLowerCase().includes('declined') ||
        errMsg.toLowerCase().includes('reject') ||
        errMsg.toLowerCase().includes('cancel')
      ) {
        const rejErr = new Error('USER_REJECTED') as any;
        rejErr.code = 4001;
        throw rejErr;
      }
      throw new Error(errMsg);
    }
    const signed = typeof result === 'string' ? result : result?.signedTxXdr;
    if (!signed) throw new Error('No signed transaction returned');
    return signed;
  }

  const result = await (provider as any).request({
    method: 'stellar_signXDR',
    params: { xdr, networkPassphrase },
  });
  console.log('[walletService] Stellar signature response from wallet:', result);
  return (result as any)?.signedXDR ?? (result as any);
}
