import { sendCustomNotification } from '@/service/notificationService';
import { Wallet, getAddress, verifyTypedData } from 'ethers';

import { useWalletStore } from '../store/walletConnectStore';
import { destroyAESKey, generateAndStoreAESKey, retrieveAESKey } from './keyVaultIndexedDB';

const BLOB_KEY_PREFIX = '_sx_aster_agentkey';
const ADDR_KEY_PREFIX = '_sx_aster_agentaddr';
const AGENT_NAME = '@swiftex-desktop';

function getBlobKey(network: string = 'mainnet') {
  return `${BLOB_KEY_PREFIX}_${network}`;
}

function getAddrKey(network: string = 'mainnet') {
  return `${ADDR_KEY_PREFIX}_${network}`;
}

function getAsterAgentDomain(chainId: number) {
  return {
    name: 'AsterSignTransaction',
    version: '1',
    chainId: chainId,
    verifyingContract: '0x0000000000000000000000000000000000000000',
  };
}

const APPROVE_AGENT_TYPES = {
  ApproveAgent: [
    { name: 'AgentName', type: 'string' },
    { name: 'AgentAddress', type: 'string' },
    { name: 'Expired', type: 'uint256' },
    { name: 'CanSpotTrade', type: 'bool' },
    { name: 'CanPerpTrade', type: 'bool' },
    { name: 'CanWithdraw', type: 'bool' },
    { name: 'AsterChain', type: 'string' },
    { name: 'User', type: 'string' },
    { name: 'Nonce', type: 'uint256' },
  ],
};

function buildApproveAgentData(
  evmAddress: string,
  agentAddress: string,
  nonce: number,
  expired: number,
  chainId: number,
  asterChain: string = 'Mainnet'
) {
  return {
    domain: getAsterAgentDomain(chainId),
    primaryType: 'ApproveAgent' as const,
    types: {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' },
        { name: 'verifyingContract', type: 'address' },
      ],
      ...APPROVE_AGENT_TYPES,
    },
    message: {
      AgentName: AGENT_NAME,
      AgentAddress: agentAddress,
      Expired: expired,
      CanSpotTrade: true,
      CanPerpTrade: true,
      CanWithdraw: false,
      AsterChain: asterChain,
      User: getAddress(evmAddress),
      Nonce: nonce,
    },
  };
}

export interface AsterAgentKey {
  agentAddress: string;
  wallet: Wallet;
}

function toBase64(buf: Uint8Array): string {
  let b = '';
  for (let i = 0; i < buf.length; i++) b += String.fromCharCode(buf[i]);
  return btoa(b);
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function encryptBytes(
  plain: Uint8Array,
  aesKey: CryptoKey
): Promise<{ ciphertext: string; iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    plain as unknown as BufferSource
  );
  return { ciphertext: toBase64(new Uint8Array(encrypted)), iv: toBase64(iv) };
}

async function decryptBytes(
  ciphertext: string,
  iv: string,
  aesKey: CryptoKey
): Promise<Uint8Array> {
  const cipherBuf = fromBase64(ciphertext);
  const ivBuf = fromBase64(iv);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: ivBuf as unknown as BufferSource },
    aesKey,
    cipherBuf as unknown as BufferSource
  );
  const result = new Uint8Array(decrypted);
  cipherBuf.fill(0);
  ivBuf.fill(0);
  return result;
}

function assertWellFormedSignature(signature: string) {
  if (!/^0x[0-9a-fA-F]{130}$/.test(signature)) {
    throw new Error(
      `Malformed signature returned by wallet provider: expected 0x + 130 hex chars (65 bytes), got "${signature}" (length ${signature.length}). This points to a bug in the wallet's eth_signTypedData_v4 implementation, not in the payload.`
    );
  }
}

