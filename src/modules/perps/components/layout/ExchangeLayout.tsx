import React from 'react';
import type { ReactNode } from 'react';

import { useIsMobile } from '../chart/hooks/useIsMobile';
import { MobilePerpsView } from '../mobile/MobilePerpsView';
import { ExchangeChartPanel, ExchangePositionsPanel } from './ExchangeLeftPanel';
import { ExchangeAccountPanel, ExchangeOrderFormPanel } from './ExchangeRightPanel';
import { ExchangeSwitchingOverlay } from './ExchangeSwitchingOverlay';
import { OrderbookPanel } from './OrderbookPanel';

interface ExchangeLayoutProps {
  sidebar?: ReactNode;
}

export const ExchangeLayout: React.FC<ExchangeLayoutProps> = ({ sidebar }) => {
  const isMobile = useIsMobile();

  if (isMobile) {
    return <MobilePerpsView sidebar={sidebar} />;
  }

  return (
    <div className="flex flex-col h-[calc(100vh-60px)] w-full bg-primary font-body text-primary overflow-x-hidden overflow-y-auto relative">
      {sidebar}

      <div className="flex flex-col flex-1 p-1 gap-1 min-w-0 max-w-full h-full min-h-0">
        <div className="flex gap-1 min-w-0 h-[70%] min-h-[560px] max-h-[70%]">
          <div className="flex flex-col flex-1 bg-secondary rounded-lg overflow-hidden min-w-0 h-full min-h-0 border border-color">
            <ExchangeChartPanel />
          </div>

          <div className="w-[300px] shrink-0 h-full min-h-0 overflow-hidden">
            <OrderbookPanel />
          </div>
          <div className="w-[295px] shrink-0 h-full min-h-0 overflow-hidden">
            <ExchangeOrderFormPanel />
          </div>
        </div>

        <div className="flex gap-1 min-w-0 h-[38%] min-h-[220px] max-h-[38%]">
          <div className="flex-1 bg-secondary rounded-lg overflow-hidden flex flex-col  min-w-0 h-full min-h-0">
            <ExchangePositionsPanel />
          </div>
          <div className="w-[295px] shrink-0 h-full min-h-0 overflow-hidden">
            <ExchangeAccountPanel />
          </div>
        </div>
      </div>

      <ExchangeSwitchingOverlay />
    </div>
  );
};
