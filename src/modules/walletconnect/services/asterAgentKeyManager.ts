import { sendCustomNotification } from '@/service/notificationService';
import { getAddress, verifyTypedData } from 'ethers';

import { useNotificationStore } from '../../../store/notificationStore';
import { generateMonotonicNonce, getSyncedServerTime } from '../../perps/adapters/aster/api/auth';
import type { IAsterSigner } from '../../perps/adapters/aster/types/signer';
import { useWalletStore } from '../store/walletConnectStore';
import { destroyAESKey } from './keyVaultIndexedDB';
import { signerIframeBridge } from './signerIframeBridge';

// ============================================================================
// Constants & Types
// ============================================================================

const BLOB_KEY_PREFIX = '_sx_aster_agentkey';
const ADDR_KEY_PREFIX = '_sx_aster_agentaddr';
const EXPIRY_KEY_PREFIX = '_sx_aster_agentexp';
const ASTER_AES_KEY_ID = '_k_aster';
const AGENT_NAME = 'swiftex-desktop';
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

export const AGENT_VALIDITY_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const TESTNET_CHAIN_IDS = new Set([97, 421614, 11155111]);

export type NetworkType = 'mainnet' | 'testnet';

export interface AsterAgentKey {
  agentAddress: string;
}

interface AgentPermissions {
  canSpotTrade?: boolean;
  canPerpTrade?: boolean;
  canWithdraw?: boolean;
}

export interface SubmitApproveAgentParams {
  user: string;
  nonce: string;
  signature: string;
  agentName: string;
  agentAddress: string;
  expired: string;
  signatureChainId: number;
  canSpotTrade: boolean;
  canPerpTrade: boolean;
  canWithdraw: boolean;
  asterChain?: string;
  network?: NetworkType;
}

interface EIP1193Provider {
  request: (args: { method: string; params?: unknown[] }) => Promise<any>;
  session?: {
    namespaces?: { eip155?: { methods?: string[] } };
    peer?: { namespaces?: { eip155?: { methods?: string[] } } };
  };
}

// ============================================================================
// Internal Helpers (Storage, Network & Chain Resolution)
// ============================================================================

function getBlobKey(network: string = 'mainnet'): string {
  return `${BLOB_KEY_PREFIX}_${network}`;
}

function getAddrKey(network: string = 'mainnet'): string {
  return `${ADDR_KEY_PREFIX}_${network}`;
}

function getExpKey(network: string = 'mainnet'): string {
  return `${EXPIRY_KEY_PREFIX}_${network}`;
}

function resolveNetwork(network?: string): string {
  return network || useWalletStore.getState().network || 'mainnet';
}

function getStorageWithMainnetFallback(
  network: string,
  keyGetter: (net: string) => string,
  legacyPrefix: string
): string | null {
  return (
    localStorage.getItem(keyGetter(network)) ||
    (network === 'mainnet' ? localStorage.getItem(legacyPrefix) : null)
  );
}

function cleanupLegacyStorage(network: string): void {
  localStorage.removeItem(getBlobKey(network));
  localStorage.removeItem(BLOB_KEY_PREFIX);
  destroyAESKey(ASTER_AES_KEY_ID).catch(() => {});
}

function resolveChainId(isTestnet: boolean): number {
  // Aster DEX EVM signature verification is protocol-fixed to BSC (56 mainnet, 97 testnet)
  return isTestnet ? 97 : 56;
}

// ============================================================================
// EIP-712 Payload Construction & Validation
// ============================================================================

function getAsterAgentDomain(chainId: number) {
  return {
    name: 'AsterSignTransaction',
    version: '1',
    chainId,
    verifyingContract: ZERO_ADDRESS,
  };
}

const DEL_AGENT_TYPES = {
  DelAgent: [
    { name: 'User', type: 'string' },
    { name: 'AgentAddress', type: 'string' },
    { name: 'Nonce', type: 'uint256' },
  ],
};

function buildDelAgentData(
  evmAddress: string,
  agentAddress: string,
  nonce: number,
  chainId: number
) {
  return {
    domain: getAsterAgentDomain(chainId),
    primaryType: 'DelAgent' as const,
    types: {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' },
        { name: 'verifyingContract', type: 'address' },
      ],
      ...DEL_AGENT_TYPES,
    },
    message: {
      User: getAddress(evmAddress),
      AgentAddress: getAddress(agentAddress),
      Nonce: nonce,
    },
  };
}

