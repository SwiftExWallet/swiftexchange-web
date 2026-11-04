import { BrowserProvider, getAddress, hexlify, toUtf8Bytes } from 'ethers';

import { sendCustomNotification } from '../../../../service/notificationService';

// ---------------------------------------------------------------------------
// Production Timeout & Cancellation Wrapper
// ---------------------------------------------------------------------------

export class WalletSignError extends Error {
  code?: number | string;
  isUserRejected?: boolean;
  isTimeout?: boolean;
  isCancelled?: boolean;

  constructor(
    message: string,
    options?: {
      code?: number | string;
      isUserRejected?: boolean;
      isTimeout?: boolean;
      isCancelled?: boolean;
    }
  ) {
    super(message);
    this.name = 'WalletSignError';
    this.code = options?.code;
    this.isUserRejected = options?.isUserRejected;
    this.isTimeout = options?.isTimeout;
    this.isCancelled = options?.isCancelled;
  }
}

export function withTimeout<T>(
  promise: Promise<T>,
  ms = 60_000,
  signal?: AbortSignal,
  stepName = 'Wallet signing'
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let timer: NodeJS.Timeout | null = setTimeout(() => {
      timer = null;
      reject(
        new WalletSignError(
          `${stepName} timed out after ${Math.round(ms / 1000)}s. Please check your wallet popup or try again.`,
          { code: 'TIMEOUT', isTimeout: true }
        )
      );
    }, ms);

    const onAbort = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      reject(
        new WalletSignError(`${stepName} was cancelled.`, {
          code: 'USER_CANCELLED',
          isCancelled: true,
        })
      );
    };

    if (signal?.aborted) {
      onAbort();
      return;
    }

    signal?.addEventListener('abort', onAbort, { once: true });

    promise
      .then(res => {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        signal?.removeEventListener('abort', onAbort);
        resolve(res);
      })
      .catch(err => {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        signal?.removeEventListener('abort', onAbort);
        reject(err);
      });
  });
}

function normalizeUserRejection(err: unknown): WalletSignError | null {
  if (!err) return null;
  const msg =
    typeof err === 'object' && err !== null && 'message' in err
      ? String((err as { message: unknown }).message)
      : String(err);
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? (err as { code: unknown }).code
      : undefined;

  const lower = msg.toLowerCase();
  if (
    code === 4001 ||
    code === -32004 ||
    lower.includes('user rejected') ||
    lower.includes('declined') ||
    lower.includes('user cancelled') ||
    lower.includes('cancel') ||
    lower.includes('rejected by user')
  ) {
    return new WalletSignError('USER_REJECTED', { code: 4001, isUserRejected: true });
  }
  return null;
}

// ---------------------------------------------------------------------------
// SIWE (EIP-4361) personal_sign — multi-fallback with strict timeout & abort
// ---------------------------------------------------------------------------

