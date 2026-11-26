import { REGION_RULES } from '../config/rwaConfig';
import type { RwaAsset, RwaCategory, RwaChain, RwaIssuer } from '../types/rwa.types';
import RAW from './rwaAssets.json';

const ISSUERS: readonly RwaIssuer[] = [
  'ondo',
  'xstocks',
  'paxos',
  'tether',
  'ondo-stellar',
  'etherfuse',
];
const CATEGORIES: readonly RwaCategory[] = ['stock', 'etf', 'gold', 'treasury'];
const EVM_CHAINS: Partial<Record<RwaChain, number>> = { ETH: 1, BSC: 56 };

// Returns null if valid, else the reason.
export const assetProblem = (a: any): string | null => {
  if (!a || typeof a !== 'object') return 'not an object';
  if (!a.id || !a.symbol || !a.name) return 'missing id/symbol/name';
  if (!ISSUERS.includes(a.issuer)) return `bad issuer ${a.issuer}`;
  if (!CATEGORIES.includes(a.category)) return `bad category ${a.category}`;
  if (!REGION_RULES[a.regions as keyof typeof REGION_RULES]) return `no region rule ${a.regions}`;
  if (!Number.isInteger(a.decimals) || a.decimals < 0 || a.decimals > 36) return 'bad decimals';
  if (a.chain === 'XLM') {
    if (!/^[A-Za-z0-9]{1,12}$/.test(a.code || '')) return 'bad stellar code';
    if (!/^G[A-Z2-7]{55}$/.test(a.stellarIssuer || '')) return 'bad stellar issuer';
    return null;
  }
  const evmChainId = EVM_CHAINS[a.chain as RwaChain];
  if (!evmChainId) return `bad chain ${a.chain}`;
  if (a.chainId !== evmChainId) return 'chainId mismatch';
  if (!/^0x[0-9a-fA-F]{40}$/.test(a.address || '')) return 'bad address';
  if (a.logo && !/^https:\/\//.test(a.logo)) return 'logo not https';
  return null;
};

export const validateAssets = (
  list: any[]
): { ok: RwaAsset[]; dropped: { id?: string; why: string }[] } => {
  const seen = new Set<string>();
  const ok: RwaAsset[] = [];
  const dropped: { id?: string; why: string }[] = [];
  (list || []).forEach(a => {
    const why = assetProblem(a) || (seen.has(a.id) ? 'duplicate id' : null);
    if (why) dropped.push({ id: a?.id, why });
    else {
      seen.add(a.id);
      ok.push(a as RwaAsset);
    }
  });
  return { ok, dropped };
};

export const expandAssets = (raw: any): RwaAsset[] => {
  if (Array.isArray(raw)) return raw;
  if (!raw || !Array.isArray(raw.rows) || !raw.issuers) return [];
  const out: RwaAsset[] = [];
  raw.rows.forEach((r: any[]) => {
    const [symbol, name, underlying, issuer, category, chains, addrs, decimals, logo, market] = r;
    const iss = raw.issuers[issuer] || {};
    const chainList = String(chains || '').split('|') as RwaChain[];
    const addrList = String(addrs || '').split('|');
    let logoUrl: string | null = null;
    if (typeof logo === 'string') {
      const i = logo.indexOf(':');
      const pre = raw.logoPrefixes && raw.logoPrefixes[Number(logo.slice(0, i))];
      if (pre) logoUrl = pre + logo.slice(i + 1);
    }
    chainList.forEach((chain, k) => {
      const addr = addrList.length === chainList.length ? addrList[k] : addrList[0];
      const stellar = chain === 'XLM';
      const [code, stellarIssuer] = stellar ? addr.split(':') : [null, null];
      out.push({
        id: `${symbol}-${chain}`,
        symbol,
        name,
        underlying: underlying || null,
        issuer,
        category,
        chain,
        chainId: EVM_CHAINS[chain] || null,
        address: stellar ? null : addr,
        code: stellar ? code : null,
        stellarIssuer: stellar ? stellarIssuer : null,
        decimals,
        logo: logoUrl,
        multiplier: {
          kind: iss.multiplier || 'none',
          oracle: (iss.oracle && iss.oracle[chain]) || null,
        },
        marketHours: iss.marketHours || '24-7',
        termsUrl: iss.termsUrl || null,
        regions: iss.regions,
        market: market || null,
      });
    });
  });
  return out;
};

const { ok: ASSETS } = validateAssets(expandAssets(RAW));
export const RWA_ASSETS: RwaAsset[] = ASSETS;

const STELLAR_LLAMA: Record<string, string> = {
  USDY: 'coingecko:ondo-us-dollar-yield',
  CETES: 'coingecko:cetes',
};

export const llamaKey = (a?: RwaAsset | null): string | null => {
  if (!a) return null;
  if (a.chain === 'ETH' && a.address) return `ethereum:${a.address.toLowerCase()}`;
  if (a.chain === 'BSC' && a.address) return `bsc:${a.address.toLowerCase()}`;
  if (a.chain === 'XLM' && a.code) return STELLAR_LLAMA[a.code] || null;
  return null;
};

export const findEvmRwaAsset = (
  chainId: number | string | null | undefined,
  address: string | null | undefined
): RwaAsset | null => {
  const cid = Number(chainId);
  if (!cid || !address) return null;
  const lc = address.toLowerCase();
  return RWA_ASSETS.find(a => a.chainId === cid && a.address?.toLowerCase() === lc) || null;
};