export async function submitApproveAgent(params: {
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
  network?: 'mainnet' | 'testnet';
}) {
  const isTestnet =
    params.network === 'testnet' ||
    params.signatureChainId === 97 ||
    params.signatureChainId === 421614 ||
    params.signatureChainId === 11155111;
  const asterChain = params.asterChain || (isTestnet ? 'Testnet' : 'Mainnet');

  const rawParams = [
    `agentName=${params.agentName}`,
    `agentAddress=${getAddress(params.agentAddress)}`,
    `expired=${params.expired}`,
    `canSpotTrade=${params.canSpotTrade.toString()}`,
    `canPerpTrade=${params.canPerpTrade.toString()}`,
    `canWithdraw=${params.canWithdraw.toString()}`,
    `asterChain=${asterChain}`,
    `user=${getAddress(params.user)}`,
    `nonce=${params.nonce}`,
    `signature=${params.signature}`,
    `signatureChainId=${params.signatureChainId}`,
  ];

  const queryString = rawParams.join('&');
  const baseUrl = isTestnet ? 'https://fapi.asterdex-testnet.com' : 'https://fapi.asterdex.com';
  const url = `${baseUrl}/fapi/v3/approveAgent?${queryString}`;

  console.groupCollapsed('[aster] submitApproveAgent → request');
  console.log('url:', url);
  console.log('network:', params.network, 'isTestnet:', isTestnet, 'asterChain:', asterChain);
  console.groupEnd();

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
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw new Error(
        'Connection timed out while contacting Aster API. Please check your internet connection.'
      );
    }
    console.warn(`Fetch to ${url} failed`, error);
    throw new Error(error?.message || 'Network error connecting to Aster API');
  } finally {
    clearTimeout(timeoutId);
  }

  const data = await res.json().catch(() => null);

  console.groupCollapsed('[aster] submitApproveAgent → response');
  console.log('status:', res.status, res.statusText);
  console.log('data:', data);
  console.groupEnd();

  if (!res.ok || !data || (data.code && data.code !== 200 && data.code !== 0) || data.error) {
    const errMsg =
      data?.error || data?.msg || data?.message || (data ? JSON.stringify(data) : res.statusText);
    throw new Error(`Aster API approval failed: ${errMsg} (code: ${data?.code || res.status})`);
  }
}

async function signTypedData(
  provider: any,
  evmAddress: string,
  typedData: object
): Promise<string> {
  const isWalletConnect = !!provider?.session;

  // Resolve the exact account address casing the wallet expects
  let signerAddress = evmAddress;
  try {
    const accounts = await provider.request({ method: 'eth_accounts' });
    if (Array.isArray(accounts) && accounts.length > 0) {
      const match = accounts.find(
        (a: string) => typeof a === 'string' && a.toLowerCase() === evmAddress.toLowerCase()
      );
      if (match) signerAddress = match;
    }
  } catch {
    // Fall back to provided evmAddress
  }

  // Send push notification so user knows to open their wallet
  try {
    const token = localStorage.getItem('device_token');
    if (token) {
      sendCustomNotification(token, {
        title: 'Signature Request',
        body: 'Please open your wallet to sign the Aster onboarding message.',
      }).catch(err => console.error(err));
    }
  } catch {
    // ignore
  }

  // For WalletConnect sessions, check which signing methods the wallet actually approved.
  // Trust Wallet and many mobile wallets only approve a subset of methods, and calling an
  // unapproved method results in -32601 from the relay — even if it's listed in our requested
  // namespaces. Checking up-front lets us skip directly to personal_sign for those wallets.
  const getApprovedMethods = (): string[] => {
    if (!isWalletConnect) return [];
    try {
      const namespaces = provider.session?.namespaces ?? provider.session?.peer?.namespaces ?? {};
      const eip155 = namespaces?.eip155 ?? {};
      return Array.isArray(eip155.methods) ? eip155.methods : [];
    } catch {
      return [];
    }
  };

  const approvedMethods = getApprovedMethods();
  const isWCMethodAllowed = (method: string) =>
    !isWalletConnect || approvedMethods.length === 0 || approvedMethods.includes(method);

  const isUnknownMethodError = (e: any) =>
    e?.code === 4200 ||
    e?.code === -32601 ||
    /unknown method|not supported|does not exist|is not available/i.test(e?.message ?? '');

  const stringPayload = JSON.stringify(typedData);
  // WalletConnect UniversalProvider expects an object; injected providers expect a JSON string
  const payload = isWalletConnect ? typedData : stringPayload;

  // --- Attempt 1: eth_signTypedData_v4 ---
  if (isWCMethodAllowed('eth_signTypedData_v4')) {
    try {
      return await provider.request({
        method: 'eth_signTypedData_v4',
        params: [signerAddress, payload],
      });
    } catch (err: any) {
      if (err?.message === 'USER_REJECTED') throw new Error('Signature rejected by user');
      if (!isUnknownMethodError(err)) throw err;
      console.warn('[aster] eth_signTypedData_v4 not supported, trying eth_signTypedData');
    }
  }

  // --- Attempt 2: eth_signTypedData ---
  if (isWCMethodAllowed('eth_signTypedData')) {
    try {
      return await provider.request({
        method: 'eth_signTypedData',
        params: [signerAddress, payload],
      });
    } catch (err: any) {
      if (err?.message === 'USER_REJECTED') throw new Error('Signature rejected by user');
      if (!isUnknownMethodError(err)) throw err;
      console.warn('[aster] eth_signTypedData not supported, trying personal_sign');
    }
  }

  // --- Attempt 3: personal_sign (hash the EIP-712 payload ourselves) ---
  if (isWCMethodAllowed('personal_sign')) {
    const { TypedDataEncoder } = await import('ethers');
    const { domain, types, message } = typedData as any;
    const cleanTypes = { ...types };
    delete cleanTypes['EIP712Domain'];
    const hash = TypedDataEncoder.hash(domain, cleanTypes, message);
    try {
      return await provider.request({
        method: 'personal_sign',
        params: [hash, signerAddress],
      });
    } catch (err: any) {
      if (err?.message === 'USER_REJECTED') throw new Error('Signature rejected by user');
      if (!isUnknownMethodError(err)) throw err;
      console.warn('[aster] personal_sign not supported');
    }
  }

  throw new Error(
    'Your wallet does not support any EIP-712 signing method (eth_signTypedData_v4, eth_signTypedData, personal_sign). ' +
      'Please use a wallet that supports at least one of these methods.'
  );
}