function buildApproveAgentSortedQuery(params: {
  user: string;
  agentName: string;
  agentAddress: string;
  nonce: string | number;
  expired: string | number;
  signatureChainId: string | number;
  canSpotTrade: boolean;
  canPerpTrade: boolean;
  canWithdraw: boolean;
}): string {
  const p: Record<string, string> = {
    user: getAddress(params.user),
    agentName: params.agentName,
    agentAddress: getAddress(params.agentAddress),
    nonce: String(params.nonce),
    expired: String(params.expired),
    signatureChainId: String(params.signatureChainId),
    canSpotTrade: String(params.canSpotTrade),
    canPerpTrade: String(params.canPerpTrade),
    canWithdraw: String(params.canWithdraw),
  };
  const keys = Object.keys(p).sort();
  return keys.map(k => `${k}=${p[k]}`).join('&');
}

function buildApproveAgentData(
  evmAddress: string,
  agentAddress: string,
  nonce: string | number,
  expired: string | number,
  chainId: number,
  permissions?: AgentPermissions
) {
  const msg = buildApproveAgentSortedQuery({
    user: evmAddress,
    agentName: AGENT_NAME,
    agentAddress,
    nonce,
    expired,
    signatureChainId: chainId,
    canSpotTrade: permissions?.canSpotTrade ?? true,
    canPerpTrade: permissions?.canPerpTrade ?? true,
    canWithdraw: permissions?.canWithdraw ?? false,
  });

  return {
    domain: {
      name: 'AsterSignTransaction',
      version: '1',
      chainId,
      verifyingContract: ZERO_ADDRESS,
    },
    primaryType: 'Message' as const,
    types: {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' },
        { name: 'verifyingContract', type: 'address' },
      ],
      Message: [{ name: 'msg', type: 'string' }],
    },
    message: { msg },
  };
}

type ApproveAgentTypedData = ReturnType<typeof buildApproveAgentData>;

function assertWellFormedSignature(signature: string): void {
  if (!/^0x[0-9a-fA-F]{130}$/.test(signature)) {
    throw new Error(
      `Malformed signature returned by wallet provider: expected 0x + 130 hex chars (65 bytes), got "${signature}" (length ${signature.length}). This points to a bug in the wallet's eth_signTypedData_v4 implementation, not in the payload.`
    );
  }
}

// ============================================================================
// API & Signing Operations
// ============================================================================

export async function submitApproveAgent(params: SubmitApproveAgentParams): Promise<void> {
  const isTestnet = params.network === 'testnet' || TESTNET_CHAIN_IDS.has(params.signatureChainId);
  const baseUrl = isTestnet ? 'https://fapi.asterdex-testnet.com' : 'https://fapi.asterdex.com';

  const sortedQs = buildApproveAgentSortedQuery({
    user: params.user,
    agentName: params.agentName,
    agentAddress: params.agentAddress,
    nonce: params.nonce,
    expired: params.expired,
    signatureChainId: params.signatureChainId,
    canSpotTrade: params.canSpotTrade,
    canPerpTrade: params.canPerpTrade,
    canWithdraw: params.canWithdraw,
  });

  const url = `${baseUrl}/fapi/v3/registerAndApproveAgent?${sortedQs}&signature=${params.signature}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: '',
      signal: controller.signal,
    });
  } catch (error: unknown) {
    const err = error as { name?: string; message?: string };
    if (err?.name === 'AbortError') {
      throw new Error(
        'Connection timed out while contacting Aster API. Please check your internet connection.'
      );
    }
    console.warn(`Fetch to ${url} failed`, error);
    throw new Error(err?.message || 'Network error connecting to Aster API');
  } finally {
    clearTimeout(timeoutId);
  }

  const data = await res.json().catch(() => null);

  if (!res.ok || !data || (data.code && data.code !== 200 && data.code !== 0) || data.error) {
    const errMsg =
      data?.error || data?.msg || data?.message || (data ? JSON.stringify(data) : res.statusText);
    throw new Error(`Aster API approval failed: ${errMsg} (code: ${data?.code || res.status})`);
  }
}

export async function submitDeleteAgent(params: {
  user: string;
  agentAddress: string;
  nonce: string;
  signature: string;
  network?: 'mainnet' | 'testnet';
}) {
  const isTestnet = params.network === 'testnet';
  const baseUrl = isTestnet ? 'https://fapi.asterdex-testnet.com' : 'https://fapi.asterdex.com';
  const timeRes = await fetch(`${baseUrl}/fapi/v1/time`).catch(() => null);
  const timeData = await timeRes?.json().catch(() => null);
  const timestamp = timeData?.serverTime || Date.now();

  const rawParams = [
    `user=${getAddress(params.user)}`,
    `agentAddress=${getAddress(params.agentAddress)}`,
    `nonce=${params.nonce}`,
    `timestamp=${timestamp}`,
    `recvWindow=5000`,
    `signature=${params.signature}`,
  ];

  const queryString = rawParams.join('&');
  const url = `${baseUrl}/fapi/v3/agent?${queryString}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      signal: controller.signal,
    });
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw new Error('Connection timed out while contacting Aster API.');
    }
    throw new Error(error?.message || 'Network error connecting to Aster API');
  } finally {
    clearTimeout(timeoutId);
  }

  const data = await res.json().catch(() => null);

  if (!res.ok || !data || (data.code && data.code !== 200 && data.code !== 0) || data.error) {
    const errMsg =
      data?.error || data?.msg || data?.message || (data ? JSON.stringify(data) : res.statusText);
    throw new Error(
      `Aster API agent deletion failed: ${errMsg} (code: ${data?.code || res.status})`
    );
  }
}

