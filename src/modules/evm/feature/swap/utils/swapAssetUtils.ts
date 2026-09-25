import { STELLAR_CHAIN_ID } from '../constants/swap.constants';

export const isStellar = (id: any): boolean => {
  return id === 'stellar' || id === STELLAR_CHAIN_ID || id === 'testnet';
};

export const isSameAsset = (a: any, b: any): boolean => {
  if (!a || !b) return false;
  if (a.chainId && b.chainId && String(a.chainId) !== String(b.chainId)) return false;
  const aIsNative =
    !!a.isNative ||
    !a.address ||
    a.address.toLowerCase() === '0x0000000000000000000000000000000000000000' ||
    a.address.toLowerCase() === 'native';
  const bIsNative =
    !!b.isNative ||
    !b.address ||
    b.address.toLowerCase() === '0x0000000000000000000000000000000000000000' ||
    b.address.toLowerCase() === 'native';
  if (aIsNative !== bIsNative) return false;
  if (aIsNative && bIsNative) {
    return a.symbol?.toUpperCase() === b.symbol?.toUpperCase();
  }
  return a.address?.toLowerCase() === b.address?.toLowerCase();
};

export const matchesAddress = (asset: any, queryAddress: string): boolean => {
  if (!asset) return false;
  const qLower = (queryAddress || '').toLowerCase().trim();
  const queryIsNative =
    !qLower ||
    qLower === 'native' ||
    qLower === '0x0000000000000000000000000000000000000000' ||
    qLower === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
  const aLower = (asset.address || '').toLowerCase().trim();
  const assetIsNative =
    !!asset.isNative ||
    !aLower ||
    aLower === '0x0000000000000000000000000000000000000000' ||
    aLower === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' ||
    aLower === 'native';
  if (queryIsNative && assetIsNative) return true;
  if (queryIsNative !== assetIsNative) return false;
  return aLower === qLower;
};
