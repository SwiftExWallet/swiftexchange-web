import { getAddress, keccak256 } from 'ethers';

export const FIELDS = [
  'makerAssetSuffix',
  'takerAssetSuffix',
  'makingAmountData',
  'takingAmountData',
  'predicate',
  'makerPermit',
  'preInteraction',
  'postInteraction',
  'customData',
] as const;

export type ExtensionField = (typeof FIELDS)[number];

export const TRAITS = {
  NO_PARTIAL_FILLS: 255n,
  ALLOW_MULTIPLE_FILLS: 254n,
  PRE_INTERACTION: 252n,
  POST_INTERACTION: 251n,
  NEED_EPOCH_CHECK: 250n,
  HAS_EXTENSION: 249n,
  USE_PERMIT2: 248n,
  UNWRAP_WETH: 247n,
} as const;

const bad = (msg: string): never => {
  throw new Error(`extension: ${msg}`);
};

const strip = (hex: unknown): string => {
  if (typeof hex !== 'string' || !/^0x([0-9a-fA-F]{2})*$/.test(hex)) bad('not hex bytes');
  return (hex as string).slice(2).toLowerCase();
};

export const hasTrait = (makerTraits: string | number | bigint, bit: bigint): boolean =>
  ((BigInt(makerTraits) >> bit) & 1n) === 1n;

export const splitExtension = (extension: string): Record<ExtensionField, string> => {
  const h = strip(extension);
  if (h.length < 64) bad('shorter than the offsets word');
  const offsets = BigInt('0x' + h.slice(0, 64));
  const concat = h.slice(64);
  const len = concat.length / 2;
  const out = {} as Record<ExtensionField, string>;
  let begin = 0;
  for (let i = 0; i < 8; i++) {
    const end = Number((offsets >> BigInt(32 * i)) & 0xffffffffn);
    if (end < begin || end > len) bad(`bad offset for ${FIELDS[i]}`);
    out[FIELDS[i]] = '0x' + concat.slice(begin * 2, end * 2);
    begin = end;
  }
  out.customData = '0x' + concat.slice(begin * 2);
  return out;
};

const reader = (hex: string) => {
  const h = strip(hex);
  let p = 0;
  const take = (n: number): string => {
    if (p + n * 2 > h.length) bad('data ends early');
    const s = h.slice(p, p + n * 2);
    p += n * 2;
    return s;
  };
  return {
    uint: (n: number): bigint => BigInt('0x' + take(n)),
    address: (): string => getAddress('0x' + take(20)).toLowerCase(),
    bytes: (n: number): string => take(n),
    rest: (): string => {
      const s = h.slice(p);
      p = h.length;
      return s;
    },
  };
};

export const decodeAmountData = (hex: string) => {
  const r = reader(hex);
  const target = r.address();
  const auction = {
    gasBumpEstimate: r.uint(3),
    gasPriceEstimate: r.uint(4),
    startTime: r.uint(4),
    duration: r.uint(3),
    initialRateBump: r.uint(3),
    points: [] as { rate: bigint; delta: bigint }[],
  };
  const n = Number(r.uint(1));
  for (let i = 0; i < n; i++) auction.points.push({ rate: r.uint(3), delta: r.uint(2) });
  const fees = {
    integratorFee: r.uint(2),
    integratorShare: r.uint(1),
    resolverFee: r.uint(2),
    discountNumerator: r.uint(1),
  };
  const wl = Number(r.uint(1));
  const whitelist: string[] = [];
  for (let i = 0; i < wl; i++) whitelist.push(r.bytes(10));
  const tail = r.rest();
  return { target, auction, fees, whitelist, tail };
};

export const decodePostInteraction = (hex: string) => {
  const r = reader(hex);
  const target = r.address();
  const flags = r.uint(1);
  const integratorFeeRecipient = r.address();
  const protocolFeeRecipient = r.address();
  const customReceiver = (flags & 1n) === 1n ? r.address() : null;
  const fees = {
    integratorFee: r.uint(2),
    integratorShare: r.uint(1),
    resolverFee: r.uint(2),
    discountNumerator: r.uint(1),
  };
  const allowedTime = r.uint(4);
  const wl = Number(r.uint(1));
  const whitelist: { half: string; delay: bigint }[] = [];
  for (let i = 0; i < wl; i++) whitelist.push({ half: r.bytes(10), delay: r.uint(2) });
  const estimatedTakingAmount = r.uint(32);
  const surplusFee = r.uint(1);
  const tail = r.rest();
  return {
    target,
    flags,
    integratorFeeRecipient,
    protocolFeeRecipient,
    customReceiver,
    fees,
    allowedTime,
    whitelist,
    estimatedTakingAmount,
    surplusFee,
    tail,
  };
};

export const extensionHashMatchesSalt = (
  extension: string,
  salt: string | number | bigint
): boolean => {
  const mask = (1n << 160n) - 1n;
  return (BigInt(keccak256(extension)) & mask) === (BigInt(salt) & mask);
};
