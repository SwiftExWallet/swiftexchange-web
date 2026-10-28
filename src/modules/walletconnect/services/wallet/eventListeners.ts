import type { WalletServiceContext, WalletType } from './types';

type EVMHandlers = {
  accountsChanged: (accounts: string[]) => void;
  chainChanged: (chainId: string) => void;
  disconnect: () => void;
};

const evmListenerMap = new WeakMap<object, EVMHandlers>();

export function setupEVMListeners(ctx: WalletServiceContext, provider: any): void {
  const existing = evmListenerMap.get(provider);
  if (existing) {
    provider.removeListener?.('accountsChanged', existing.accountsChanged);
    provider.removeListener?.('chainChanged', existing.chainChanged);
    provider.removeListener?.('disconnect', existing.disconnect);
  }

  const handlers: EVMHandlers = {
    accountsChanged: (accounts: string[]) => {
      if (!accounts?.length) {
        handleDisconnect(ctx, 'evm');
        return;
      }

      const session = ctx.sessions.get('evm');
      if (!session) return;

      session.evmAddress = accounts[0];

      ctx.sessions.set('evm', session);
      ctx.saveSession();
      ctx.emitState('evm', 'connected');
    },
    chainChanged: (chainId: string) => {
      const session = ctx.sessions.get('evm');
      if (!session) return;
      session.evmChainId = parseInt(chainId, 16);
      ctx.sessions.set('evm', session);
      ctx.saveSession();
      ctx.emitState('evm', 'connected');
    },
    disconnect: () => {
      handleDisconnect(ctx, 'evm');
    },
  };

  evmListenerMap.set(provider, handlers);

  provider.on('accountsChanged', handlers.accountsChanged);
  provider.on('chainChanged', handlers.chainChanged);
  provider.on('disconnect', handlers.disconnect);
}

// ---------------------------------------------------------------------------
// WalletConnect session listeners
// ---------------------------------------------------------------------------

export function setupWalletConnectListeners(
  ctx: WalletServiceContext,
  provider: any,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _type: WalletType
): void {
  if (ctx.registeredProviders.has(provider)) return;
  ctx.registeredProviders.add(provider);

  const getBoundTypes = (): WalletType[] => {
    const types: WalletType[] = [];
    for (const [key, p] of ctx.providers.entries()) {
      if (p === provider && (key === 'evm' || key === 'stellar')) {
        types.push(key as WalletType);
      }
    }
    return types;
  };

  provider.on(
    'session_event',
    ({ event, chainId }: { event: { name: string; data: any }; chainId?: string }) => {
      let eventType: WalletType | undefined;
      if (chainId?.startsWith('eip155')) eventType = 'evm';
      else if (chainId?.startsWith('stellar')) eventType = 'stellar';
      else {
        const bound = getBoundTypes();
        if (bound.length > 0) eventType = bound[0];
      }

      if (!eventType) return;
      if (event.name === 'accountsChanged') handleAccountsChanged(ctx, eventType, event.data);
      if (event.name === 'chainChanged') handleChainChanged(ctx, eventType, event.data);
    }
  );

  provider.on('session_update', ({ params }: { topic: string; params: any }) => {
    if (params?.namespaces) {
      getBoundTypes().forEach(t => handleSessionUpdate(ctx, t, params.namespaces));
    }
  });

  provider.on('session_delete', (event: any) => {
    console.log('[WC] SESSION DELETE', event);
    getBoundTypes().forEach(t => handleDisconnect(ctx, t));
  });
  provider.on('session_expire', () => getBoundTypes().forEach(t => handleDisconnect(ctx, t)));
  provider.on('session_ping', () =>
    getBoundTypes().forEach(t => ctx.lastPingAt.set(t, Date.now()))
  );
  provider.on('session_extend', () => {
    getBoundTypes().forEach(t => {
      if (ctx.sessions.get(t)) ctx.emitState(t, 'connected');
    });
  });
  provider.on('proposal_expire', () => {});
  provider.on('disconnect', () => getBoundTypes().forEach(t => handleDisconnect(ctx, t)));
}