async function resolveWalletSignerAddress(
  provider: EIP1193Provider,
  fallbackAddress: string
): Promise<string> {
  try {
    const accounts = await provider.request({ method: 'eth_accounts' });
    if (Array.isArray(accounts) && accounts.length > 0) {
      const match = accounts.find(
        (a: unknown): a is string =>
          typeof a === 'string' && a.toLowerCase() === fallbackAddress.toLowerCase()
      );
      if (match) return match;
    }
  } catch {
    // Fall back to provided fallbackAddress
  }
  return fallbackAddress;
}

function triggerSigningNotification(): void {
  try {
    const token = localStorage.getItem('device_token');
    if (token) {
      sendCustomNotification(token, {
        title: 'Signature Request',
        body: 'Please open your wallet to sign the Aster onboarding message.',
      }).catch((err: unknown) => console.error(err));
    }
  } catch {
    // ignore
  }
}

function getApprovedWCMethods(provider: EIP1193Provider, isWalletConnect: boolean): string[] {
  if (!isWalletConnect) return [];
  try {
    const namespaces = provider.session?.namespaces ?? provider.session?.peer?.namespaces ?? {};
    const methods = namespaces?.eip155?.methods;
    return Array.isArray(methods) ? methods : [];
  } catch {
    return [];
  }
}

function isUnknownMethodError(error: unknown): boolean {
  const err = error as { code?: number; message?: string };
  return (
    err?.code === 4200 ||
    err?.code === -32601 ||
    /unknown method|not supported|does not exist|is not available/i.test(err?.message ?? '')
  );
}

async function signTypedData(
  provider: EIP1193Provider,
  evmAddress: string,
  typedData: ApproveAgentTypedData | ReturnType<typeof buildDelAgentData>
): Promise<string> {
  const isWalletConnect = !!provider?.session;
  const signerAddress = await resolveWalletSignerAddress(provider, evmAddress);

  triggerSigningNotification();

  const approvedMethods = getApprovedWCMethods(provider, isWalletConnect);
  const isWCMethodAllowed = (method: string) =>
    !isWalletConnect || approvedMethods.length === 0 || approvedMethods.includes(method);

  const payload = isWalletConnect ? typedData : JSON.stringify(typedData);

  const signingStrategies: Array<{
    method: string;
    fallbackLog: string;
    getParams: () => Promise<unknown[]>;
  }> = [
    {
      method: 'eth_signTypedData_v4',
      fallbackLog: '[aster] eth_signTypedData_v4 not supported, trying eth_signTypedData',
      getParams: async () => [signerAddress, payload],
    },
    {
      method: 'eth_signTypedData',
      fallbackLog: '[aster] eth_signTypedData not supported, trying personal_sign',
      getParams: async () => [signerAddress, payload],
    },
    {
      method: 'personal_sign',
      fallbackLog: '[aster] personal_sign not supported',
      getParams: async () => {
        const { TypedDataEncoder } = await import('ethers');
        const { domain, types, message } = typedData;
        const cleanTypes: Record<string, any> = { ...types };
        delete cleanTypes.EIP712Domain;
        const hash = TypedDataEncoder.hash(domain, cleanTypes, message);
        return [hash, signerAddress];
      },
    },
  ];

  for (const { method, fallbackLog, getParams } of signingStrategies) {
    if (!isWCMethodAllowed(method)) continue;

    const params = await getParams();
    try {
      return await provider.request({ method, params });
    } catch (err: unknown) {
      if ((err as { message?: string })?.message === 'USER_REJECTED') {
        throw new Error('Signature rejected by user');
      }
      if (!isUnknownMethodError(err)) throw err;
      console.warn(fallbackLog);
    }
  }

  throw new Error(
    'Your wallet does not support any EIP-712 signing method (eth_signTypedData_v4, eth_signTypedData, personal_sign). ' +
      'Please use a wallet that supports at least one of these methods.'
  );
}

