import { removeEVMListeners } from './eventListeners';
import { saveSession } from './sessionPersistence';
import type { WalletServiceContext, WalletType } from './types';

// ---------------------------------------------------------------------------
// disconnect (single wallet type)
// ---------------------------------------------------------------------------

export async function disconnect(ctx: WalletServiceContext, type: WalletType): Promise<void> {
  if (ctx.disconnecting.has(type)) return;
  ctx.disconnecting.add(type);

  const provider = ctx.providers.get(type);
  const sharedTypes: WalletType[] = [type];

  if (provider) {
    for (const [key, p] of Array.from(ctx.providers.entries())) {
      const k = key as WalletType;
      if (k !== type && p === provider && (k === 'evm' || k === 'stellar')) {
        if (!ctx.disconnecting.has(k)) {
          ctx.disconnecting.add(k);
          sharedTypes.push(k);
        }
      }
    }
  }

  const networkTag = (ctx.currentNetwork || 'mainnet').toUpperCase();
  console.info(`[WalletConnect:${networkTag}] Disconnecting session: ${type}`);

  if (provider) {
    ctx.registeredProviders.delete(provider);
    removeEVMListeners(provider);

    if (provider.session) {
      try {
        await provider.disconnect();
      } catch (err: any) {
        console.warn('[WalletService] Error during provider disconnect:', err);
      }
    }

    for (const [key, p] of Array.from(ctx.providers.entries())) {
      if (p === provider) {
        ctx.providers.delete(key);
      }
    }
  }

  for (const t of sharedTypes) {
    ctx.isSignRequestInFlight.set(t, false);
    ctx.providers.delete(t);
  }

  for (const t of sharedTypes) {
    ctx.derivationInProgress = false;
    ctx.sessions.delete(t);
    ctx.lastPingAt.delete(t);
    ctx.modals.get(t)?.closeModal();
    ctx.modals.delete(t);
    ctx.disconnecting.delete(t);
  }

  saveSession(ctx);

  if (ctx.sessions.size === 0) {
    await clearAppData();
  }

  for (const t of sharedTypes) {
    ctx.emitState(t, 'disconnected');
  }
}

// ---------------------------------------------------------------------------
// disconnectAll
// ---------------------------------------------------------------------------

export async function disconnectAll(ctx: WalletServiceContext): Promise<void> {
  const networkTag = (ctx.currentNetwork || 'mainnet').toUpperCase();
  console.info(`[WalletConnect:${networkTag}] Disconnecting all connected wallets`);

  const providers = new Set(ctx.providers.values());
  for (const provider of providers) {
    removeEVMListeners(provider);
    if (provider?.session) {
      try {
        await provider.disconnect();
      } catch (err) {
        console.warn('[WalletService] Error disconnecting provider:', err);
      }
    }
  }

  ctx.providers.clear();
  ctx.isSignRequestInFlight.clear();
  ctx.sessions.clear();
  ctx.modals.clear();
  ctx.lastPingAt.clear();
  ctx.disconnecting.clear();
  ctx.registeredProviders.clear();

  await clearAppData();
}

// ---------------------------------------------------------------------------
// clearAppData — localStorage + IndexedDB + API keys
// ---------------------------------------------------------------------------

export async function clearAppData(): Promise<void> {
  try {
    // Core session keys
    localStorage.removeItem('wallet_sessions');
    localStorage.removeItem('_sx_active_auth_addr');

    // Sweep all keys — remove anything matching known stale patterns
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (
        key.startsWith('_sx_auth_') ||
        key.startsWith('stellar_active_') || // old format stale sessions
        key.startsWith('wc@2:') || // WalletConnect v2 pairing/session storage
        key.startsWith('walletconnect') ||
        key === 'wallet_sessions'
      ) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
  } catch (error) {
    console.warn('[WalletService] Storage clear failed:', error);
  }

  try {
    if (typeof indexedDB !== 'undefined') {
      indexedDB.deleteDatabase('_sx_v4_kv_28f3');
      indexedDB.deleteDatabase('WALLET_CONNECT_V2_INDEXED_DB'); // WC v2 IndexedDB
    }
  } catch (error) {
    console.error('[WalletService] Failed to clear IndexedDB:', error);
  }
}
