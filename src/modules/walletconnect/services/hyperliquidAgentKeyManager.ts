import { useNotificationStore } from '@/store/notificationStore';
import { HttpTransport } from '@nktkas/hyperliquid';
import { approveAgent } from '@nktkas/hyperliquid/api/exchange';
import { BrowserProvider, Wallet } from 'ethers';

import { useWalletStore } from '../store/walletConnectStore';
import { destroyAESKey } from './keyVaultIndexedDB';
import { signerIframeBridge } from './signerIframeBridge';

const BLOB_KEY_PREFIX = '_sx_hl_agentkey';
const ADDR_KEY_PREFIX = '_sx_hl_agentaddr';

export class HyperliquidIsolatedSigner {
  readonly address: string;

  constructor(address: string) {
    this.address = address;
  }

  async getAddress(): Promise<string> {
    return this.address;
  }

  // Parameter length must be 3 for @nktkas/hyperliquid isEthersV6Signer detection
  async signTypedData(domain: any, types: any, value: any): Promise<string> {
    return signerIframeBridge.signTypedData(domain, types, value);
  }
}

function getBlobKey(isTestnet: boolean = false) {
  return `${BLOB_KEY_PREFIX}_${isTestnet ? 'testnet' : 'mainnet'}`;
}

function getAddrKey(isTestnet: boolean = false) {
  return `${ADDR_KEY_PREFIX}_${isTestnet ? 'testnet' : 'mainnet'}`;
}

export interface HyperliquidAgentKey {
  agentAddress: string;
  wallet: HyperliquidIsolatedSigner | Wallet;
}

function cleanupLegacyStorage(isTestnet: boolean): void {
  localStorage.removeItem(getBlobKey(isTestnet));
  localStorage.removeItem(BLOB_KEY_PREFIX);
  destroyAESKey(HL_AES_KEY_ID).catch(() => {});
}