export async function signSiweMessage(
  evmAddress: string,
  provider: unknown,
  message: string,
  chainId?: number | string,
  signal?: AbortSignal
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

  const signAction = async (): Promise<string> => {
    // 1. Direct WalletConnect v2 sign-client dispatch (topic & chainId specific)
    const wcProvider = provider as {
      client?: {
        request: (args: {
          topic: string;
          chainId: string;
          request: { id?: number; method: string; params: unknown[] };
        }) => Promise<string>;
      };
      session?: {
        topic: string;
        namespaces?: {
          eip155?: {
            chains?: string[];
            accounts?: string[];
          };
        };
      };
    };

    if (wcProvider?.client && wcProvider?.session?.topic) {
      const topic = wcProvider.session.topic;
      const sessionChains: string[] = wcProvider.session.namespaces?.eip155?.chains || [];
      const sessionAccounts: string[] = wcProvider.session.namespaces?.eip155?.accounts || [];
      const accountChain = sessionAccounts[0]?.split(':')?.[1];
      const defaultChain = sessionChains[0]?.replace('eip155:', '') || accountChain || '1';
      const targetChain = chainId ? `eip155:${chainId}` : `eip155:${defaultChain}`;
      const requestId = Date.now() * 1000 + Math.floor(Math.random() * 1000);

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
        return signature;
      } catch (err1) {
        const rej = normalizeUserRejection(err1);
        if (rej) throw rej;
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
          return signature;
        } catch (err2) {
          const rej2 = normalizeUserRejection(err2);
          if (rej2) throw rej2;
        }
      }
    }

    // 2. Standard EIP-1193 / Injected provider dispatch
    const injected = provider as {
      request?: (args: { method: string; params: unknown[] }) => Promise<string>;
    };

    if (injected && typeof injected.request === 'function') {
      try {
        const signature = await injected.request({
          method: 'personal_sign',
          params: [hexMsg, lowerAddr],
        });
        return signature;
      } catch (err1) {
        const rej = normalizeUserRejection(err1);
        if (rej) throw rej;
        try {
          const signature = await injected.request({
            method: 'personal_sign',
            params: [hexMsg, checksumAddr],
          });
          return signature;
        } catch (err2) {
          const rej2 = normalizeUserRejection(err2);
          if (rej2) throw rej2;
          try {
            const signature = await injected.request({
              method: 'personal_sign',
              params: [lowerAddr, hexMsg],
            });
            return signature;
          } catch (err3) {
            const rej3 = normalizeUserRejection(err3);
            if (rej3) throw rej3;
          }
        }
      }
    }

    // 3. Fallback to ethers BrowserProvider
    const browserProvider = new BrowserProvider(provider as any);
    const signer = await browserProvider.getSigner(evmAddress);
    return signer.signMessage(message);
  };

  try {
    return await withTimeout(signAction(), 60_000, signal, 'SIWE signature');
  } catch (error) {
    const rej = normalizeUserRejection(error);
    if (rej) throw rej;
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Stellar off-chain payload signing (SEP-53 / Ed25519)
//
// Flow: GET /signing/request → payload → signMessage → POST /signing/verify
// ---------------------------------------------------------------------------

export async function signStellarPayload(
  payload: string,
  provider: unknown,
  stellarAddress?: string,
  network?: string,
  signal?: AbortSignal
): Promise<string> {
  const prov = provider as any;
  const isWalletConnect = Boolean(prov?.session);

  const { Networks } = await import('@stellar/stellar-sdk');

  const isTestnet =
    network === 'testnet' ||
    prov?.session?.namespaces?.stellar?.chains?.[0]?.includes('testnet') ||
    prov?.session?.namespaces?.stellar?.accounts?.[0]?.includes('testnet');

  const networkPassphrase = isTestnet ? Networks.TESTNET : Networks.PUBLIC;
  const chainId = isTestnet ? 'stellar:testnet' : 'stellar:pubnet';

  // ── INJECTED WALLET PATH (Freighter & other browser extensions) ───────────
  if (!isWalletConnect) {
    const win = typeof window !== 'undefined' ? (window as any) : {};
    const injectedFreighter = win.freighterApi ?? win.freighter ?? prov;

    const signWithFreighter = async (): Promise<string> => {
      // 1. Transaction envelope signing (Backend /signing/verify requires signedXdr envelope matching 'yourapp auth')
      if (typeof injectedFreighter?.signTransaction === 'function') {
        const { TransactionBuilder, Account, Operation } = await import('@stellar/stellar-sdk');
        const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
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
              : result.error?.message || JSON.stringify(result.error);
          const rej = normalizeUserRejection(errMsg);
          if (rej) throw rej;
          throw new WalletSignError(errMsg);
        }

        const xdrResult =
          typeof result === 'string'
            ? result
            : (result?.signedTxXdr ?? result?.signedXDR ?? result?.signedXdr);
        if (xdrResult) return xdrResult;
      }

      // 2. Fallback: Direct signMessage if signTransaction is not available
      if (typeof injectedFreighter?.signMessage === 'function') {
        const result = await injectedFreighter.signMessage(payload, {
          networkPassphrase,
          address: stellarAddress,
        });

        if (result?.error) {
          const errMsg =
            typeof result.error === 'string'
              ? result.error
              : result.error?.message || JSON.stringify(result.error);
          const rej = normalizeUserRejection(errMsg);
          if (rej) throw rej;
          throw new WalletSignError(errMsg);
        }

        const rawSig = result?.signedMessage ?? result?.signature ?? result;
        if (rawSig) {
          if (typeof rawSig === 'string') return rawSig;
          if (Buffer.isBuffer(rawSig) || rawSig instanceof Uint8Array) {
            return Buffer.from(rawSig).toString('base64');
          }
        }
      }

      // 3. Fallback to generic provider.signMessage if prov is distinct
      if (typeof prov?.signMessage === 'function' && prov !== injectedFreighter) {
        const result = await prov.signMessage(payload, {
          networkPassphrase,
          address: stellarAddress,
        });
        if (result?.error) {
          const errMsg =
            typeof result.error === 'string'
              ? result.error
              : result.error?.message || JSON.stringify(result.error);
          const rej = normalizeUserRejection(errMsg);
          if (rej) throw rej;
          throw new WalletSignError(errMsg);
        }
        const rawSig = result?.signedMessage ?? result?.signature ?? result;
        if (rawSig) {
          if (typeof rawSig === 'string') return rawSig;
          if (Buffer.isBuffer(rawSig) || rawSig instanceof Uint8Array) {
            return Buffer.from(rawSig).toString('base64');
          }
        }
      }

      throw new WalletSignError(
        'Stellar wallet did not return a valid signature or signed transaction.'
      );
    };

    try {
      return await withTimeout(signWithFreighter(), 60_000, signal, 'Stellar sign-in');
    } catch (err) {
      const rej = normalizeUserRejection(err);
      if (rej) throw rej;
      throw err;
    }
  }

  // ── WALLETCONNECT MULTICHAIN PATH ────────────────────────────────────────
  const signWithWalletConnect = async (): Promise<string> => {
    const { TransactionBuilder, Account, Operation } = await import('@stellar/stellar-sdk');
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
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
    const signParams = {
      xdr: unsignedXdr,
      network: isTestnet ? 'TESTNET' : 'PUBLIC',
      networkPassphrase,
    };

    let signedXdr: string | undefined;

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
    } catch (wcErr: any) {
      const rej = normalizeUserRejection(wcErr);
      if (rej) throw rej;

      const supportedMethods: string[] = prov?.session?.namespaces?.stellar?.methods || [];
      if (supportedMethods.includes('stellar_signTransaction')) {
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
      } else {
        throw wcErr;
      }
    }

    if (!signedXdr) {
      throw new WalletSignError('Failed to obtain signed XDR from Stellar wallet');
    }

    return signedXdr;
  };

  try {
    return await withTimeout(
      signWithWalletConnect(),
      60_000,
      signal,
      'WalletConnect Stellar signing'
    );
  } catch (err: any) {
    const rej = normalizeUserRejection(err);
    if (rej) throw rej;
    if (
      isTestnet &&
      String(err?.message || '')
        .toLowerCase()
        .includes('something went wrong')
    ) {
      throw new WalletSignError('Connected wallet does not support Stellar Testnet.');
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Stellar XDR challenge signing (direct transaction signing)
// ---------------------------------------------------------------------------

export async function signStellarChallenge(
  xdr: string,
  networkPassphrase: string,
  provider: unknown,
  signal?: AbortSignal
): Promise<string> {
  const isFreighter =
    typeof (provider as any)?.signTransaction === 'function' && !(provider as any)?.session;

  const signAction = async (): Promise<string> => {
    if (isFreighter) {
      const result = await (provider as any).signTransaction(xdr, {
        networkPassphrase,
      });
      if (result?.error) {
        const errMsg =
          typeof result.error === 'string'
            ? result.error
            : result.error?.message || JSON.stringify(result.error);
        const rej = normalizeUserRejection(errMsg);
        if (rej) throw rej;
        throw new WalletSignError(errMsg);
      }
      const signed = typeof result === 'string' ? result : result?.signedTxXdr;
      if (!signed) throw new WalletSignError('No signed transaction returned');
      return signed;
    }

    const result = await (provider as any).request({
      method: 'stellar_signXDR',
      params: { xdr, networkPassphrase },
    });
    return (result as any)?.signedXDR ?? (result as any);
  };

  try {
    return await withTimeout(signAction(), 60_000, signal, 'Stellar transaction signing');
  } catch (err) {
    const rej = normalizeUserRejection(err);
    if (rej) throw rej;
    throw err;
  }
}
