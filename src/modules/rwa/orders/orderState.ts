import type { RwaOrderRecord, RwaOrderStage } from '../types/rwa.types';

export const FINAL: readonly RwaOrderStage[] = ['filled', 'expired', 'cancelled', 'failed'];
export const isFinal = (stage: RwaOrderStage): boolean => FINAL.includes(stage);

export const explorerTxUrl = (chain: string, hash: string): string =>
  chain === 'BSC' ? `https://bscscan.com/tx/${hash}` : `https://etherscan.io/tx/${hash}`;

export const TIMELINE: { stage: RwaOrderStage; label: string }[] = [
  { stage: 'signing', label: 'Signed' },
  { stage: 'approving', label: 'Approved' },
  { stage: 'submitted', label: 'Submitted' },
  { stage: 'filling', label: 'Filling' },
  { stage: 'filled', label: 'Filled' },
];

const ORDER: RwaOrderStage[] = [
  'preparing',
  'signing',
  'approving',
  'submitting',
  'submitted',
  'filling',
  'filled',
];
export const stageIndex = (stage: RwaOrderStage): number => ORDER.indexOf(stage);

export const mapFusionStatus = (
  status: string | null | undefined
): { stage: RwaOrderStage | null; reason?: string } | null => {
  const s = String(status || '').toLowerCase();
  if (!s) return null;
  if (s === 'filled') return { stage: 'filled' };
  if (s === 'partially-filled' || s === 'pending') return { stage: 'filling' };
  if (s === 'expired') return { stage: 'expired' };
  if (s === 'cancelled' || s === 'canceled') return { stage: 'cancelled' };
  if (s === 'not-enough-balance-or-allowance') return { stage: null, reason: 'balance' };
  if (s === 'false-predicate' || s === 'invalid-signature' || s === 'wrong-permit') {
    return { stage: 'failed', reason: s };
  }
  return null;
};

export const readStatusResponse = (res: any): { status: string | null; fillTx: string | null } => {
  if (!res || typeof res !== 'object') return { status: null, fillTx: null };
  const d = res.data && typeof res.data === 'object' ? res.data : res;
  const status = d.status || d.orderStatus || res.status || null;
  const fills = d.fills || res.fills || [];
  const fill = Array.isArray(fills) ? fills.find((f: any) => f && f.txHash) : null;
  return { status: typeof status === 'string' ? status : null, fillTx: fill ? fill.txHash : null };
};

const EXPIRY_MARGIN_MS = 5 * 60 * 1000;
export const expiryFor = (createdAt: number, auctionSeconds?: number | null): number =>
  createdAt + (Number(auctionSeconds) > 0 ? Number(auctionSeconds) : 180) * 1000 + EXPIRY_MARGIN_MS;

const big = (x: unknown): bigint | null => {
  try {
    return BigInt(String(x));
  } catch {
    return null;
  }
};

export const applyUpdate = (
  record: RwaOrderRecord,
  update: {
    status?: string | null;
    fillTx?: string | null;
    outBalance?: string | null;
    now?: number;
  }
): RwaOrderRecord => {
  if (!record || isFinal(record.stage)) return record;
  const now = update.now || Date.now();
  const next: RwaOrderRecord = { ...record, checkedAt: now };
  const mapped = mapFusionStatus(update.status);
  if (mapped) {
    if (mapped.stage) next.stage = mapped.stage;
    if (mapped.reason) next.reason = mapped.reason;
  }
  if (update.fillTx) next.fillTx = update.fillTx;

  if (
    next.stage !== 'filled' &&
    update.outBalance != null &&
    record.outBalanceBefore != null &&
    record.minOut
  ) {
    const before = big(record.outBalanceBefore);
    const nowBal = big(update.outBalance);
    const min = big(record.minOut);
    if (
      before !== null &&
      nowBal !== null &&
      min !== null &&
      nowBal - before >= (min * 95n) / 100n
    ) {
      next.stage = 'filled';
      next.filledBy = 'balance';
    }
  }

  if (!isFinal(next.stage) && record.expiresAt && now > record.expiresAt) {
    next.stage = 'expired';
  }
  if (isFinal(next.stage) && !next.doneAt) next.doneAt = now;
  return next;
};

export const canStartOrder = (
  records: RwaOrderRecord[],
  now = Date.now()
): { ok: true } | { ok: false; reason: 'open' | 'recent'; record: RwaOrderRecord } => {
  const open = (records || []).find(r => !isFinal(r.stage) && (!r.expiresAt || now <= r.expiresAt));
  if (open) return { ok: false, reason: 'open', record: open };
  const recent = (records || []).find(r => now - (r.createdAt || 0) < 15000);
  if (recent) return { ok: false, reason: 'recent', record: recent };
  return { ok: true };
};

export const QUOTE_MAX_AGE_MS = 45000;
export const quoteIsFresh = (quotedAt: number | null | undefined, now = Date.now()): boolean =>
  !!quotedAt && now - quotedAt <= QUOTE_MAX_AGE_MS;

export const STAGE_TEXT: Record<RwaOrderStage | 'unknown', string> = {
  preparing: 'Preparing your order…',
  signing: 'Signing the order in your wallet…',
  approving: 'Approving the exact amount (one network fee)…',
  submitting: 'Sending the order…',
  submitted: 'Order sent. Waiting for it to be filled (usually under a minute)…',
  filling: 'Filling…',
  filled: 'Done. The tokens are in your wallet.',
  expired: 'Not filled in time. Nothing was taken — your funds stay in your wallet.',
  cancelled: 'Order cancelled. Your funds stay in your wallet.',
  failed: "The order couldn't be filled. Your funds stay in your wallet.",
  unknown: 'Status unknown — check your wallet before trying again.',
};
