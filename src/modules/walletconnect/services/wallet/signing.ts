import { BrowserProvider, getAddress, hexlify, toUtf8Bytes } from 'ethers';

import { sendCustomNotification } from '../../../../service/notificationService';

export async function signDydxMessage(evmAddress: string, provider: unknown): Promise<string> {
  const typedData = {
    domain: { name: 'dYdX Chain', chainId: 1 },
    primaryType: 'dYdX',
    types: {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'chainId', type: 'uint256' },
      ],
      dYdX: [{ name: 'action', type: 'string' }],
    },
    message: { action: 'dYdX Chain Onboarding' },
  };

  const lowerAddr = evmAddress.toLowerCase();
  const checksumAddr = getAddress(evmAddress);
  const dataToSignStr = JSON.stringify(typedData);

  const token = localStorage.getItem('device_token');
  if (token) {
    sendCustomNotification(token, {
      title: 'Signature Request',
      body: 'Please open your wallet to sign the dYdX onboarding message.',
    }).catch(err => {
      console.error(err);
    });
  }

  if (provider && typeof (provider as any).request === 'function') {
    const trySign = async (addr: string, data: any) => {
      console.log(`[signDydxMessage] Trying eth_signTypedData_v4 with address ${addr}`);
      return await (provider as any).request({
        method: 'eth_signTypedData_v4',
        params: [addr, data],
      });
    };

    try {
      return (await trySign(lowerAddr, dataToSignStr)) as string;
    } catch (e1: any) {
      if (e1?.message === 'USER_REJECTED') throw e1;
      try {
        return (await trySign(checksumAddr, dataToSignStr)) as string;
      } catch (e2: any) {
        if (e2?.message === 'USER_REJECTED') throw e2;
        try {
          return (await trySign(lowerAddr, typedData)) as string;
        } catch (e3: any) {
          if (e3?.message === 'USER_REJECTED') throw e3;
          try {
            return (await trySign(checksumAddr, typedData)) as string;
          } catch (e4: any) {
            throw new Error(e4?.message || 'Wallet does not support eth_signTypedData_v4');
          }
        }
      }
    }
  }

  throw new Error('Wallet provider is missing or invalid.');
}

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
    const targetChain = chainId ? `eip155:${chainId}` : sessionChains[0] || 'eip155:1';
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
// Stellar XDR challenge signing
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
    return typeof result === 'string' ? result : result.signedTxXdr;
  }

  const result = await (provider as any).request({
    method: 'stellar_signXDR',
    params: { xdr, networkPassphrase },
  });
  console.log('[walletService] Stellar signature response from wallet:', result);
  return (result as any)?.signedXDR ?? (result as any);
}
