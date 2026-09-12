import React, { useState } from 'react';

import { useAsterAgent } from '../../adapters/aster/hooks/useAsterAgent';
import { useAsterDataSync } from '../../adapters/aster/hooks/useAsterDataSync';
import { useHyperliquidAgent } from '../../adapters/hyperliquid/hooks/useHyperliquidAgent';
import { useHyperliquidDataStream } from '../../adapters/hyperliquid/hooks/useHyperliquidDataStream';
import { useOrderEntryStore } from '../../core/stores/orderEntryStore';
import { MobileChartScreen } from './MobileChartScreen';
import { MobileTradeScreen } from './MobileTradeScreen';

interface MobilePerpsViewProps {
  sidebar?: React.ReactNode;
}

export const MobilePerpsView: React.FC<MobilePerpsViewProps> = ({ sidebar }) => {
  const asterAgent = useAsterAgent();
  const hyperliquidAgent = useHyperliquidAgent();

  // Sync real live balances, positions, and orders on mobile
  useAsterDataSync(asterAgent.asterSigner, asterAgent.userAddr);
  useHyperliquidDataStream(hyperliquidAgent.userAddr);

  const [currentScreen, setCurrentScreen] = useState<'chart' | 'trade'>('chart');
  const [tradeSide, setTradeSide] = useState<'BUY' | 'SELL'>('BUY');
  const setSideInStore = useOrderEntryStore(state => state.setSide);

  const handleOpenTrade = (side: 'BUY' | 'SELL') => {
    setTradeSide(side);
    setSideInStore(side);
    setCurrentScreen('trade');
  };

  return (
    <div className="flex flex-col h-[calc(100dvh-3.5rem)] w-full bg-secondary font-body text-primary relative overflow-hidden">
      {sidebar}

      {currentScreen === 'chart' ? (
        <MobileChartScreen onOpenTrade={handleOpenTrade} />
      ) : (
        <MobileTradeScreen
          side={tradeSide}
          onSwitchSide={side => {
            setTradeSide(side);
            setSideInStore(side);
          }}
          onBack={() => setCurrentScreen('chart')}
        />
      )}
    </div>
  );
};