export async function deriveAsterAgentKey(
  evmAddress: string,
  provider: any,
  network?: 'mainnet' | 'testnet'
): Promise<{
  agentAddress: string;
  wallet: Wallet;
  signature: string;
  nonce: string;
  expired: string;
}> {
  const currentNetwork = network || useWalletStore.getState().network || 'mainnet';
  const isTestnet = currentNetwork === 'testnet';
  const asterChain = isTestnet ? 'Testnet' : 'Mainnet';

  let chainId = isTestnet ? 97 : 56;

  try {
    const rawChainId = await provider.request({ method: 'eth_chainId' });
    if (typeof rawChainId === 'number') {
      chainId = rawChainId;
    } else if (typeof rawChainId === 'string') {
      chainId = rawChainId.startsWith('0x') ? parseInt(rawChainId, 16) : parseInt(rawChainId, 10);
    }
    console.log(`[aster] Dynamically fetched active chainId from wallet: ${chainId}`);
  } catch (err) {
    console.warn(`[aster] Failed to fetch active eth_chainId, falling back to ${chainId}`, err);
  }

  const agentWallet = new Wallet(Wallet.createRandom().privateKey);

  const nonce = Date.now() * 1000;
  const expired = Date.now() + 30 * 24 * 60 * 60 * 1000;

  const typedData = buildApproveAgentData(
    evmAddress,
    agentWallet.address,
    nonce,
    expired,
    chainId,
    asterChain
  );

  console.groupCollapsed('[aster] deriveAsterAgentKey → signing payload');
  console.log('evmAddress (signer):', evmAddress);
  console.log('agentWallet.address:', agentWallet.address);
  console.log('network:', currentNetwork, 'asterChain:', asterChain, 'chainId:', chainId);
  console.log('domain:', typedData.domain);
  console.log('primaryType:', typedData.primaryType);
  console.log('types.ApproveAgent:', typedData.types.ApproveAgent);
  console.log('message:', typedData.message);
  console.log('raw JSON sent to eth_signTypedData_v4:', JSON.stringify(typedData));
  console.groupEnd();

  const signature = await signTypedData(provider, evmAddress, typedData);

  console.log('[aster] signature returned by wallet:', signature, `(length ${signature.length})`);

  assertWellFormedSignature(signature);

  const recovered = verifyTypedData(
    typedData.domain,
    APPROVE_AGENT_TYPES,
    typedData.message,
    signature
  );

  console.log('[aster] locally recovered signer:', recovered, '— expected:', evmAddress);

  if (getAddress(recovered) !== getAddress(evmAddress)) {
    throw new Error(
      `Local signature verification failed: expected signer ${evmAddress}, recovered ${recovered}. ` +
        `The signature does not match (domain, types, message) — check that the wallet actually signed exactly this payload.`
    );
  }

  await submitApproveAgent({
    user: evmAddress,
    nonce: nonce.toString(),
    signature,
    agentName: AGENT_NAME,
    agentAddress: agentWallet.address,
    expired: expired.toString(),
    signatureChainId: chainId,
    canSpotTrade: true,
    canPerpTrade: true,
    canWithdraw: false,
    asterChain,
    network: currentNetwork,
  });

  return {
    agentAddress: agentWallet.address,
    wallet: agentWallet,
    signature,
    nonce: nonce.toString(),
    expired: expired.toString(),
  };
}

