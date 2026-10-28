import * as FreighterApi from '@stellar/freighter-api';
import { WalletConnectModal } from '@walletconnect/modal';

import { sendCustomNotification } from '../../../../service/notificationService';
import { isMobileDevice } from '../../../../utils/walletConnectUtils';
import { WALLETCONNECT_PROJECT_ID, getStellarConfig } from '../../config/chains';
import { WALLET_METADATA_MAP } from '../../constants/Wallet';
import { isUserRejection } from '../../utils/walletErrorHandler';
import { setupWalletConnectListeners } from './eventListeners';
import { discoverStellarExtensions, getOrCreateProvider } from './providerRegistry';
import type { WalletServiceContext, WalletSession } from './types';

const CONNECTION_TIMEOUT_MS = 120_000;

function getSessionMetadata(walletId: string, peerMetadata?: any) {
  const fallback = WALLET_METADATA_MAP[walletId] || WALLET_METADATA_MAP['walletconnect'];
  return {
    peerName: peerMetadata?.name || fallback?.name || walletId,
    peerIcon: peerMetadata?.icons?.[0] || fallback?.icon || '',
    peerRedirect: peerMetadata?.redirect || undefined,
  };
}

export async function connectStellar(
  ctx: WalletServiceContext,
  walletId: string
): Promise<WalletSession> {
  ctx.emitState('stellar', 'connecting');

  try {
    if (walletId !== 'walletconnect') {
      // ── Freighter: use official @stellar/freighter-api package (message-passing) ──
      // window.freighterApi is NOT injected by modern Freighter — the npm package
      // communicates with the extension via chrome.runtime.sendMessage internally.
      if (walletId === 'freighter') {
        try {
          return await connectFreighter(ctx);
        } catch (freighterErr: any) {
          if (
            freighterErr?.message?.includes('not active') ||
            freighterErr?.message?.includes('not installed') ||
            freighterErr?.message?.includes('not detected')
          ) {
            console.info(
              `[WalletService] Freighter extension not active/installed — falling back to WalletConnect QR`
            );
            return connectStellarWalletConnectSingle(ctx, walletId);
          }
          throw freighterErr;
        }
      }

      const win = window as any;

      let discovered = discoverStellarExtensions();
      if (discovered.length === 0) {
        await new Promise(r => setTimeout(r, 200));
        discovered = discoverStellarExtensions();
      }
      const matched = discovered.find(d => d.id === walletId);
      let provider = matched?.provider;

      if (!provider) {
        provider =
          win[walletId] ||
          win[`${walletId}Api`] ||
          win[`${walletId}Stellar`] ||
          win[`${walletId}Wallet`];
      }

      const isValid =
        provider &&
        (typeof provider.getPublicKey === 'function' ||
          typeof provider.getAddress === 'function' ||
          typeof provider.requestAccess === 'function' ||
          typeof provider.isAllowed === 'function' ||
          typeof provider.isConnected === 'function' ||
          typeof provider.signTransaction === 'function' ||
          typeof provider.sign === 'function');

      if (isValid) {
        return connectStellarExtension(ctx, walletId, provider);
      }

      console.info(
        `[WalletService] ${walletId} extension not detected — falling back to WalletConnect QR`
      );
    }

    return connectStellarWalletConnectSingle(ctx, walletId);
  } catch (error) {
    ctx.emitState('stellar', 'failed');
    throw error;
  }
}

async function connectFreighter(ctx: WalletServiceContext): Promise<WalletSession> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('Freighter connection timed out')), 60_000);
  });

  return Promise.race([
    (async () => {
      const connResult = await FreighterApi.isConnected();
      const connected =
        typeof connResult === 'boolean' ? connResult : !!(connResult as any)?.isConnected;
      if (!connected) {
        throw new Error(
          'Freighter extension is not active. Please unlock Freighter and try again.'
        );
      }

      let alreadyAllowed = false;
      try {
        const allowResult = await FreighterApi.isAllowed();
        alreadyAllowed =
          typeof allowResult === 'boolean' ? allowResult : !!(allowResult as any)?.isAllowed;
      } catch (err) {
        void err;
      }

      if (!alreadyAllowed) {
        const accessResult = await FreighterApi.requestAccess();
        const accessErr = (accessResult as any)?.error;
        if (accessErr) {
          const msg = typeof accessErr === 'string' ? accessErr : JSON.stringify(accessErr);
          throw Object.assign(new Error(msg), { code: 4001 });
        }
      }

      const addrResult = await FreighterApi.getAddress();
      const address =
        typeof addrResult === 'string' ? addrResult : (addrResult as any)?.address || '';
      if (!address) {
        throw new Error('Freighter did not return a public key. Please try again.');
      }

      const config = getStellarConfig(ctx.currentNetwork);
      const meta = getSessionMetadata('freighter');

      const freighterProvider = {
        _isFreighter: true,
        isConnected: FreighterApi.isConnected,
        isAllowed: FreighterApi.isAllowed,
        requestAccess: FreighterApi.requestAccess,
        getAddress: FreighterApi.getAddress,
        signTransaction: FreighterApi.signTransaction,
        signMessage: FreighterApi.signMessage,
        getNetwork: FreighterApi.getNetwork,
        getNetworkDetails: FreighterApi.getNetworkDetails,
      };

      const session: WalletSession = {
        type: 'stellar',
        walletId: 'freighter',
        stellarAddress: address,
        stellarChainId: config.chainId,
        peerName: meta.peerName,
        peerIcon: meta.peerIcon,
        peerRedirect: meta.peerRedirect,
      };

      ctx.sessions.set('stellar', session);
      ctx.providers.set('stellar', freighterProvider);
      ctx.emitState('stellar', 'connected');
      ctx.saveSession();
      return session;
    })(),
    timeoutPromise,
  ]);
}

