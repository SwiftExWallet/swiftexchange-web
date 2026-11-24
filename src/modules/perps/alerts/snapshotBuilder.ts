import BigNumber from 'bignumber.js';

import type { AsterAssetIndexItem } from '../adapters/aster/api/account';
import type { AsterAccountInfo, AsterPositionRisk } from '../adapters/aster/types/account';
import type {
  AlertAccountSnapshot,
  AlertAssetSnapshot,
  AlertPositionSnapshot,
  SnapshotPayload,
} from './types';

const STABLE_ASSETS = new Set(['USDT', 'USD1', 'USDC', 'USD', 'BUSD', 'FDUSD', 'DAI']);

export interface CollateralAssetInput {
  asset: string;
  crossWalletBalance?: string;
  [key: string]: any;
}

export function normalizeSymbol(sym: string): string {
  if (!sym || typeof sym !== 'string') return '';
  return sym.replace(/[-_/]/g, '').toUpperCase();
}

export function buildAssetSnapshots(
  accountAssets: CollateralAssetInput[] | AsterAccountInfo['assets'] | undefined,
  isMultiAsset: boolean,
  assetIndexes: AsterAssetIndexItem[] = []
): AlertAssetSnapshot[] {
  if (!Array.isArray(accountAssets) || accountAssets.length === 0) {
    return [];
  }

  const assetIndexMap = new Map<string, AsterAssetIndexItem>();
  for (const item of assetIndexes) {
    if (item && item.symbol) {
      assetIndexMap.set(item.symbol.toUpperCase(), item);
    }
  }

  const result: AlertAssetSnapshot[] = [];

  for (const a of accountAssets) {
    if (!a || typeof a !== 'object' || !a.asset || typeof a.asset !== 'string') {
      continue;
    }

    const rawBalance = a.crossWalletBalance || '0';
    const bnBalance = new BigNumber(rawBalance);
    if (!bnBalance.isFinite() || bnBalance.isZero()) {
      continue;
    }

    const assetUpper = a.asset.toUpperCase();
    const isStable = STABLE_ASSETS.has(assetUpper);

    if (!isMultiAsset) {
      if (assetUpper === 'USDT' || assetUpper === 'USD1') {
        result.push({
          asset: a.asset,
          crossWalletBalance: rawBalance,
          price: '1',
          discount: '1',
        });
      }
      continue;
    }

    if (isStable) {
      result.push({
        asset: a.asset,
        crossWalletBalance: rawBalance,
        price: '1',
        discount: '1',
      });
      continue;
    }

    const indexItem =
      assetIndexMap.get(`${assetUpper}USD`) ||
      assetIndexMap.get(`${assetUpper}USDT`) ||
      assetIndexMap.get(assetUpper);

    if (!indexItem || !indexItem.index || parseFloat(indexItem.index) <= 0) {
      continue;
    }

    let discount = '0.9';
    if (indexItem.bidBuffer !== undefined && indexItem.bidBuffer !== null) {
      const bufNum = parseFloat(indexItem.bidBuffer);
      if (!isNaN(bufNum) && bufNum >= 0 && bufNum <= 1) {
        discount = new BigNumber(1).minus(bufNum).toFixed(4);
      }
    }

    result.push({
      asset: a.asset,
      crossWalletBalance: rawBalance,
      price: indexItem.index,
      discount,
    });
  }

  return result.slice(0, 30);
}

