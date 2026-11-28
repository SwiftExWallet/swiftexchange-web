import { Bell, BellOff } from 'lucide-react';
import React, { useState } from 'react';

import { useWalletStore } from '../../../walletconnect/store/walletConnectStore';
import { usePositionStore } from '../../core/stores/positionStore';
import { useAlertSettingsStore } from '../alertSettingsStore';
import { usePerpsAlertsSync } from '../usePerpsAlertsSync';
import { LiquidationAlertsModal } from './LiquidationAlertsModal';

export const AlertsBellButton: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);

  const session = useWalletStore(state => state.session);
  const evmAddress = useWalletStore(state => state.connectedWallets.evm?.address);

  const rawWallet = evmAddress || session?.namespaces?.eip155?.accounts?.[0]?.split(':')?.[2] || '';
  const wallet = rawWallet.toLowerCase();

  const getSettings = useAlertSettingsStore(state => state.getSettings);
  const settings = getSettings(wallet);

  const { isSwiftExConnected, syncSnapshot } = usePerpsAlertsSync();
  const positions = usePositionStore(state => state.positions);
  const hasOpenPositions = Object.values(positions).some(
    p => p.size && parseFloat(String(p.size)) !== 0
  );

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="relative flex items-center justify-center w-8 h-8 rounded-lg hover:bg-tertiary transition-colors text-muted hover:text-primary focus:outline-none"
        title={
          !isSwiftExConnected
            ? 'Liquidation Alerts (Connect via SwiftEx App for mobile push)'
            : settings.enabled
              ? 'Liquidation Alerts Active'
              : 'Liquidation Alerts Muted'
        }
      >
        {!settings.enabled ? (
          <BellOff className="w-4 h-4 text-muted/60" />
        ) : (
          <Bell className="w-4 h-4" />
        )}

        {/* Status Dot */}
        {isSwiftExConnected && settings.enabled && hasOpenPositions && (
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-success ring-2 ring-secondary animate-pulse" />
        )}
      </button>

      <LiquidationAlertsModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onSyncNow={() => syncSnapshot(true)}
      />
    </>
  );
};
