import { create } from 'zustand';

import type { AlertSettings } from './types';

interface AlertSettingsState {
  settingsByWallet: Record<string, AlertSettings>;
  getSettings: (wallet?: string | null) => AlertSettings;
  setEnabled: (wallet: string, enabled: boolean) => void;
  toggleMuteKey: (wallet: string, key: string) => void;
  setMutedKeys: (wallet: string, keys: string[]) => void;
  cleanupClosedPositionMutedKeys: (wallet: string, activeKeys: string[]) => void;
}

const STORAGE_PREFIX = 'perps_alerts_settings_';

function loadStoredSettings(wallet: string): AlertSettings {
  if (typeof window === 'undefined' || !wallet) {
    return { enabled: true, mutedKeys: [] };
  }
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${wallet.toLowerCase()}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        enabled: parsed.enabled ?? true,
        mutedKeys: Array.isArray(parsed.mutedKeys) ? parsed.mutedKeys : [],
      };
    }
  } catch (err) {
    void err;
  }
  return { enabled: true, mutedKeys: [] };
}

function persistSettings(wallet: string, settings: AlertSettings): void {
  if (typeof window === 'undefined' || !wallet) return;
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${wallet.toLowerCase()}`, JSON.stringify(settings));
  } catch (err) {
    void err;
  }
}

export const useAlertSettingsStore = create<AlertSettingsState>((set, get) => ({
  settingsByWallet: {},

  getSettings: (wallet?: string | null) => {
    if (!wallet) return { enabled: true, mutedKeys: [] };
    const norm = wallet.toLowerCase();
    const existing = get().settingsByWallet[norm];
    if (existing) return existing;
    const loaded = loadStoredSettings(norm);
    set(state => ({
      settingsByWallet: {
        ...state.settingsByWallet,
        [norm]: loaded,
      },
    }));
    return loaded;
  },

  setEnabled: (wallet: string, enabled: boolean) => {
    if (!wallet) return;
    const norm = wallet.toLowerCase();
    const current = get().getSettings(norm);
    const updated = { ...current, enabled };
    persistSettings(norm, updated);
    set(state => ({
      settingsByWallet: {
        ...state.settingsByWallet,
        [norm]: updated,
      },
    }));
  },

  toggleMuteKey: (wallet: string, key: string) => {
    if (!wallet || !key) return;
    const norm = wallet.toLowerCase();
    const current = get().getSettings(norm);
    const exists = current.mutedKeys.includes(key);
    const nextKeys = exists
      ? current.mutedKeys.filter(k => k !== key)
      : [...current.mutedKeys, key].slice(0, 11);
    const updated = { ...current, mutedKeys: nextKeys };
    persistSettings(norm, updated);
    set(state => ({
      settingsByWallet: {
        ...state.settingsByWallet,
        [norm]: updated,
      },
    }));
  },

  setMutedKeys: (wallet: string, keys: string[]) => {
    if (!wallet) return;
    const norm = wallet.toLowerCase();
    const current = get().getSettings(norm);
    const updated = { ...current, mutedKeys: keys.slice(0, 11) };
    persistSettings(norm, updated);
    set(state => ({
      settingsByWallet: {
        ...state.settingsByWallet,
        [norm]: updated,
      },
    }));
  },

  cleanupClosedPositionMutedKeys: (wallet: string, activeKeys: string[]) => {
    if (!wallet) return;
    const norm = wallet.toLowerCase();
    const current = get().getSettings(norm);
    const activeSet = new Set(activeKeys);
    const cleaned = current.mutedKeys.filter(k => k === 'cross' || activeSet.has(k));
    if (cleaned.length !== current.mutedKeys.length) {
      const updated = { ...current, mutedKeys: cleaned };
      persistSettings(norm, updated);
      set(state => ({
        settingsByWallet: {
          ...state.settingsByWallet,
          [norm]: updated,
        },
      }));
    }
  },
}));