// ============================================================================
// Public Agent Key Lifecycle Functions
// ============================================================================

export function getStoredAgentExpiry(network?: string): number | null {
  const net = resolveNetwork(network);
  const val = getStorageWithMainnetFallback(net, getExpKey, EXPIRY_KEY_PREFIX);
  if (!val) return null;
  const num = parseInt(val, 10);
  return isNaN(num) ? null : num;
}

export function isAgentKeyExpired(network?: string): boolean {
  const exp = getStoredAgentExpiry(network);
  return exp ? Date.now() >= exp : false;
}

export function getStoredAgentAddress(network?: string): string | null {
  const net = resolveNetwork(network);
  return getStorageWithMainnetFallback(net, getAddrKey, ADDR_KEY_PREFIX);
}

export function hasStoredAgentKey(network?: string): boolean {
  const net = resolveNetwork(network);
  if (isAgentKeyExpired(net)) {
    purgeAgentKey(net);
    return false;
  }
  return !!getStoredAgentAddress(net);
}

export async function encryptAndStoreAgentKey(
  agentAddress: string,
  network?: string,
  expiredAt?: number
): Promise<string> {
  const net = resolveNetwork(network);
  localStorage.setItem(getAddrKey(net), agentAddress);
  if (expiredAt) {
    localStorage.setItem(getExpKey(net), expiredAt.toString());
  }
  return agentAddress;
}

export async function deriveAsterAgentKey(
  evmAddress: string,
  provider: EIP1193Provider,
  network?: NetworkType
): Promise<{
  agentAddress: string;
  signature: string;
  nonce: string;
  expired: string;
}> {
  const currentNetwork = resolveNetwork(network) as NetworkType;
  const isTestnet = currentNetwork === 'testnet';
  const asterChain = isTestnet ? 'Testnet' : 'Mainnet';
  const chainId = resolveChainId(isTestnet);

  // Ensure isolated signer iframe is connected
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
      // Ignore notification failure
    }
    throw new Error(
      'Trading Engine Temporarily Unavailable: Our secure signing service is undergoing brief maintenance. Our team is actively working on it. Please try again shortly.'
    );
  }

  // Generate and store key EXCLUSIVELY inside the isolated signer sandbox
  const agentAddress = await signerIframeBridge.getOrCreateAgentKey(evmAddress);

  const baseUrl = isTestnet ? 'https://fapi.asterdex-testnet.com' : 'https://fapi.asterdex.com';
  const serverTime = await getSyncedServerTime(baseUrl);
  const nonce = generateMonotonicNonce(serverTime);
  const expired = serverTime + AGENT_VALIDITY_MS;

  const typedData = buildApproveAgentData(evmAddress, agentAddress, nonce, expired, chainId, {
    canSpotTrade: true,
    canPerpTrade: true,
    canWithdraw: false,
  });

  const signature = await signTypedData(provider, evmAddress, typedData);

  assertWellFormedSignature(signature);

  const recovered = verifyTypedData(
    typedData.domain,
    { Message: [{ name: 'msg', type: 'string' }] },
    typedData.message,
    signature
  );

  if (getAddress(recovered) !== getAddress(evmAddress)) {
    throw new Error(
      `Local signature verification failed: expected signer ${evmAddress}, recovered ${recovered}.`
    );
  }

  await submitApproveAgent({
    user: evmAddress,
    nonce,
    signature,
    agentName: AGENT_NAME,
    agentAddress,
    expired: expired.toString(),
    signatureChainId: chainId,
    canSpotTrade: true,
    canPerpTrade: true,
    canWithdraw: false,
    asterChain,
    network: currentNetwork,
  });

  // Store ONLY public agent address and expiry in localStorage
  localStorage.setItem(getAddrKey(currentNetwork), agentAddress);
  localStorage.setItem(getExpKey(currentNetwork), expired.toString());

  cleanupLegacyStorage(currentNetwork);

  return {
    agentAddress,
    signature,
    nonce,
    expired: expired.toString(),
  };
}

