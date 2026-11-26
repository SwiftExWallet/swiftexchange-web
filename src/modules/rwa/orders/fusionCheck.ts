import { TypedDataEncoder } from 'ethers';

import {
  TRAITS,
  decodeAmountData,
  decodePostInteraction,
  extensionHashMatchesSalt,
  hasTrait,
  splitExtension,
} from './fusionExtension';

export const ONEINCH_SETTLEMENT: Record<number, readonly string[]> = {
  1: ['0x2ad5004c60e16e54d5007c80ce329adde5b51ef5', '0xa88800cd213da5ae406ce248380802bd53b47647'],
  56: ['0x2ad5004c60e16e54d5007c80ce329adde5b51ef5', '0xa88800cd213da5ae406ce248380802bd53b47647'],
};

export const MAX_FEE_1E5 = 2000n;
export const MAX_SURPLUS_FEE_PCT = 50n;
const MAX_EXPIRY_AHEAD_S = 24 * 3600;
const BASE_1E5 = 100000n;

const lc = (a: unknown): string => String(a == null ? '' : a).toLowerCase();
const ZERO = '0x0000000000000000000000000000000000000000';
const block = (msg: string): never => {
  throw new Error(`Swap blocked: ${msg}`);
};

export const typedOrderHash = (typedData: any): string => {
  const types = { ...(typedData.types || {}) };
  delete types.EIP712Domain;
  return TypedDataEncoder.hash(typedData.domain, types, typedData.message);
};

export interface VerifyRwaFusionResult {
  receiverRule: 'maker' | 'settlement';
  finalReceiver: string;
  feeBps1e5?: string;
  decoded?: {
    settlement: string;
    integratorFee: string;
    resolverFee: string;
    surplusFee: string;
    protocolFeeRecipient: string;
    integratorFeeRecipient: string;
    customReceiver: string | null;
    whitelist: number;
    expiry: number;
  };
}

export const verifyRwaFusionOrder = (
  typedData: any,
  {
    wallet,
    chainId,
    extension,
    orderHash,
    minTakingAmount,
    now = Date.now(),
  }: {
    wallet: string;
    chainId: number;
    extension?: string | null;
    orderHash?: string | null;
    minTakingAmount?: string | bigint | null;
    now?: number;
  }
): VerifyRwaFusionResult => {
  if (!typedData || !typedData.message || !typedData.domain || !typedData.types)
    block('malformed order');
  const m = typedData.message;
  if (Number(typedData.domain.chainId) !== Number(chainId)) block('order is for another chain');
  if (lc(m.maker) !== lc(wallet)) block('order maker is not your wallet');

  let hash: string;
  try {
    hash = typedOrderHash(typedData);
  } catch {
    block("order can't be hashed");
    throw new Error('unreachable');
  }
  if (!orderHash || lc(hash) !== lc(orderHash)) block("order hash doesn't match the order");

  const traits = m.makerTraits;
  const withExt = hasTrait(traits, TRAITS.HAS_EXTENSION);
  const ext = extension && extension !== '0x' ? extension : null;
  if (withExt !== Boolean(ext)) block('order extension missing or unexpected');
  if (ext && !extensionHashMatchesSalt(ext, m.salt))
    block("extension isn't bound to the signed order");

  const receiver = lc(m.receiver);
  if (!receiver || receiver === ZERO || receiver === lc(wallet)) {
    return { receiverRule: 'maker', finalReceiver: lc(wallet) };
  }

  const allowed = ONEINCH_SETTLEMENT[Number(chainId)] || [];
  if (!allowed.includes(receiver)) return block('order pays an unknown contract');
  if (!ext) return block('order pays a contract but has no extension');

  if (!hasTrait(traits, TRAITS.POST_INTERACTION)) block('fee-taker call is not enabled');
  if (hasTrait(traits, TRAITS.PRE_INTERACTION)) block('unexpected pre-interaction');
  if (hasTrait(traits, TRAITS.USE_PERMIT2)) block('unexpected Permit2 use');
  if (hasTrait(traits, TRAITS.UNWRAP_WETH)) block('unexpected unwrap');
  const expiry = Number((BigInt(traits) >> 80n) & ((1n << 40n) - 1n));
  const nowS = Math.floor(now / 1000);
  if (!expiry || expiry > nowS + MAX_EXPIRY_AHEAD_S) block('unexpected order expiry');

  let f: ReturnType<typeof splitExtension>;
  let amount: ReturnType<typeof decodeAmountData>;
  let post: ReturnType<typeof decodePostInteraction>;
  try {
    f = splitExtension(ext);
    amount = decodeAmountData(f.makingAmountData);
    post = decodePostInteraction(f.postInteraction);
  } catch (e: any) {
    block(`order extension can't be read (${e.message})`);
    throw new Error('unreachable');
  }

  for (const k of [
    'makerAssetSuffix',
    'takerAssetSuffix',
    'predicate',
    'makerPermit',
    'preInteraction',
    'customData',
  ] as const) {
    if (f[k] !== '0x') block(`unexpected extension part: ${k}`);
  }
  if (f.takingAmountData !== f.makingAmountData) block('price data differs between getters');
  if (amount.tail !== '') block('price data calls another contract');
  if (post.tail !== '') block('unexpected extra call after the fill');

  if (amount.target !== receiver || post.target !== receiver)
    block('extension calls an unknown contract');

  if (post.flags > 1n) block('unknown fee-taker flags');
  const finalReceiver = post.customReceiver || lc(m.maker);
  if (finalReceiver !== lc(wallet)) block('order pays someone else');

  for (const k of [
    'integratorFee',
    'integratorShare',
    'resolverFee',
    'discountNumerator',
  ] as const) {
    if (amount.fees[k] !== post.fees[k]) block('fee data is inconsistent');
  }
  if (
    amount.whitelist.length !== post.whitelist.length ||
    amount.whitelist.some((h, i) => h !== post.whitelist[i].half)
  ) {
    block('resolver list is inconsistent');
  }

  const fee = post.fees.integratorFee + post.fees.resolverFee;
  if (fee > MAX_FEE_1E5) block('swap fee is above the 2% limit');
  if (post.fees.integratorShare > 100n || post.fees.discountNumerator > 100n)
    block('invalid fee data');
  if (post.surplusFee > MAX_SURPLUS_FEE_PCT) block('surplus fee too high');
  const taking = BigInt(m.takingAmount);
  if (post.estimatedTakingAmount < taking) block('estimate below the order minimum');

  const gross = (taking * (BASE_1E5 + fee) + BASE_1E5 - 1n) / BASE_1E5;
  const net = gross - (gross * fee) / (BASE_1E5 + fee);
  if (minTakingAmount == null) return block('no minimum to check against');
  if (net < BigInt(minTakingAmount) || taking < BigInt(minTakingAmount)) {
    block('order returns less than the minimum shown');
  }

  return {
    receiverRule: 'settlement',
    finalReceiver,
    feeBps1e5: String(fee),
    decoded: {
      settlement: receiver,
      integratorFee: String(post.fees.integratorFee),
      resolverFee: String(post.fees.resolverFee),
      surplusFee: String(post.surplusFee),
      protocolFeeRecipient: post.protocolFeeRecipient,
      integratorFeeRecipient: post.integratorFeeRecipient,
      customReceiver: post.customReceiver,
      whitelist: post.whitelist.length,
      expiry,
    },
  };
};
