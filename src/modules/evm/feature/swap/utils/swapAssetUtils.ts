import { STELLAR_CHAIN_ID } from '../constants/swap.constants';

export const isStellar = (id: any): boolean => {
  return id === 'stellar' || id === STELLAR_CHAIN_ID || id === 'testnet' || id === 'pubnet';
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

  const aAddr = (a.address || '').toLowerCase().trim();
  const bAddr = (b.address || '').toLowerCase().trim();
  const aContract = (a.contract || '').toLowerCase().trim();
  const bContract = (b.contract || '').toLowerCase().trim();
  const aIssuer = (a.issuer || '').toLowerCase().trim();
  const bIssuer = (b.issuer || '').toLowerCase().trim();

  if (aAddr && bAddr && aAddr === bAddr) return true;
  if (aContract && bContract && aContract === bContract) return true;
  if (aContract && bAddr && aContract === bAddr) return true;
  if (aAddr && bContract && aAddr === bContract) return true;
  if (aIssuer && bIssuer && aIssuer === bIssuer) return true;
  if (aIssuer && bAddr && aIssuer === bAddr) return true;
  if (aAddr && bIssuer && aAddr === bIssuer) return true;
  if (aContract && bIssuer && aContract === bIssuer) return true;
  if (aIssuer && bContract && aIssuer === bContract) return true;

  return false;
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
  const cLower = (asset.contract || '').toLowerCase().trim();
  const iLower = (asset.issuer || '').toLowerCase().trim();
  const assetIsNative =
    !!asset.isNative ||
    !aLower ||
    aLower === '0x0000000000000000000000000000000000000000' ||
    aLower === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' ||
    aLower === 'native';
  if (queryIsNative && assetIsNative) return true;
  if (queryIsNative !== assetIsNative) return false;
  return aLower === qLower || (!!cLower && cLower === qLower) || (!!iLower && iLower === qLower);
};