export async function deriveHyperliquidAgentKey(
  evmAddress: string,
  provider: any,
  isTestnet?: boolean
): Promise<HyperliquidAgentKey> {
  const activeTestnet =
    isTestnet !== undefined ? isTestnet : useWalletStore.getState().network === 'testnet';
  const browserProvider = new BrowserProvider(provider);
  const signer = await browserProvider.getSigner(evmAddress);

  // 1. Ensure isolated signer iframe is connected and healthy
  const isReady = await signerIframeBridge.initialize();
  if (!isReady) {
    try {
      useNotificationStore.getState().addNotification({
        type: 'SYSTEM',
        title: 'Trading Service Notice',
        message:
          'Our secure trading engine is momentarily undergoing brief maintenance. Our engineering team is on it. Please try again in a moment.',
        status: 'warning',
      });
    } catch {
      // Notification store may not be mounted
    }
    throw new Error('Signer Service Unavailable. Secure trading engine is currently updating.');
  }

  // 2. Generate or retrieve agent key inside isolated vault (Private key never touches main window)
  const agentAddress = await signerIframeBridge.getOrCreateAgentKey(evmAddress);

  console.groupCollapsed('[hyperliquid] deriveHyperliquidAgentKey');
  console.log('evmAddress (signer):', evmAddress);
  console.log('agentAddress (isolated):', agentAddress);
  console.log('isTestnet:', activeTestnet);
  console.groupEnd();
  const transport = new HttpTransport({ isTestnet: activeTestnet });

  try {
    const roleInfo: any = await transport.request('info', {
      type: 'userRole',
      user: agentAddress as `0x${string}`,
    });
    if (
      roleInfo?.role === 'agent' &&
      roleInfo?.data?.user?.toLowerCase() === evmAddress.toLowerCase()
    ) {
      localStorage.setItem(getAddrKey(activeTestnet), agentAddress);
      cleanupLegacyStorage(activeTestnet);
      return {
        agentAddress,
        wallet: new HyperliquidIsolatedSigner(agentAddress),
      };
    }
  } catch {
    void 0;
  }

  try {
    const agents: any = await transport.request('info', {
      type: 'extraAgents',
      user: evmAddress as `0x${string}`,
    });
    if (Array.isArray(agents)) {
      const match = agents.find(
        (a: any) => a.address?.toLowerCase() === agentAddress.toLowerCase()
      );
      if (match) {
        localStorage.setItem(getAddrKey(activeTestnet), agentAddress);
        cleanupLegacyStorage(activeTestnet);
        return {
          agentAddress,
          wallet: new HyperliquidIsolatedSigner(agentAddress),
        };
      }
    }
  } catch {
    void 0;
  }

  try {
    await approveAgent(
      { transport, wallet: signer },
      { agentAddress: agentAddress as `0x${string}`, agentName: '' }
    );
  } catch (error: any) {
    console.error('[hyperliquid] approveAgent failed:', error);
    const msg = error?.message || '';

    if (msg.includes('Extra agent already used') || msg.includes('already used')) {
      try {
        const roleInfo: any = await transport.request('info', {
          type: 'userRole',
          user: agentAddress as `0x${string}`,
        });
        if (
          roleInfo?.role === 'agent' &&
          roleInfo?.data?.user?.toLowerCase() === evmAddress.toLowerCase()
        ) {
          localStorage.setItem(getAddrKey(activeTestnet), agentAddress);
          cleanupLegacyStorage(activeTestnet);
          return {
            agentAddress,
            wallet: new HyperliquidIsolatedSigner(agentAddress),
          };
        }
      } catch {
        void 0;
      }

      try {
        const agents: any = await transport.request('info', {
          type: 'extraAgents',
          user: evmAddress as `0x${string}`,
        });
        if (Array.isArray(agents)) {
          const match = agents.find(
            (a: any) => a.address?.toLowerCase() === agentAddress.toLowerCase()
          );
          if (match) {
            localStorage.setItem(getAddrKey(activeTestnet), agentAddress);
            cleanupLegacyStorage(activeTestnet);
            return {
              agentAddress,
              wallet: new HyperliquidIsolatedSigner(agentAddress),
            };
          }
        }
      } catch {
        void 0;
      }

      await signerIframeBridge.revokeKey().catch(() => {});
      throw new Error(
        'Agent slot was already used on Hyperliquid. Key vault has been refreshed. Please click again to activate with a fresh key.'
      );
    }

    if (msg.includes('Must deposit')) {
      throw new Error('Must deposit funds into Hyperliquid before approving a trading agent.');
    }

    if (error?.code === 4001 || msg.includes('rejected') || msg.includes('denied')) {
      throw new Error(
        'Signature was rejected in your wallet. Please approve the signature to activate trading.'
      );
    }

    throw new Error(
      msg || 'Failed to approve Hyperliquid agent key. Please check your wallet signature.'
    );
  }

  console.log('[hyperliquid] Agent key successfully approved.');
  console.groupEnd();

  // Store ONLY public agent address
  localStorage.setItem(getAddrKey(activeTestnet), agentAddress);

  // Purge any legacy unisolated keys
  cleanupLegacyStorage(activeTestnet);

  return {
    agentAddress,
    wallet: new HyperliquidIsolatedSigner(agentAddress),
  };
}

const HL_AES_KEY_ID = '_k_hl';

export async function encryptAndStoreAgentKey(
  agentAddressOrKey: string,
  isTestnet?: boolean
): Promise<string> {
  const activeTestnet =
    isTestnet !== undefined ? isTestnet : useWalletStore.getState().network === 'testnet';
  localStorage.setItem(getAddrKey(activeTestnet), agentAddressOrKey);
  cleanupLegacyStorage(activeTestnet);
  return agentAddressOrKey;
}

