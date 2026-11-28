import type { RwaOrderRecord } from '../types/rwa.types';

const MAX_RECORDS = 30;
const keyFor = (wallet: string): string => `rwa_orders_v1:${wallet.toLowerCase()}`;

export const loadOrders = (wallet: string | null | undefined): RwaOrderRecord[] => {
  if (typeof window === 'undefined' || !wallet) return [];
  try {
    const raw = localStorage.getItem(keyFor(wallet));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveOrders = (wallet: string, records: RwaOrderRecord[]): void => {
  if (typeof window === 'undefined' || !wallet) return;
  try {
    localStorage.setItem(keyFor(wallet), JSON.stringify(records.slice(0, MAX_RECORDS)));
  } catch {
    // ignore quota errors
  }
};

export const upsertOrder = (wallet: string, record: RwaOrderRecord): RwaOrderRecord[] => {
  const list = loadOrders(wallet);
  const idx = list.findIndex(r => r.id === record.id);
  const next = idx >= 0 ? list.map((r, i) => (i === idx ? record : r)) : [record, ...list];
  saveOrders(wallet, next);
  return next;
};

export const renameOrder = (
  wallet: string,
  oldId: string,
  record: RwaOrderRecord
): RwaOrderRecord[] => {
  const list = loadOrders(wallet).filter(r => r.id !== oldId && r.id !== record.id);
  const next = [record, ...list];
  saveOrders(wallet, next);
  return next;
};