export function buildPositionSnapshots(
  positionRisks: AsterPositionRisk[] = [],
  accountPositions: any[] = []
): AlertPositionSnapshot[] {
  const activeRisks = positionRisks.filter(p => {
    if (!p || typeof p !== 'object' || !p.symbol) return false;
    const amt = new BigNumber(p.positionAmt || '0');
    return amt.isFinite() && !amt.isZero();
  });

  if (activeRisks.length === 0) {
    return [];
  }

  const accountPositionsMap = new Map<string, any>();
  for (const ap of accountPositions) {
    if (ap && typeof ap === 'object' && ap.symbol) {
      const norm = normalizeSymbol(ap.symbol);
      const side = (ap.positionSide || 'BOTH').toUpperCase();
      accountPositionsMap.set(`${norm}_${side}`, ap);
      accountPositionsMap.set(norm, ap);
    }
  }

  const sortedRisks = [...activeRisks].sort((a, b) => {
    const notionalA = a.notional
      ? Math.abs(parseFloat(a.notional))
      : Math.abs(parseFloat(a.positionAmt || '0') * parseFloat(a.markPrice || '0'));
    const notionalB = b.notional
      ? Math.abs(parseFloat(b.notional))
      : Math.abs(parseFloat(b.positionAmt || '0') * parseFloat(b.markPrice || '0'));
    return notionalB - notionalA;
  });

  const top10 = sortedRisks.slice(0, 10);

  return top10.map(p => {
    const normSym = normalizeSymbol(p.symbol);
    const side = (p.positionSide || 'BOTH').toUpperCase();
    const acctPos =
      accountPositionsMap.get(`${normSym}_${side}`) || accountPositionsMap.get(normSym);

    const marginType = (p.marginType?.toLowerCase() === 'isolated' ? 'isolated' : 'cross') as
      'cross' | 'isolated';

    let maintMargin = acctPos?.maintMargin;
    if (!maintMargin || parseFloat(maintMargin) <= 0) {
      maintMargin = (p as any).maintMargin || (p as any).isolatedMargin || '0';
    }

    const isolatedWallet =
      marginType === 'isolated'
        ? p.isolatedWallet || acctPos?.isolatedWallet || p.isolatedMargin || '0'
        : undefined;

    return {
      symbol: normSym,
      positionAmt: p.positionAmt,
      entryPrice: p.entryPrice,
      markPrice: p.markPrice,
      maintMargin: String(maintMargin),
      marginType,
      ...(isolatedWallet !== undefined ? { isolatedWallet: String(isolatedWallet) } : {}),
    };
  });
}

export function filterMutedKeysForActivePositions(
  savedMutedKeys: string[],
  positions: AlertPositionSnapshot[]
): string[] {
  if (!Array.isArray(savedMutedKeys) || savedMutedKeys.length === 0) {
    return [];
  }

  const activeIsoKeys = new Set<string>();
  let hasCross = false;

  for (const pos of positions) {
    if (pos.marginType === 'cross') {
      hasCross = true;
    } else if (pos.marginType === 'isolated') {
      const isLong = parseFloat(pos.positionAmt) > 0;
      const key = `iso:${pos.symbol}:${isLong ? 'LONG' : 'SHORT'}`;
      activeIsoKeys.add(key);
    }
  }

  const validMuted = savedMutedKeys.filter(k => {
    if (k === 'cross') return hasCross;
    return activeIsoKeys.has(k);
  });

  return validMuted.slice(0, 11);
}

export function buildAlertSnapshotPayload(params: {
  fcmToken: string;
  wallet: string;
  accountInfo?: { assets?: CollateralAssetInput[]; positions?: any[] } | AsterAccountInfo | null;
  positionRisks?: AsterPositionRisk[];
  isMultiAsset: boolean;
  assetIndexes?: AsterAssetIndexItem[];
  savedMutedKeys?: string[];
}): SnapshotPayload {
  const {
    fcmToken,
    wallet,
    accountInfo,
    positionRisks = [],
    isMultiAsset,
    assetIndexes = [],
    savedMutedKeys = [],
  } = params;

  const assets = buildAssetSnapshots(accountInfo?.assets, isMultiAsset, assetIndexes);
  const positions = buildPositionSnapshots(positionRisks, accountInfo?.positions);
  const muted = filterMutedKeysForActivePositions(savedMutedKeys, positions);

  const account: AlertAccountSnapshot = {
    assets,
    positions,
    ...(muted.length > 0 ? { muted } : {}),
  };

  return {
    fcmToken,
    wallet: wallet.toLowerCase(),
    platform: 'web',
    snapshotAt: Date.now(),
    account,
  };
}
