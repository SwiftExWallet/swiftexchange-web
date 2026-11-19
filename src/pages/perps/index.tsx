import React from 'react';

import { ExchangeLayout } from '../../modules/perps/components/layout';
import { useDynamicExchange } from '../../modules/perps/hooks/useDynamicExchange';

const PerpetualsTradingPage: React.FC = () => {
  useDynamicExchange();

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-bg-primary">
      <ExchangeLayout />
    </div>
  );
};

export default PerpetualsTradingPage;