const ASTER_AES_KEY_ID = '_k_aster';

export async function encryptAndStoreAgentKey(
  privKeyHex: string,
  network?: string
): Promise<string> {
  const net = network || useWalletStore.getState().network || 'mainnet';
  let aesKey = await retrieveAESKey(ASTER_AES_KEY_ID);
  if (!aesKey) aesKey = await generateAndStoreAESKey(ASTER_AES_KEY_ID);

  const agentWallet = new Wallet(privKeyHex);
  const encoder = new TextEncoder();
  const keyBytes = encoder.encode(privKeyHex);

  const blob = await encryptBytes(keyBytes, aesKey);
  keyBytes.fill(0);

  localStorage.setItem(getBlobKey(net), JSON.stringify(blob));
  localStorage.setItem(getAddrKey(net), agentWallet.address);

  return agentWallet.address;
}

export async function restoreAgentWallet(network?: string): Promise<Wallet | null> {
  const net = network || useWalletStore.getState().network || 'mainnet';
  const raw =
    localStorage.getItem(getBlobKey(net)) ||
    (net === 'mainnet' ? localStorage.getItem(BLOB_KEY_PREFIX) : null);
  if (!raw) return null;

  const aesKey = await retrieveAESKey(ASTER_AES_KEY_ID);
  if (!aesKey) {
    return null;
  }

  let parsed: { ciphertext: string; iv: string };
  try {
    parsed = JSON.parse(raw);
  } catch {
    purgeAgentKey(net);
    return null;
  }

  let keyBytes: Uint8Array | null = null;
  try {
    keyBytes = await decryptBytes(parsed.ciphertext, parsed.iv, aesKey);
    const privKeyHex = new TextDecoder().decode(keyBytes);
    keyBytes.fill(0);
    return new Wallet(privKeyHex);
  } catch (err) {
    console.warn('[AsterAgentKeyManager] Decryption attempt failed:', err);
    if (keyBytes) keyBytes.fill(0);
    return null;
  }
}

export function getStoredAgentAddress(network?: string): string | null {
  const net = network || useWalletStore.getState().network || 'mainnet';
  return (
    localStorage.getItem(getAddrKey(net)) ||
    (net === 'mainnet' ? localStorage.getItem(ADDR_KEY_PREFIX) : null)
  );
}

export function hasStoredAgentKey(network?: string): boolean {
  const net = network || useWalletStore.getState().network || 'mainnet';
  return !!(
    localStorage.getItem(getBlobKey(net)) ||
    (net === 'mainnet' && localStorage.getItem(BLOB_KEY_PREFIX))
  );
}

export function purgeAgentKey(network?: string): void {
  if (network) {
    localStorage.removeItem(getBlobKey(network));
    localStorage.removeItem(getAddrKey(network));
  } else {
    localStorage.removeItem(getBlobKey('mainnet'));
    localStorage.removeItem(getAddrKey('mainnet'));
    localStorage.removeItem(getBlobKey('testnet'));
    localStorage.removeItem(getAddrKey('testnet'));
    localStorage.removeItem(BLOB_KEY_PREFIX);
    localStorage.removeItem(ADDR_KEY_PREFIX);
  }
}

export async function purgeAgentKeyAndAes(network?: string): Promise<void> {
  purgeAgentKey(network);
  await destroyAESKey();
}
