import * as StellarSDK from '@stellar/stellar-sdk';

import { getEffectiveAuthToken } from '../../../service/apiService';
import { signAndSubmitTransaction } from '../../stellar/utils/transactionService';
import {
  BASE_RESERVE_FLOOR_STROOPS,
  MAX_RECOVERY_ASSETS,
  SPAREKEY_CONFIG,
  TESTNET_USDC_CODE,
  TESTNET_USDC_ISSUER,
} from '../constants';
import { extractUnsignedXdr, recoveryApi } from './recoveryApi';

export function isValidStellarPublicKey(address: string): boolean {
  if (!address || typeof address !== 'string') return false;
  const clean = address.trim();
  if (clean.length !== 56 || !clean.startsWith('G')) return false;
  try {
    return StellarSDK.StrKey.isValidEd25519PublicKey(clean);
  } catch {
    return /^G[A-Z2-7]{55}$/.test(clean);
  }
}

export function parseContractError(error: unknown): string {
  if (!error) return 'An unknown error occurred.';
  const errObj = error as any;
  const msg = String(
    errObj?.message || errObj?.error || errObj?.data?.message || errObj?.details || ''
  );
  const lowerMsg = (msg || (typeof error === 'string' ? error : '')).toLowerCase();

  if (
    lowerMsg.includes('rejected') ||
    lowerMsg.includes('user declined') ||
    lowerMsg.includes('user_rejected') ||
    lowerMsg.includes('4001')
  ) {
    return 'Transaction signing was cancelled in your wallet.';
  }

  if (lowerMsg.includes('tx_bad_auth')) {
    return 'Transaction failed: Invalid authorization signature for this wallet.';
  }

  if (lowerMsg.includes('op_underfunded') || lowerMsg.includes('insufficient balance')) {
    return 'Insufficient balance to cover transaction fees or reserve minimums.';
  }

  if (msg) return msg;
  try {
    const jsonStr = JSON.stringify(error);
    if (jsonStr !== '{}') return jsonStr;
  } catch {
    // Ignore stringify error
  }
  return String(error || 'Contract transaction failed.');
}

export interface OnChainRegistration {
  isRegistered: boolean;
  owner?: string;
  commitmentHex?: string;
  saltHex?: string;
  registeredAt?: number;
  txHash?: string;
  error?: string;
  statusCode?: number;
  isAuthMissing?: boolean;
  [key: string]: any;
}

export interface ProtectedAssetSpec {
  tokenAddress: string;
  floor: bigint;
  code: string;
  issuer?: string;
  type?: 'native' | 'classic' | 'contract';
  contract?: string;
  balance?: string;
  iconUrl?: string;
  name?: string;
  hasTrustline?: boolean;
}

export function getSorobanContractIdForAsset(
  assetCode: string,
  assetIssuer?: string,
  passphrase = SPAREKEY_CONFIG.networkPassphrase
): string {
  if (!assetCode || assetCode.toUpperCase() === 'XLM' || !assetIssuer) {
    return SPAREKEY_CONFIG.xlmSac;
  }
  try {
    const asset = new StellarSDK.Asset(assetCode, assetIssuer);
    return asset.contractId(passphrase);
  } catch {
    return '';
  }
}