export async function connectStellarExtension(
  ctx: WalletServiceContext,
  walletId: string,
  extensionProvider: any
): Promise<WalletSession> {
  let publicKey = '';

  // ── Step 1: Verify the extension is reachable (modern Freighter SEP-43) ──
  if (typeof extensionProvider.isConnected === 'function') {
    try {
      const connResult = await extensionProvider.isConnected();
      // Modern Freighter: { isConnected: boolean }
      const connected = typeof connResult === 'boolean' ? connResult : !!connResult?.isConnected;
      if (!connected) {
        throw new Error(
          `${walletId} extension is not active. Please open the extension and try again.`
        );
      }
    } catch (err: any) {
      if (err?.message?.includes('not active')) throw err;
      // isConnected threw — extension may still work, continue
      console.warn('[WalletService] isConnected() threw, continuing anyway:', err);
    }
  }

  // ── Step 2: Check if already authorised (skip requestAccess popup if so) ──
  let alreadyAllowed = false;
  if (typeof extensionProvider.isAllowed === 'function') {
    try {
      const allowedResult = await extensionProvider.isAllowed();
      alreadyAllowed =
        typeof allowedResult === 'boolean' ? allowedResult : !!allowedResult?.isAllowed;
    } catch {
      // ignore — best-effort
    }
  }

  // ── Step 3: Request access / authorization ────────────────────────────────
  if (!alreadyAllowed && typeof extensionProvider.requestAccess === 'function') {
    try {
      const access = await extensionProvider.requestAccess();
      // Modern Freighter: { address: string, error: string }
      if (access?.error) {
        const msg = typeof access.error === 'string' ? access.error : JSON.stringify(access.error);
        if (isUserRejection({ message: msg, code: 4001 })) {
          throw Object.assign(new Error(msg), { code: 4001 });
        }
        console.warn('[WalletService] requestAccess returned error:', msg);
      }
      if (typeof access === 'string') {
        publicKey = access;
      } else if (access && typeof access.address === 'string' && access.address) {
        publicKey = access.address;
      } else if (access && typeof access.publicKey === 'string') {
        publicKey = access.publicKey;
      }
    } catch (err: any) {
      if (isUserRejection(err)) throw err;
      console.warn('[WalletService] requestAccess failed, trying getPublicKey/getAddress:', err);
    }
  } else if (!alreadyAllowed && typeof extensionProvider.connect === 'function') {
    await extensionProvider.connect();
  }

  // ── Step 4: Retrieve public key / address if not yet resolved ─────────────
  if (!publicKey) {
    if (typeof extensionProvider.getAddress === 'function') {
      try {
        const res = await extensionProvider.getAddress();
        // Modern Freighter: { address: string, error: string }
        if (res?.error) {
          console.warn('[WalletService] getAddress error:', res.error);
        }
        publicKey = typeof res === 'string' ? res : res?.address || res?.publicKey || '';
      } catch (err) {
        console.warn('[WalletService] getAddress threw:', err);
      }
    }
    if (!publicKey && typeof extensionProvider.getPublicKey === 'function') {
      const res = await extensionProvider.getPublicKey();
      publicKey = typeof res === 'string' ? res : res?.address || res?.publicKey || '';
    }
  }

  if (!publicKey) {
    throw new Error('No public key returned by Stellar extension');
  }

  const config = getStellarConfig(ctx.currentNetwork);
  const meta = getSessionMetadata(walletId);

  const session: WalletSession = {
    type: 'stellar',
    walletId: walletId,
    stellarAddress: publicKey,
    stellarChainId: config.chainId,
    peerName: meta.peerName,
    peerIcon: meta.peerIcon,
    peerRedirect: meta.peerRedirect,
  };

  ctx.sessions.set('stellar', session);
  ctx.providers.set('stellar', extensionProvider);
  ctx.emitState('stellar', 'connected');
  ctx.saveSession();
  return session;
}

