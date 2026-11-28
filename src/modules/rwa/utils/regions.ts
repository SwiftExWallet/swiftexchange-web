import { REGION_RULES } from '../config/rwaConfig';
import type { RwaAsset } from '../types/rwa.types';

export const normalizeCountry = (c?: string | null): string =>
  typeof c === 'string' ? c.trim().toUpperCase() : '';

// Is this asset's issuer allowed for this country? Unknown country or unknown rule key => no.
export const isAssetAllowed = (
  asset: Pick<RwaAsset, 'regions'> | null | undefined,
  country?: string | null
): boolean => {
  const cc = normalizeCountry(country);
  if (!/^[A-Z]{2}$/.test(cc) || !asset) return false;
  const blocked = REGION_RULES[asset.regions];
  if (!blocked) return false;
  return !blocked.includes(cc);
};

export const visibleAssets = <T extends Pick<RwaAsset, 'regions'>>(
  assets: T[] | null | undefined,
  country?: string | null
): T[] => (assets || []).filter(a => isAssetAllowed(a, country));