export async function restoreAgentWallet(
  isTestnet?: boolean
): Promise<HyperliquidIsolatedSigner | Wallet | null> {
  const activeTestnet =
    isTestnet !== undefined ? isTestnet : useWalletStore.getState().network === 'testnet';

  const isReady = await signerIframeBridge.initialize();
  if (!isReady) return null;

  const bridgeAddr = await signerIframeBridge.getAddress().catch(() => null);
  if (!bridgeAddr) return null;

  const storedAddr = getStoredAgentAddress(activeTestnet);
  if (storedAddr && storedAddr.toLowerCase() === bridgeAddr.toLowerCase()) {
    cleanupLegacyStorage(activeTestnet);
    return new HyperliquidIsolatedSigner(bridgeAddr);
  }

  const transport = new HttpTransport({ isTestnet: activeTestnet });
  const evmAddress = useWalletStore.getState().connectedWallets.evm?.address;
  if (evmAddress) {
    try {
      const roleInfo: any = await transport.request('info', {
        type: 'userRole',
        user: bridgeAddr as `0x${string}`,
      });
      if (
        roleInfo?.role === 'agent' &&
        roleInfo?.data?.user?.toLowerCase() === evmAddress.toLowerCase()
      ) {
        localStorage.setItem(getAddrKey(activeTestnet), bridgeAddr);
        cleanupLegacyStorage(activeTestnet);
        return new HyperliquidIsolatedSigner(bridgeAddr);
      }
    } catch {
      void 0;
    }

    try {
      const agents: any = await transport.request('info', {
        type: 'extraAgents',
        user: evmAddress as `0x${string}`,
      });
      if (Array.isArray(agents)) {
        const match = agents.find(
          (a: any) => a.address?.toLowerCase() === bridgeAddr.toLowerCase()
        );
        if (match) {
          localStorage.setItem(getAddrKey(activeTestnet), bridgeAddr);
          cleanupLegacyStorage(activeTestnet);
          return new HyperliquidIsolatedSigner(bridgeAddr);
        }
        localStorage.removeItem(getAddrKey(activeTestnet));
      }
    } catch {
      void 0;
    }
  }

  return null;
}

export function getStoredAgentAddress(isTestnet?: boolean): string | null {
  const activeTestnet =
    isTestnet !== undefined ? isTestnet : useWalletStore.getState().network === 'testnet';
  return (
    localStorage.getItem(getAddrKey(activeTestnet)) ||
    (!activeTestnet ? localStorage.getItem(ADDR_KEY_PREFIX) : null)
  );
}

export function hasStoredAgentKey(isTestnet?: boolean): boolean {
  const activeTestnet =
    isTestnet !== undefined ? isTestnet : useWalletStore.getState().network === 'testnet';
  return !!(
    localStorage.getItem(getAddrKey(activeTestnet)) ||
    (!activeTestnet && localStorage.getItem(ADDR_KEY_PREFIX)) ||
    localStorage.getItem(getBlobKey(activeTestnet)) ||
    (!activeTestnet && localStorage.getItem(BLOB_KEY_PREFIX)) ||
    signerIframeBridge.cachedAgentAddress
  );
}

export function purgeAgentKey(isTestnet?: boolean): void {
  if (isTestnet !== undefined) {
    localStorage.removeItem(getBlobKey(isTestnet));
    localStorage.removeItem(getAddrKey(isTestnet));
  } else {
    localStorage.removeItem(getBlobKey(false));
    localStorage.removeItem(getAddrKey(false));
    localStorage.removeItem(getBlobKey(true));
    localStorage.removeItem(getAddrKey(true));
    localStorage.removeItem(BLOB_KEY_PREFIX);
    localStorage.removeItem(ADDR_KEY_PREFIX);
  }
  destroyAESKey(HL_AES_KEY_ID).catch(() => {});
  signerIframeBridge.revokeKey().catch(() => {});
}

export async function purgeAgentKeyAndAes(isTestnet?: boolean): Promise<void> {
  purgeAgentKey(isTestnet);
  await destroyAESKey(HL_AES_KEY_ID);
}
