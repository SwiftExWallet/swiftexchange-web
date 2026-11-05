import { useEffect, useState } from 'react';

import { AmmSwapService } from '../../../../stellar/service/ammSwapService';
import { getStellarConfig } from '../../../../walletconnect/config/chains';
import { isStellar } from '../utils/swapAssetUtils';

export function useAmmService(
  fromChainId: number | string,
  toChainId: number | string,
  currentNetwork: 'mainnet' | 'testnet'
): AmmSwapService | null {
  const [ammService, setAmmService] = useState<AmmSwapService | null>(null);

  useEffect(() => {
    if (isStellar(fromChainId) || isStellar(toChainId)) {
      try {
        const config = getStellarConfig(currentNetwork);
        const service = new AmmSwapService(
          config.horizonUrl,
          config.networkPassphrase,
          config.chainId
        );
        setAmmService(service);
      } catch (err) {
        console.error('Failed to init AmmSwapService:', err);
        setAmmService(null);
      }
    } else {
      setAmmService(null);
    }
  }, [fromChainId, toChainId, currentNetwork]);

  return ammService;
}