export interface PendingRecoveryInfo {
  isPending: boolean;
  destination?: string;
  unlockAt?: number;
  nullifierHex?: string;
  startedAt?: number;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function checkOnChainRegistration(ownerAddress: string): Promise<OnChainRegistration> {
  if (!isValidStellarPublicKey(ownerAddress)) {
    return { isRegistered: false };
  }

  const cleanOwner = ownerAddress.trim();
  const token = getEffectiveAuthToken();
  if (!token) {
    return { isRegistered: false, owner: cleanOwner, isAuthMissing: true };
  }

  try {
    const status = await recoveryApi.getRecoveryStatus(cleanOwner);
    const hasActiveOrRegistered = Boolean(
      status &&
      (status.isRegistered ||
        status.isActive ||
        (status.status && status.status !== 'NONE' && status.status !== 'NOT_FOUND') ||
        status.attemptId ||
        Boolean(
          status.raw?.isRegistered ||
          status.raw?.registered ||
          status.raw?.email ||
          status.raw?.commitment
        ))
    );

    if (hasActiveOrRegistered) {
      return {
        isRegistered: true,
        owner: cleanOwner,
        email: status.email || status.raw?.email || '',
        commitmentHex: status.raw?.commitment || '',
        registeredAt: Date.now(),
      };
    }

    return { isRegistered: false, owner: cleanOwner };
  } catch (err: any) {
    if (err?.statusCode === 404 || err?.status === 404) {
      return { isRegistered: false, owner: cleanOwner };
    }
    return {
      isRegistered: false,
      owner: cleanOwner,
      error: err?.message || 'Failed to check recovery status from server',
      statusCode: err?.statusCode || err?.status,
    };
  }
}

export async function registerRecoveryEmailOnChain(params: {
  ownerAddress: string;
  email: string;
  walletProvider?: any;
  assets?: ProtectedAssetSpec[];
}): Promise<OnChainRegistration> {
  const { ownerAddress, email, walletProvider, assets } = params;

  if (!ownerAddress) {
    throw new Error('Please connect your Stellar wallet first.');
  }

  if (!walletProvider) {
    throw new Error(
      'No Stellar wallet provider found to sign the transaction. Please ensure Freighter or WalletConnect is connected.'
    );
  }

  const cleanEmail = normalizeEmail(email || '');

  const assetSpecs: ProtectedAssetSpec[] =
    assets && assets.length > 0
      ? [...assets]
      : [{ tokenAddress: SPAREKEY_CONFIG.xlmSac, floor: BASE_RESERVE_FLOOR_STROOPS, code: 'XLM' }];

  if (assetSpecs.length > MAX_RECOVERY_ASSETS) {
    throw new Error(
      `SpareKey smart contract allows a maximum of ${MAX_RECOVERY_ASSETS} protected assets.`
    );
  }

  const hasXlm = assetSpecs.some(
    a => a?.tokenAddress === SPAREKEY_CONFIG.xlmSac || a?.code?.toUpperCase?.() === 'XLM'
  );
  if (!hasXlm && assetSpecs.length < MAX_RECOVERY_ASSETS) {
    assetSpecs.unshift({
      tokenAddress: SPAREKEY_CONFIG.xlmSac,
      floor: BASE_RESERVE_FLOOR_STROOPS,
      code: 'XLM',
    });
  }

  const mappedAssets = assetSpecs.slice(0, MAX_RECOVERY_ASSETS).map(a => {
    const isContract =
      a?.type === 'contract' ||
      (Boolean(a?.contract) && !a?.issuer) ||
      (Boolean(a?.tokenAddress?.startsWith('C')) &&
        !a?.issuer &&
        a?.code?.toUpperCase() !== 'XLM' &&
        a?.tokenAddress !== SPAREKEY_CONFIG.xlmSac);

    if (isContract) {
      return {
        type: 'contract' as const,
        contract: a?.contract || a?.tokenAddress || '',
        floor: (a?.floor ?? 0n).toString(),
      };
    }

    const isNative =
      !a?.issuer || a?.code?.toUpperCase() === 'XLM' || a?.tokenAddress === SPAREKEY_CONFIG.xlmSac;

    if (isNative) {
      return {
        type: 'native' as const,
        code: 'XLM',
        floor: (a?.floor ?? BASE_RESERVE_FLOOR_STROOPS).toString(),
      };
    }

    return {
      type: 'classic' as const,
      code: a?.code || '',
      issuer: a?.issuer || '',
      floor: (a?.floor ?? 0n).toString(),
    };
  });

  const prepareRes = await recoveryApi.prepareRecoveryRegistration({
    email: cleanEmail,
    walletAddress: ownerAddress,
    assets: mappedAssets,
  });

  const unsignedXdr = extractUnsignedXdr(prepareRes);
  if (!unsignedXdr) {
    throw new Error('Backend did not return a valid unsigned transaction XDR for registration.');
  }

  const submitResult = await signAndSubmitTransaction({
    xdr: unsignedXdr,
    network: 'testnet',
    networkPassphrase: SPAREKEY_CONFIG.networkPassphrase,
    provider: walletProvider,
  });

  if (!submitResult?.success) {
    throw new Error(submitResult?.error || 'Wallet signing failed or transaction was rejected');
  }

  const txHash = submitResult?.hash || '';

  try {
    await recoveryApi.confirmRecoveryRegistration({
      email: cleanEmail,
      walletAddress: ownerAddress,
      transactionHash: txHash,
    });
  } catch (confirmErr) {
    console.warn('Backend confirmation warning (transaction succeeded on-chain):', confirmErr);
  }

  return {
    isRegistered: true,
    owner: ownerAddress,
    commitmentHex: prepareRes?.commitmentHex || '',
    saltHex: '',
    registeredAt: Date.now(),
    txHash,
  };
}

export async function unregisterRecoveryEmailOnChain(_params: {
  ownerAddress: string;
  walletProvider?: any;
}): Promise<boolean> {
  void _params;
  throw new Error('Unregistering is temporarily paused during contract migration.');
}

export async function updateRecoveryEmailOnChain(_params: {
  ownerAddress: string;
  newEmail: string;
  walletProvider?: any;
}): Promise<{ commitmentHex: string; saltHex: string; txHash: string }> {
  void _params;
  throw new Error('Updating email is temporarily paused during contract migration.');
}

export interface LedgerAssetBalance {
  code: string;
  balance: string;
  isNative: boolean;
  issuer?: string;
}

export async function fetchWalletLedgerBalances(address: string): Promise<LedgerAssetBalance[]> {
  if (!address || !address.startsWith('G') || address.length !== 56) return [];
  try {
    const horizon = new StellarSDK.Horizon.Server(SPAREKEY_CONFIG.horizonUrl);
    const account = await horizon.loadAccount(address);
    if (!account?.balances || !Array.isArray(account.balances)) return [];
    return account.balances.map((b: any) => {
      const isNative = b.asset_type === 'native';
      const code = isNative ? 'XLM' : b.asset_code || 'TOKEN';
      return {
        code,
        balance: b.balance,
        isNative,
        issuer: b.asset_issuer,
      };
    });
  } catch (err) {
    console.warn('Could not fetch balances for wallet from Horizon:', err);
    return [];
  }
}

export async function checkWalletUsdcTrustline(address: string): Promise<{
  accountExists: boolean;
  hasTrustline: boolean;
  usdcBalance?: string;
}> {
  if (!address || !address.startsWith('G') || address.length !== 56) {
    return { accountExists: false, hasTrustline: false };
  }
  try {
    const horizon = new StellarSDK.Horizon.Server(SPAREKEY_CONFIG.horizonUrl);
    const account = await horizon.loadAccount(address);
    const usdcEntry = account?.balances?.find(
      (b: any) => b.asset_code === TESTNET_USDC_CODE && b.asset_issuer === TESTNET_USDC_ISSUER
    );
    return {
      accountExists: true,
      hasTrustline: Boolean(usdcEntry),
      usdcBalance: usdcEntry?.balance,
    };
  } catch {
    return { accountExists: false, hasTrustline: false };
  }
}

export async function checkPendingRecovery(ownerAddress: string): Promise<PendingRecoveryInfo> {
  if (!ownerAddress) return { isPending: false };

  const token = getEffectiveAuthToken();
  if (!token) return { isPending: false };

  try {
    const status = await recoveryApi.getRecoveryStatus(ownerAddress);
    const unlockAtMs = status?.unlockAt
      ? typeof status.unlockAt === 'number' && status.unlockAt < 10_000_000_000
        ? status.unlockAt * 1000
        : Number(status.unlockAt)
      : undefined;

    if (status?.isActive || status?.status === 'PENDING' || status?.status === 'STARTED') {
      return {
        isPending: true,
        destination: status.destination || undefined,
        unlockAt: unlockAtMs,
      };
    }
  } catch (error) {
    console.warn('Backend recovery status check failed:', error);
  }

  return { isPending: false };
}

export async function executeRecoveryOnChain(params: {
  ownerAddress: string;
  callerAddress?: string;
  callerProvider?: any;
}): Promise<string> {
  const { ownerAddress } = params || {};

  if (!ownerAddress) {
    throw new Error('Owner wallet address is required to execute recovery.');
  }

  try {
    const res = await recoveryApi.executeRecovery(ownerAddress);
    return (
      res?.userOpTx ||
      res?.txHash ||
      res?.hash ||
      res?.transactionHash ||
      res?.data?.userOpTx ||
      res?.data?.txHash ||
      'executed'
    );
  } catch (error) {
    throw new Error(parseContractError(error));
  }
}
