import { WalletConnectModal } from '@walletconnect/modal';

import { type NetworkType } from '../../config/chains';

export type WalletType = 'evm' | 'stellar';

export type ConnectionState =
  'idle' | 'connecting' | 'connected' | 'signing' | 'deriving' | 'failed' | 'disconnected';

export interface WalletSession {
  type: WalletType;
  walletId: string;
  evmAddress?: string;
  evmChainId?: number;
  stellarAddress?: string;
  stellarChainId?: string;
  connectionMode?: 'unified' | 'separate';
  peerName?: string;
  peerIcon?: string;
  peerRedirect?: {
    native?: string;
    universal?: string;
    linkMode?: boolean;
  };
}

export interface UnifiedConnectionResult {
  evm?: WalletSession;
  stellar?: WalletSession;
}

export interface EIP6963ProviderInfo {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
}

export interface EIP6963ProviderDetail {
  info: EIP6963ProviderInfo;
  provider: any;
}

export interface DiscoveredExtension {
  id: string;
  name: string;
  icon: string;
  type: WalletType;
  rdns?: string;
  isInstalled: boolean;
  provider?: any;
}

export interface WalletServiceContext {
  sessions: Map<WalletType, WalletSession>;

  providers: Map<string, any>;
  modals: Map<string, WalletConnectModal>;
  eip6963Providers: Map<string, EIP6963ProviderDetail>;
  discoveredExtensions: Map<string, DiscoveredExtension>;
  registeredProviders: Set<any>;
  lastPingAt: Map<WalletType, number>;
  disconnecting: Set<WalletType>;
  isSignRequestInFlight: Map<WalletType, boolean>;
  derivationInProgress: boolean;
  currentNetwork: NetworkType;
  emitState: (type: WalletType, state: ConnectionState) => void;
  saveSession: () => void;
  openMobileDeepLink: (walletId: string, uri: string) => void;
  handleDisconnect: (type: WalletType) => void;
  cancelActiveConnection?: (reason?: string) => void;
}