// ---------------------------------------------------------------------------
// Visibility handler (relay transport reopen)
export function removeEVMListeners(provider: any): void {
  if (!provider) return;
  const existing = evmListenerMap.get(provider);
  if (existing) {
    try {
      if (typeof provider.removeListener === 'function') {
        provider.removeListener('accountsChanged', existing.accountsChanged);
        provider.removeListener('chainChanged', existing.chainChanged);
        provider.removeListener('disconnect', existing.disconnect);
      } else if (typeof provider.off === 'function') {
        provider.off('accountsChanged', existing.accountsChanged);
        provider.off('chainChanged', existing.chainChanged);
        provider.off('disconnect', existing.disconnect);
      }
    } catch {
      // ignore
    }
    evmListenerMap.delete(provider);
  }
}

// ---------------------------------------------------------------------------
// Internal event handlers
// ---------------------------------------------------------------------------

export function handleAccountsChanged(
  ctx: WalletServiceContext,
  type: WalletType,
  accounts: unknown
): void {
  if (!accounts || (Array.isArray(accounts) && accounts.length === 0)) {
    handleDisconnect(ctx, type);
    return;
  }

  const session = ctx.sessions.get(type);
  if (!session) return;

  const firstAccount = Array.isArray(accounts) ? accounts[0] : accounts;
  if (typeof firstAccount !== 'string') return;

  if (type === 'evm') {
    if (firstAccount.includes(':')) {
      const parts = firstAccount.split(':');
      if (parts.length >= 3) {
        const [, chainIdStr, address] = parts;
        if (address && address.startsWith('0x') && address.length >= 8) {
          session.evmAddress = address;
          session.evmChainId = parseInt(chainIdStr, 10);
        }
      }
    } else if (firstAccount.startsWith('0x') && firstAccount.length >= 8) {
      session.evmAddress = firstAccount;
    }
  } else if (type === 'stellar') {
    if (firstAccount.includes(':')) {
      const parts = firstAccount.split(':');
      if (parts.length >= 3) {
        const [, chainId, address] = parts;
        if (
          address &&
          (address.startsWith('G') || address.startsWith('C') || /^[A-Z0-9]+$/i.test(address)) &&
          address.length >= 20
        ) {
          session.stellarAddress = address;
          session.stellarChainId = chainId;
        }
      }
    } else if (
      (firstAccount.startsWith('G') ||
        firstAccount.startsWith('C') ||
        /^[A-Z0-9]+$/i.test(firstAccount)) &&
      firstAccount.length >= 20
    ) {
      session.stellarAddress = firstAccount;
    }
  }

  ctx.sessions.set(type, session);
  ctx.saveSession();
  ctx.emitState(type, 'connected');
}

export function handleChainChanged(
  ctx: WalletServiceContext,
  type: WalletType,
  chainData: unknown
): void {
  const session = ctx.sessions.get(type);
  if (!session || type !== 'evm') return;

  if (typeof chainData === 'string') {
    session.evmChainId = chainData.startsWith('0x')
      ? parseInt(chainData, 16)
      : parseInt(chainData, 10);
  } else if (typeof chainData === 'number') {
    session.evmChainId = chainData;
  } else {
    return;
  }

  ctx.sessions.set(type, session);
  ctx.saveSession();
  ctx.emitState(type, 'connected');
}

export function handleSessionUpdate(
  ctx: WalletServiceContext,
  type: WalletType,
  namespaces: any
): void {
  const session = ctx.sessions.get(type);
  if (!session) return;

  if (type === 'evm' && namespaces.eip155) {
    const account: string | undefined = namespaces.eip155.accounts?.[0];
    if (account) {
      const [, chainIdStr, address] = account.split(':');
      session.evmAddress = address;
      session.evmChainId = parseInt(chainIdStr, 10);
    }
  } else if (type === 'stellar' && namespaces.stellar) {
    const account: string | undefined = namespaces.stellar.accounts?.[0];
    if (account) {
      const [, chainId, address] = account.split(':');
      session.stellarAddress = address;
      session.stellarChainId = chainId;
    }
  }

  ctx.sessions.set(type, session);
  ctx.saveSession();
  ctx.emitState(type, 'connected');
}

export function handleDisconnect(ctx: WalletServiceContext, type: WalletType): void {
  if (ctx.disconnecting.has(type)) return;
  ctx.handleDisconnect(type);
}
