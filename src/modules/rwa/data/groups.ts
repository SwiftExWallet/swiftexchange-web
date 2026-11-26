import type { RwaAsset, RwaChain, RwaGroup, RwaIssuer } from '../types/rwa.types';
import { RWA_ASSETS } from './assets';

let allGroups: RwaGroup[] | null = null;

export const getAllGroups = (): RwaGroup[] => {
  if (!allGroups) allGroups = buildGroups(RWA_ASSETS);
  return allGroups;
};

export const groupByKey = (key?: string | null): RwaGroup | null =>
  getAllGroups().find(g => g.key === key) || null;

export const POPULAR = [
  'AAPL',
  'TSLA',
  'NVDA',
  'MSFT',
  'AMZN',
  'GOOGL',
  'META',
  'SPY',
  'QQQ',
  'COIN',
  'MSTR',
  'PAXG',
  'XAUt',
  'USDY',
] as const;

const ISSUER_ORDER: Record<RwaIssuer, number> = {
  ondo: 0,
  xstocks: 1,
  paxos: 2,
  tether: 3,
  'ondo-stellar': 4,
  etherfuse: 5,
};

const CHAIN_ORDER: Record<RwaChain, number> = { ETH: 0, BSC: 1, XLM: 2 };

export const groupKey = (a: Pick<RwaAsset, 'issuer' | 'symbol'>): string =>
  `${a.issuer}|${a.symbol}`;

export const tickerOf = (g: Pick<RwaGroup, 'category' | 'underlying' | 'symbol'>): string =>
  g.category === 'stock' || g.category === 'etf' ? g.underlying || g.symbol : g.symbol;

export const buildGroups = (assets: RwaAsset[]): RwaGroup[] => {
  const map = new Map<string, RwaGroup>();
  assets.forEach(a => {
    const k = groupKey(a);
    if (!map.has(k)) {
      map.set(k, {
        key: k,
        symbol: a.symbol,
        name: a.name,
        underlying: a.underlying,
        issuer: a.issuer,
        category: a.category,
        market: a.market || null,
        logo: a.logo,
        marketHours: a.marketHours,
        termsUrl: a.termsUrl,
        regions: a.regions,
        multiplier: a.multiplier,
        chains: [],
        byChain: {},
        primary: a,
      });
    }
    const g = map.get(k)!;
    if (!g.byChain[a.chain]) {
      g.byChain[a.chain] = a;
      g.chains.push(a.chain);
    }
    if (!g.logo && a.logo) g.logo = a.logo;
  });
  const out = Array.from(map.values());
  out.forEach(g => {
    g.chains.sort((x, y) => CHAIN_ORDER[x] - CHAIN_ORDER[y]);
    g.primary = g.byChain[g.chains[0]]!;
  });
  return out;
};

const cmpTicker = (a: RwaGroup, b: RwaGroup): number =>
  tickerOf(a).toUpperCase().localeCompare(tickerOf(b).toUpperCase()) ||
  ISSUER_ORDER[a.issuer] - ISSUER_ORDER[b.issuer];

export interface PartitionedGroups {
  popular: RwaGroup[];
  core: RwaGroup[];
  moreUs: RwaGroup[];
  other: RwaGroup[];
  nonSecurity: RwaGroup[];
}

export const partitionGroups = (groups: RwaGroup[]): PartitionedGroups => {
  const ondoTickers = new Set(
    groups.filter(g => g.issuer === 'ondo').map(g => String(tickerOf(g)).toUpperCase())
  );
  const popularSet = new Set(POPULAR.map(t => t.toUpperCase()));
  const popular: RwaGroup[] = [];
  const core: RwaGroup[] = [];
  const moreUs: RwaGroup[] = [];
  const other: RwaGroup[] = [];
  const nonSecurity: RwaGroup[] = [];

  groups.forEach(g => {
    const t = String(tickerOf(g)).toUpperCase();
    if (popularSet.has(t)) popular.push(g);
    else if (g.category === 'gold' || g.category === 'treasury') nonSecurity.push(g);
    else if (g.market !== 'US') other.push(g);
    else if (ondoTickers.has(t)) core.push(g);
    else moreUs.push(g);
  });

  const popIdx = (g: RwaGroup) =>
    POPULAR.findIndex(p => p.toUpperCase() === String(tickerOf(g)).toUpperCase());

  popular.sort((a, b) => popIdx(a) - popIdx(b) || ISSUER_ORDER[a.issuer] - ISSUER_ORDER[b.issuer]);
  [core, moreUs, nonSecurity].forEach(l => l.sort(cmpTicker));
  other.sort(
    (a, b) =>
      a.symbol.toUpperCase().localeCompare(b.symbol.toUpperCase()) ||
      ISSUER_ORDER[a.issuer] - ISSUER_ORDER[b.issuer]
  );

  return { popular, core, moreUs, other, nonSecurity };
};

export type RwaChip = 'all' | 'stock' | 'etf' | 'gold' | 'treasury' | 'moreus' | 'other';

export const CHIP_LABELS: Record<RwaChip, string> = {
  all: 'All',
  stock: 'Stocks',
  etf: 'ETFs',
  gold: 'Gold',
  treasury: 'Treasuries',
  moreus: 'More US',
  other: 'Other markets',
};

export const CHIPS: RwaChip[] = ['all', 'stock', 'etf', 'gold', 'treasury', 'moreus', 'other'];

const matches = (g: RwaGroup, q: string): boolean =>
  g.symbol.toLowerCase().includes(q) ||
  g.name.toLowerCase().includes(q) ||
  String(g.underlying || '')
    .toLowerCase()
    .includes(q);

export type RwaListRow =
  { type: 'header'; key: string; title: string } | { type: 'asset'; key: string; group: RwaGroup };

export const listRows = (
  parts: PartitionedGroups,
  { chip = 'all', query = '' }: { chip?: RwaChip; query?: string } = {}
): RwaListRow[] => {
  const q = query.trim().toLowerCase();
  const rows: RwaListRow[] = [];
  const push = (title: string | null, list: RwaGroup[]) => {
    if (!list.length) return;
    if (title) rows.push({ type: 'header', key: `h:${title}`, title });
    list.forEach(g => rows.push({ type: 'asset', key: g.key, group: g }));
  };

  const everything = [
    ...parts.popular,
    ...parts.core,
    ...parts.nonSecurity,
    ...parts.moreUs,
    ...parts.other,
  ];

  if (q) {
    let pool = everything;
    if (chip === 'moreus') pool = parts.moreUs;
    else if (chip === 'other') pool = parts.other;
    else if (chip !== 'all') pool = everything.filter(g => g.category === chip);
    push(
      null,
      pool.filter(g => matches(g, q))
    );
    return rows;
  }

  if (chip === 'all') {
    push('Popular', parts.popular);
    push('US stocks & ETFs', parts.core);
    push('Gold & treasuries', parts.nonSecurity);
    return rows;
  }
  if (chip === 'moreus') {
    push(null, parts.moreUs);
    return rows;
  }
  if (chip === 'other') {
    push(null, parts.other);
    return rows;
  }
  push(
    null,
    [...parts.popular, ...parts.core, ...parts.nonSecurity].filter(g => g.category === chip)
  );
  return rows;
};
