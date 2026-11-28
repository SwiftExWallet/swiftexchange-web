import { beforeEach, describe, expect, it } from 'vitest';

import { useAlertSettingsStore } from '../alertSettingsStore';

describe('useAlertSettingsStore', () => {
  const testWallet = '0x1234567890123456789012345678901234567890';

  beforeEach(() => {
    localStorage.clear();
    useAlertSettingsStore.setState({ settingsByWallet: {} });
  });

  it('initializes with default enabled=true and empty mutedKeys', () => {
    const settings = useAlertSettingsStore.getState().getSettings(testWallet);
    expect(settings.enabled).toBe(true);
    expect(settings.mutedKeys).toEqual([]);
  });

  it('updates enabled master switch and persists to localStorage', () => {
    useAlertSettingsStore.getState().setEnabled(testWallet, false);
    const updated = useAlertSettingsStore.getState().getSettings(testWallet);
    expect(updated.enabled).toBe(false);

    const raw = localStorage.getItem(`perps_alerts_settings_${testWallet.toLowerCase()}`);
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!).enabled).toBe(false);
  });

  it('toggles mute keys and caps at 11', () => {
    useAlertSettingsStore.getState().toggleMuteKey(testWallet, 'cross');
    expect(useAlertSettingsStore.getState().getSettings(testWallet).mutedKeys).toContain('cross');

    useAlertSettingsStore.getState().toggleMuteKey(testWallet, 'cross');
    expect(useAlertSettingsStore.getState().getSettings(testWallet).mutedKeys).not.toContain(
      'cross'
    );
  });

  it('cleanupClosedPositionMutedKeys removes keys for positions that are no longer active', () => {
    useAlertSettingsStore
      .getState()
      .setMutedKeys(testWallet, ['cross', 'iso:BTCUSDT:LONG', 'iso:ETHUSDT:SHORT']);

    // Active positions only have ETHUSDT
    useAlertSettingsStore
      .getState()
      .cleanupClosedPositionMutedKeys(testWallet, ['iso:ETHUSDT:SHORT']);

    const settings = useAlertSettingsStore.getState().getSettings(testWallet);
    expect(settings.mutedKeys).toEqual(['cross', 'iso:ETHUSDT:SHORT']);
    expect(settings.mutedKeys).not.toContain('iso:BTCUSDT:LONG');
  });
});
