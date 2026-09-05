import { HttpTransport } from '@nktkas/hyperliquid';
import { approveAgent } from '@nktkas/hyperliquid/api/exchange';
import { BrowserProvider, Wallet } from 'ethers';

import { useWalletStore } from '../store/walletConnectStore';
import { destroyAESKey, generateAndStoreAESKey, retrieveAESKey } from './keyVaultIndexedDB';

const BLOB_KEY_PREFIX = '_sx_hl_agentkey';
const ADDR_KEY_PREFIX = '_sx_hl_agentaddr';
const AGENT_NAME = 'SwiftExDesktop';

function getBlobKey(isTestnet: boolean = false) {
  return `${BLOB_KEY_PREFIX}_${isTestnet ? 'testnet' : 'mainnet'}`;
}

function getAddrKey(isTestnet: boolean = false) {
  return `${ADDR_KEY_PREFIX}_${isTestnet ? 'testnet' : 'mainnet'}`;
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

export interface HyperliquidAgentKey {
  agentAddress: string;
  wallet: Wallet;
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

  const agentWallet = new Wallet(Wallet.createRandom().privateKey);

  console.groupCollapsed('[hyperliquid] deriveHyperliquidAgentKey');
  console.log('evmAddress (signer):', evmAddress);
  console.log('agentWallet.address:', agentWallet.address);
  console.log('isTestnet:', activeTestnet);

  const transport = new HttpTransport({ isTestnet: activeTestnet });

  try {
    await approveAgent(
      { transport, wallet: signer },
      { agentAddress: agentWallet.address as `0x${string}`, agentName: AGENT_NAME }
    );
  } catch (error: any) {
    console.error('[hyperliquid] approveAgent failed:', error);
    const msg = error?.message || '';
    if (msg.includes('Must deposit')) {
      throw new Error('Must deposit funds into Hyperliquid before approving a trading agent.');
    }
    throw new Error(
      msg || 'Failed to approve Hyperliquid agent key. Please check your wallet signature.'
    );
  }

  console.log('[hyperliquid] Agent key successfully approved.');
  console.groupEnd();

  return {
    agentAddress: agentWallet.address,
    wallet: agentWallet,
  };
}

export async function encryptAndStoreAgentKey(
  privKeyHex: string,
  isTestnet?: boolean
): Promise<string> {
  const activeTestnet =
    isTestnet !== undefined ? isTestnet : useWalletStore.getState().network === 'testnet';
  let aesKey = await retrieveAESKey();
  if (!aesKey) aesKey = await generateAndStoreAESKey();

  const agentWallet = new Wallet(privKeyHex);
  const encoder = new TextEncoder();
  const keyBytes = encoder.encode(privKeyHex);

  const blob = await encryptBytes(keyBytes, aesKey);
  keyBytes.fill(0);

  localStorage.setItem(getBlobKey(activeTestnet), JSON.stringify(blob));
  localStorage.setItem(getAddrKey(activeTestnet), agentWallet.address);

  return agentWallet.address;
}

export async function restoreAgentWallet(isTestnet?: boolean): Promise<Wallet | null> {
  const activeTestnet =
    isTestnet !== undefined ? isTestnet : useWalletStore.getState().network === 'testnet';
  const raw =
    localStorage.getItem(getBlobKey(activeTestnet)) ||
    (!activeTestnet ? localStorage.getItem(BLOB_KEY_PREFIX) : null);
  if (!raw) return null;

  const aesKey = await retrieveAESKey();
  if (!aesKey) {
    purgeAgentKey(activeTestnet);
    return null;
  }

  let parsed: { ciphertext: string; iv: string };
  try {
    parsed = JSON.parse(raw);
  } catch {
    purgeAgentKey(activeTestnet);
    return null;
  }

  let keyBytes: Uint8Array | null = null;
  try {
    keyBytes = await decryptBytes(parsed.ciphertext, parsed.iv, aesKey);
    const privKeyHex = new TextDecoder().decode(keyBytes);
    keyBytes.fill(0);
    return new Wallet(privKeyHex);
  } catch {
    if (keyBytes) keyBytes.fill(0);
    purgeAgentKey(activeTestnet);
    return null;
  }
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
    localStorage.getItem(getBlobKey(activeTestnet)) ||
    (!activeTestnet && localStorage.getItem(BLOB_KEY_PREFIX))
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
}

export async function purgeAgentKeyAndAes(isTestnet?: boolean): Promise<void> {
  purgeAgentKey(isTestnet);
  await destroyAESKey();
}
