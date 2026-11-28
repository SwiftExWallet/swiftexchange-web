import { AlertCircle, Bell, BellOff, ShieldCheck, Smartphone } from 'lucide-react';
import React, { useMemo } from 'react';

import BigNumber from 'bignumber.js';

import { useWalletStore } from '../../../walletconnect/store/walletConnectStore';
import { Modal } from '../../components/ui/Modal';
import { useAccountStore } from '../../core/stores/accountStore';
import { usePositionStore } from '../../core/stores/positionStore';
import { useAlertSettingsStore } from '../alertSettingsStore';
import { normalizeSymbol } from '../snapshotBuilder';

interface LiquidationAlertsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSyncNow?: () => void;
}

export const LiquidationAlertsModal: React.FC<LiquidationAlertsModalProps> = ({
  isOpen,
  onClose,
  onSyncNow,
}) => {
  const session = useWalletStore(state => state.session);
  const evmAddress = useWalletStore(state => state.connectedWallets.evm?.address);

  const rawWallet = evmAddress || session?.namespaces?.eip155?.accounts?.[0]?.split(':')?.[2] || '';
  const wallet = rawWallet.toLowerCase();

  const userDevice = session?.peer?.metadata?.userDevice as Record<string, any> | undefined;
  const isSwiftExConnected = Boolean(
    typeof userDevice?.fcmToken === 'string' && userDevice.fcmToken.trim().length >= 20
  );

  const positions = usePositionStore(state => state.positions);
  const totalMarginBalance = useAccountStore(state => state.totalMarginBalance);

  const getSettings = useAlertSettingsStore(state => state.getSettings);
  const setEnabled = useAlertSettingsStore(state => state.setEnabled);
  const toggleMuteKey = useAlertSettingsStore(state => state.toggleMuteKey);

  const settings = getSettings(wallet);

  const activePositionsList = useMemo(() => {
    return Object.values(positions).filter(p => {
      const amt = new BigNumber(p.size || '0');
      return !amt.isZero();
    });
  }, [positions]);

  const crossPositions = useMemo(() => {
    return activePositionsList.filter(p => (p.marginType || 'cross').toLowerCase() === 'cross');
  }, [activePositionsList]);

  const isolatedPositions = useMemo(() => {
    return activePositionsList.filter(p => (p.marginType || 'cross').toLowerCase() === 'isolated');
  }, [activePositionsList]);

  // Compute Cross Margin Ratio
  const crossRatioPct = useMemo(() => {
    if (crossPositions.length === 0) return 0;
    let sumMaint = new BigNumber(0);
    crossPositions.forEach(p => {
      const m = new BigNumber(p.initialMargin || p.isolatedMargin || '0').times(0.05);
      sumMaint = sumMaint.plus(m);
    });
    const marginBal = new BigNumber(totalMarginBalance || '0');
    if (marginBal.isZero() || marginBal.isNegative()) return 0;
    return sumMaint.dividedBy(marginBal).times(100).toNumber();
  }, [crossPositions, totalMarginBalance]);

  const formatRatioColor = (ratio: number) => {
    if (ratio >= 90) return 'text-danger font-bold';
    if (ratio >= 70) return 'text-amber-500 font-semibold';
    return 'text-success font-medium';
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Liquidation Alerts" width="w-[450px]">
      <div className="space-y-4">
        {/* SwiftEx Connection Notice */}
        {!isSwiftExConnected ? (
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
            <div className="flex items-start gap-2.5">
              <Smartphone className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
              <div className="text-[12px] leading-relaxed">
                <span className="font-semibold block mb-0.5 text-amber-300">
                  SwiftEx Mobile Push Inactive
                </span>
                Connect using the <strong>SwiftEx Mobile App</strong> to receive instant liquidation
                push notifications on your phone. Trading is fully supported with all wallets.
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between p-3 rounded-xl bg-success-bg border border-success/30 text-success text-xs">
            <div className="flex items-center gap-2 font-medium">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>SwiftEx Push Active</span>
            </div>
            <span className="text-[11px] font-mono-tabular opacity-85">
              {userDevice?.model || 'Mobile Device'}
            </span>
          </div>
        )}

        {/* Master Switch */}
        <div className="flex items-center justify-between p-3.5 rounded-xl bg-tertiary border border-color">
          <div>
            <div className="text-[13px] font-semibold text-primary">Master Alerts Switch</div>
            <div className="text-[11.5px] text-muted">
              {settings.enabled ? 'Push alerts enabled for open positions' : 'All alerts muted'}
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={settings.enabled}
            onClick={() => {
              setEnabled(wallet, !settings.enabled);
              if (onSyncNow) onSyncNow();
            }}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              settings.enabled ? 'bg-primary' : 'bg-hover'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                settings.enabled ? 'translate-x-4' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Active Positions Risk Monitor */}
        <div className="space-y-2">
          <div className="text-[11px] font-semibold tracking-wider text-muted uppercase px-0.5">
            Monitored Positions ({activePositionsList.length})
          </div>

          {activePositionsList.length === 0 ? (
            <div className="py-7 px-4 text-center rounded-xl bg-tertiary/40 border border-dashed border-color text-muted text-xs flex flex-col items-center justify-center gap-2">
              <Bell className="w-5 h-5 text-muted/40" />
              <span>
                No open positions to monitor. When you open a position, liquidation alerts will
                appear here.
              </span>
            </div>
          ) : (
            <div className="space-y-2">
              {/* Cross Positions Row */}
              {crossPositions.length > 0 && (
                <div className="flex items-center justify-between p-3.5 rounded-xl bg-tertiary border border-color">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold text-primary">Cross Positions</span>
                      <span className="text-[9.5px] px-1.5 py-0.2 rounded bg-secondary text-muted font-medium border border-color">
                        {crossPositions.length} open
                      </span>
                    </div>
                    <div className="text-[11px] text-muted flex items-center gap-1">
                      Symbols: {crossPositions.map(p => normalizeSymbol(p.symbol)).join(', ')}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="text-[9.5px] text-muted">Margin Ratio</div>
                      <div
                        className={`text-xs font-mono-tabular ${formatRatioColor(crossRatioPct)}`}
                      >
                        {crossRatioPct > 0 ? `${crossRatioPct.toFixed(1)}%` : '< 10%'}
                      </div>
                    </div>
                    <button
                      onClick={() => toggleMuteKey(wallet, 'cross')}
                      disabled={!settings.enabled}
                      className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                        settings.mutedKeys.includes('cross')
                          ? 'bg-amber-500/15 border-amber-500/30 text-amber-400'
                          : 'bg-secondary border-color text-muted hover:text-primary'
                      }`}
                      title={settings.mutedKeys.includes('cross') ? 'Unmute Cross' : 'Mute Cross'}
                    >
                      {settings.mutedKeys.includes('cross') ? (
                        <BellOff className="w-3.5 h-3.5" />
                      ) : (
                        <Bell className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Isolated Positions Rows */}
              {isolatedPositions.map(pos => {
                const normSym = normalizeSymbol(pos.symbol);
                const isLong = parseFloat(String(pos.size || '0')) > 0;
                const sideStr = isLong ? 'LONG' : 'SHORT';
                const muteKey = `iso:${normSym}:${sideStr}`;
                const isMuted = settings.mutedKeys.includes(muteKey);

                const amt = Math.abs(parseFloat(String(pos.size || '0')));
                const mark = parseFloat(String(pos.markPrice || '0'));
                const notional = amt * mark;
                const maint = notional * 0.05;
                const isoWallet = parseFloat(String(pos.isolatedMargin || '1'));
                const ratio = isoWallet > 0 ? (maint / isoWallet) * 100 : 0;

                return (
                  <div
                    key={muteKey}
                    className="flex items-center justify-between p-3.5 rounded-xl bg-tertiary border border-color"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold text-primary">{normSym}</span>
                        <span
                          className={`text-[9.5px] px-1 py-0.2 rounded font-semibold ${
                            isLong ? 'bg-success-bg text-success' : 'bg-danger-bg text-danger'
                          }`}
                        >
                          {sideStr} · Isolated
                        </span>
                      </div>
                      <div className="text-[11px] text-muted">
                        Size: {pos.size} @ {pos.markPrice}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className="text-[9.5px] text-muted">Margin Ratio</div>
                        <div className={`text-xs font-mono-tabular ${formatRatioColor(ratio)}`}>
                          {ratio > 0 ? `${ratio.toFixed(1)}%` : '< 10%'}
                        </div>
                      </div>
                      <button
                        onClick={() => toggleMuteKey(wallet, muteKey)}
                        disabled={!settings.enabled}
                        className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                          isMuted
                            ? 'bg-amber-500/15 border-amber-500/30 text-amber-400'
                            : 'bg-secondary border-color text-muted hover:text-primary'
                        }`}
                        title={isMuted ? 'Unmute Position' : 'Mute Position'}
                      >
                        {isMuted ? (
                          <BellOff className="w-3.5 h-3.5" />
                        ) : (
                          <Bell className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className="pt-3 border-t border-color flex items-center gap-2 text-[11px] text-muted">
          <AlertCircle size={14} className="text-primary shrink-0" />
          <span>Alerts fire at 70%, 90% and 100% margin ratio (100% = liquidation).</span>
        </div>
      </div>
    </Modal>
  );
};