export async function connectStellarWalletConnectSingle(
  ctx: WalletServiceContext,
  walletId: string
): Promise<WalletSession> {
  const provider = await getOrCreateProvider(ctx, 'stellar');
  const config = getStellarConfig(ctx.currentNetwork);
  const stellarChain = `stellar:${config.chainId}`;

  const namespaces = {
    stellar: {
      methods: [
        'stellar_signMessage',
        'stellar_signXDR',
        'stellar_signAndSubmitXDR',
        'stellar_signTransaction',
      ],
      chains: [stellarChain],
      events: ['accountsChanged'],
    },
  };

  const modal = new WalletConnectModal({
    projectId: WALLETCONNECT_PROJECT_ID,
    chains: [stellarChain],
    themeMode: 'dark',
    explorerRecommendedWalletIds: [
      'a4604022bf9199ca6d762c5663d8a6186a9ca4b607b9dcb29bcb81054d6f1091', // SwiftEx Wallet
      '76a3d548a08cf402f5c7d021f24fd2881d767084b387a5325df88bc3d4b6f21b', // Lobstr
      '997a355c8f682468706a76cff1b004a7115f505fb962dac54b6e9b442dd1c380', // Freighter
      'aee5083aac025c4c3f1c9afc31ea89dbddca0b1c248195bef469fc4886ae3ab2', // HOT Wallet
    ],
  });
  ctx.modals.set('stellar', modal);

  const connectParams =
    ctx.currentNetwork === 'testnet'
      ? { optionalNamespaces: namespaces, requiredNamespaces: {} }
      : { namespaces };

  return new Promise((resolve, reject) => {
    let sessionResolved = false;
    let modalOpened = false;

    const onDisplayUri = (uri: string) => {
      ctx.openMobileDeepLink(walletId, uri);
      if (!isMobileDevice() || walletId === 'walletconnect') {
        modal.openModal({ uri });
      }
      const token = localStorage.getItem('device_token');
      if (token) {
        sendCustomNotification(token, {
          title: 'Connection Request',
          body: 'Please open your wallet to connect.',
        }).catch(err => {
          console.error(err);
        });
      }
    };

    const cleanup = () => {
      ctx.cancelActiveConnection = undefined;
      ctx.modals.delete('stellar');
      clearTimeout(timeout);
      unsubscribe();
      try {
        if (typeof provider.removeListener === 'function') {
          provider.removeListener('display_uri', onDisplayUri);
        } else if (typeof provider.off === 'function') {
          provider.off('display_uri', onDisplayUri);
        }
      } catch (err) {
        void err;
      }
    };

    ctx.cancelActiveConnection = (reason = 'Connection cancelled by user') => {
      cleanup();
      modal.closeModal();
      reject(new Error(reason));
    };

    const timeout = setTimeout(() => {
      cleanup();
      modal.closeModal();
      reject(new Error('Connection timeout'));
    }, CONNECTION_TIMEOUT_MS);

    const unsubscribe = modal.subscribeModal(state => {
      if (state.open) {
        modalOpened = true;
      } else if (modalOpened && !state.open) {
        if (!sessionResolved) {
          cleanup();
          provider.abortPairing?.();
          reject(new Error('User closed the modal'));
        }
      }
    });

    provider.on('display_uri', onDisplayUri);

    provider
      .connect(connectParams as any)
      .then((session: any) => {
        sessionResolved = true;
        cleanup();
        modal.closeModal();

        const account: string | undefined = session.namespaces?.stellar?.accounts?.[0];
        if (!account || typeof account !== 'string') {
          reject(new Error('No Stellar account returned'));
          return;
        }

        const parts = account.split(':');
        if (parts.length < 3) {
          reject(new Error('Malformed CAIP-10 Stellar account format'));
          return;
        }

        const [, chainId, address] = parts;
        if (!address || !/^G[A-Z2-7]{55}$/.test(address)) {
          reject(new Error('Invalid Stellar public key returned by wallet'));
          return;
        }
        const peerMetadata = session.peer?.metadata;
        const meta = getSessionMetadata(walletId, peerMetadata);

        const stellarSession: WalletSession = {
          type: 'stellar',
          walletId,
          stellarAddress: address,
          stellarChainId: chainId,
          connectionMode: 'separate',
          peerName: meta.peerName,
          peerIcon: meta.peerIcon,
          peerRedirect: meta.peerRedirect,
        };

        ctx.sessions.set('stellar', stellarSession);
        ctx.providers.set('stellar', provider);
        ctx.emitState('stellar', 'connected');
        ctx.saveSession();

        setupWalletConnectListeners(ctx, provider, 'stellar');
        resolve(stellarSession);
      })
      .catch((error: any) => {
        cleanup();
        modal.closeModal();
        reject(error);
      });
  });
}