export async function restoreAgentWallet(network?: string): Promise<IAsterSigner | null> {
  const net = resolveNetwork(network);

  if (isAgentKeyExpired(net)) {
    console.warn(`[AsterAgentKeyManager] Agent key expired for network ${net}. Purging key.`);
    purgeAgentKey(net);
    return null;
  }

  cleanupLegacyStorage(net);

  const storedAddr = getStoredAgentAddress(net);
  if (!storedAddr) return null;

  const isReady = await signerIframeBridge.initialize();
  if (!isReady) return null;

  const bridgeAddr = await signerIframeBridge.getAddress().catch(() => null);
  if (!bridgeAddr) return null;

  return signerIframeBridge;
}

export function purgeAgentKey(network?: string): void {
  const clearKeysForNet = (net: string) => {
    localStorage.removeItem(getBlobKey(net));
    localStorage.removeItem(getAddrKey(net));
    localStorage.removeItem(getExpKey(net));
  };

  if (network) {
    clearKeysForNet(network);
  } else {
    clearKeysForNet('mainnet');
    clearKeysForNet('testnet');
    localStorage.removeItem(BLOB_KEY_PREFIX);
    localStorage.removeItem(ADDR_KEY_PREFIX);
    localStorage.removeItem(EXPIRY_KEY_PREFIX);
  }

  destroyAESKey(ASTER_AES_KEY_ID).catch(() => {});
  signerIframeBridge.revokeKey().catch(() => {});
}

export async function purgeAgentKeyAndAes(network?: string): Promise<void> {
  purgeAgentKey(network);
  await destroyAESKey(ASTER_AES_KEY_ID);
}

export async function revokeAsterAgentKey(
  evmAddress: string,
  provider: EIP1193Provider,
  network?: NetworkType
): Promise<void> {
  const currentNetwork = resolveNetwork(network) as NetworkType;
  const isTestnet = currentNetwork === 'testnet';
  const chainId = resolveChainId(isTestnet);

  const agentAddress = getStoredAgentAddress(currentNetwork);
  if (!agentAddress || agentAddress === ZERO_ADDRESS) {
    await purgeAgentKeyAndAes(currentNetwork);
    return;
  }

  const baseUrl = isTestnet ? 'https://fapi.asterdex-testnet.com' : 'https://fapi.asterdex.com';
  const serverTime = await getSyncedServerTime(baseUrl);
  const nonce = generateMonotonicNonce(serverTime);
  const typedData = buildDelAgentData(evmAddress, agentAddress, Number(nonce), chainId);

  let userApprovedSignature = false;
  try {
    const signature = await signTypedData(provider, evmAddress, typedData);
    assertWellFormedSignature(signature);
    userApprovedSignature = true;

    try {
      await submitDeleteAgent({
        user: evmAddress,
        agentAddress,
        nonce: nonce.toString(),
        signature,
        network: currentNetwork,
      });
    } catch (err: any) {
      const msg = err?.message || '';
      if (/no agent found|no aster user found|does not exist|not found/i.test(msg)) {
        console.warn('[aster] Agent already absent on server:', err);
      } else {
        console.warn('[aster] Server agent deletion failed:', err);
        throw err;
      }
    }
  } catch (err) {
    console.warn('[aster] On-chain agent revocation signing cancelled or failed:', err);
    throw err;
  } finally {
    if (userApprovedSignature) {
      await purgeAgentKeyAndAes(currentNetwork);
    }
  }
}

export async function emergencyPurgeLocalAgent(network?: string): Promise<void> {
  await purgeAgentKeyAndAes(network);
}
