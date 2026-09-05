import { WalletConnectModal } from '@walletconnect/modal';

import { sendCustomNotification } from '../../../../service/notificationService';
import { isMobileDevice } from '../../../../utils/walletConnectUtils';
import {
  WALLETCONNECT_PROJECT_ID,
  buildUnifiedNamespaces,
  getEVMChains,
  getStellarConfig,
} from '../../config/chains';
import { WALLET_METADATA_MAP } from '../../constants/Wallet';
import { getOrCreateProvider } from './providerRegistry';
import type { UnifiedConnectionResult, WalletServiceContext, WalletSession } from './types';

const CONNECTION_TIMEOUT_MS = 120_000;

function getSessionMetadata(walletId: string, peerMetadata?: any) {
  const fallback = WALLET_METADATA_MAP[walletId] || WALLET_METADATA_MAP['walletconnect'];
  return {
    peerName: peerMetadata?.name || fallback?.name || walletId,
    peerIcon: peerMetadata?.icons?.[0] || fallback?.icon || '',
    peerRedirect: peerMetadata?.redirect || undefined,
  };
}

export async function connectUnified(
  ctx: WalletServiceContext,
  walletId: string
): Promise<UnifiedConnectionResult> {
  ctx.emitState('evm', 'connecting');

  let provider: any;
  let modal: WalletConnectModal | undefined;

  try {
    provider = await getOrCreateProvider(ctx, 'unified');
    const namespaces = buildUnifiedNamespaces(ctx.currentNetwork);

    const evmChains = getEVMChains(ctx.currentNetwork).map(c => `eip155:${c.chainId}`);
    const stellarConfig = getStellarConfig(ctx.currentNetwork);
    const stellarChain = `stellar:${stellarConfig.chainId}`;

    modal = new WalletConnectModal({
      projectId: WALLETCONNECT_PROJECT_ID,
      chains: [...evmChains, stellarChain],
      themeMode: 'dark',
      explorerRecommendedWalletIds: [
        'a4604022bf9199ca6d762c5663d8a6186a9ca4b607b9dcb29bcb81054d6f1091', // SwiftEx Wallet
        '4622a2b2d6af1c9844944291e5e7351a6aa24cd7b23099efac1b2fd875da31a0', // Trust Wallet
        'c57ca95b47569778a828d19178114f4db188b89b763c899ba0be274e97267d96', // MetaMask
        'a797aa35c0fadbfc1a53e7f675162ed5226968b44a19ee3d24385c64d1d3c393', // Phantom
      ],
    });
    ctx.modals.set('unified', modal);

    const networkTag = (ctx.currentNetwork || 'mainnet').toUpperCase();
    console.info(
      `[WalletConnect:${networkTag}] Initializing unified pairing for wallet: ${walletId}`
    );

    const session = await new Promise<any>((resolve, reject) => {
      const timeout = setTimeout(() => {
        console.warn(
          `[WalletConnect:${networkTag}] Connection timed out after ${CONNECTION_TIMEOUT_MS / 1000}s`
        );
        modal!.closeModal();
        reject(new Error('Connection timeout'));
      }, CONNECTION_TIMEOUT_MS);

      // Guard flag: once provider.connect() resolves, modal-close must NOT reject
      let sessionResolved = false;
      let modalOpened = false;

      const unsubscribe = modal!.subscribeModal(state => {
        if (state.open) {
          modalOpened = true;
          console.info(
            `[WalletConnect:${networkTag}] QR modal opened — waiting for wallet approval...`
          );
        } else if (modalOpened && !state.open) {
          // Modal closed — only treat as cancel if session hasn't resolved yet
          if (!sessionResolved) {
            console.info(
              `[WalletConnect:${networkTag}] Modal closed before session resolved — treating as user cancel`
            );
            clearTimeout(timeout);
            unsubscribe();
            provider.abortPairing?.();
            reject(new Error('User closed the modal'));
          } else {
            console.debug(
              `[WalletConnect:${networkTag}] Modal closed after session resolved — ignoring`
            );
          }
        }
      });

      provider.on('display_uri', (uri: string) => {
        console.info(`[WalletConnect:${networkTag}] WC URI generated — opening modal/deeplink`);
        ctx.openMobileDeepLink(walletId, uri);
        if (!isMobileDevice() || walletId === 'walletconnect') {
          modal!.openModal({ uri });
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
      });

      provider
        .connect({ ...namespaces })
        .then((s: any) => {
          // Mark resolved FIRST — before closing modal — to prevent false rejection
          sessionResolved = true;
          console.info(
            `[WalletConnect:${networkTag}] ✓ provider.connect() resolved — session established`
          );
          clearTimeout(timeout);
          unsubscribe();
          modal!.closeModal();
          resolve(s);
        })
        .catch((err: any) => {
          console.error(
            `[WalletConnect:${networkTag}] ✕ provider.connect() failed:`,
            err?.message ?? err
          );
          clearTimeout(timeout);
          unsubscribe();
          modal!.closeModal();
          reject(err);
        });
    });

    const result: UnifiedConnectionResult = {};
    const peerMetadata = session.peer?.metadata;
    const meta = getSessionMetadata(walletId, peerMetadata);

    const evmAccounts: string[] = session.namespaces?.eip155?.accounts ?? [];
    if (evmAccounts.length > 0) {
      const [, chainIdStr, address] = evmAccounts[0].split(':');
      const evmSession: WalletSession = {
        type: 'evm',
        walletId,
        evmAddress: address,
        evmChainId: parseInt(chainIdStr, 10),
        connectionMode: 'unified',
        peerName: meta.peerName,
        peerIcon: meta.peerIcon,
        peerRedirect: meta.peerRedirect,
      };
      ctx.sessions.set('evm', evmSession);
      ctx.providers.set('evm', provider);
      result.evm = evmSession;
      ctx.emitState('evm', 'connected');
    }

    const stellarAccounts: string[] = session.namespaces?.stellar?.accounts ?? [];
    if (stellarAccounts.length > 0) {
      const [, chainId, address] = stellarAccounts[0].split(':');
      const stellarSession: WalletSession = {
        type: 'stellar',
        walletId,
        stellarAddress: address,
        stellarChainId: chainId,
        connectionMode: 'unified',
        peerName: meta.peerName,
        peerIcon: meta.peerIcon,
        peerRedirect: meta.peerRedirect,
      };
      ctx.sessions.set('stellar', stellarSession);
      ctx.providers.set('stellar', provider);
      result.stellar = stellarSession;
      ctx.emitState('stellar', 'connected');
    }

    console.info(`[WalletConnect:${networkTag}] ✓ Unified session established:`, {
      peer: meta.peerName,
      evm: result.evm ? `${result.evm.evmAddress} (Chain ${result.evm.evmChainId})` : 'none',
      stellar: result.stellar
        ? `${result.stellar.stellarAddress} (${result.stellar.stellarChainId})`
        : 'none',
    });

    ctx.saveSession();
    return result;
  } catch (error: any) {
    modal?.closeModal();
    if (provider && !provider.session) {
      ctx.providers.delete('unified');
    }
    ctx.emitState('evm', 'failed');
    throw error;
  }
}
