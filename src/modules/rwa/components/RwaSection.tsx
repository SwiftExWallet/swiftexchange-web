import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { WalletType } from '@/modules/walletconnect/constants/Wallet';
import { useWalletConnect } from '@/modules/walletconnect/hooks/useWalletConnect';

import { groupByKey } from '../data/groups';
import { useOrderTracker } from '../hooks/useOrderTracker';
import { useRwaAvailability } from '../hooks/useRwaAvailability';
import { useRwaHoldings } from '../hooks/useRwaHoldings';
import { hasAttested, saveAttestation } from '../storage/attestation';
import type { RwaGroup, RwaOrderRecord } from '../types/rwa.types';
import { AttestationModal } from './AttestationModal';
import { OrderProgressModal } from './OrderProgressModal';
import { RwaHome } from './RwaHome';
import { RwaTradePanel } from './RwaTradePanel';

interface RwaSectionProps {
  onBackToTokens: () => void;
}

export const RwaSection: React.FC<RwaSectionProps> = ({ onBackToTokens }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { connectedWallets } = useWalletConnect();
  const evmAddress = connectedWallets[WalletType.EVM]?.address || null;
  const stellarAddress = connectedWallets[WalletType.STELLAR]?.address || null;

  const { rwaVisible, country, assets } = useRwaAvailability();
  const {
    holdings,
    loading: holdingsLoading,
    refresh: refreshHoldings,
  } = useRwaHoldings({
    evmAddress,
    stellarAddress,
    assets,
    enabled: rwaVisible,
  });
  const { orders, reload: reloadOrders } = useOrderTracker(evmAddress, refreshHoldings);

  const [attested, setAttested] = useState(() => hasAttested(evmAddress));
  const [activeOrder, setActiveOrder] = useState<RwaOrderRecord | null>(null);

  useEffect(() => {
    setAttested(hasAttested(evmAddress));
  }, [evmAddress]);

  const assetKey = searchParams.get('asset');
  const sideParam = searchParams.get('side');
  const selectedGroup: RwaGroup | null = useMemo(() => groupByKey(assetKey), [assetKey]);
  const tradeSide: 'buy' | 'sell' = sideParam === 'sell' ? 'sell' : 'buy';

  const updateParams = (asset: string | null, side: 'buy' | 'sell' | null) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', 'rwa');
    if (asset) next.set('asset', asset);
    else next.delete('asset');
    if (side) next.set('side', side);
    else next.delete('side');
    setSearchParams(next);
  };

  if (!rwaVisible) return null;

  return (
    <>
      <AttestationModal
        open={Boolean(evmAddress) && !attested}
        country={country}
        onAccept={() => {
          saveAttestation(evmAddress, country);
          setAttested(true);
        }}
        onDecline={onBackToTokens}
      />

      <OrderProgressModal
        record={activeOrder ? orders.find(o => o.id === activeOrder.id) || activeOrder : null}
        onClose={() => setActiveOrder(null)}
      />

      {selectedGroup ? (
        <RwaTradePanel
          group={selectedGroup}
          side={tradeSide}
          holdings={holdings}
          onSideChange={s => updateParams(selectedGroup.key, s)}
          onBack={() => updateParams(null, null)}
          onOrderStarted={rec => {
            setActiveOrder(rec);
            reloadOrders();
          }}
          onOrderUpdated={rec => {
            setActiveOrder(rec);
            reloadOrders();
          }}
        />
      ) : (
        <RwaHome
          assets={assets}
          holdings={holdings}
          holdingsLoading={holdingsLoading}
          orders={orders}
          onRefreshHoldings={refreshHoldings}
          onSelectGroup={g => updateParams(g.key, 'buy')}
          onSelectOrder={setActiveOrder}
        />
      )}
    </>
  );
};
