import { useEffect, useRef, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';

import { useSwapStore } from '../../../../../store/swapStore';
import { getStellarConfig } from '../../../../walletconnect/config/chains';
import { WalletType } from '../../../../walletconnect/constants/Wallet';
import {
  getEvmChainsForNetwork,
  getEvmSwapEnabledChains,
  isEvmChain,
} from '../../../utils/Chainregistry';
import { switchOrAddChain } from '../../../utils/evmChainUtils';
import { isStellar } from '../utils/swapAssetUtils';

export function useSwapAssetDefaults(params: {
  connectedWallets: any;
  currentChainId: number | null;
  currentNetwork: 'mainnet' | 'testnet';
  isConnected?: boolean;
  getProvider: (type: WalletType) => any;
}) {
  const { connectedWallets, currentChainId, currentNetwork, getProvider } = params;
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const locationState = location.state as { selectedAsset?: any; isPerp?: boolean };

  const {
    fromChainId,
    setFromChainId,
    toChainId,
    setToChainId,
    sellAssetSymbol,
    setSellAssetSymbol,
    sellAssetAddress,
    setSellAssetAddress,
    buyAssetSymbol,
    setBuyAssetSymbol,
    buyAssetAddress,
    setBuyAssetAddress,
    resetInputs,
  } = useSwapStore();

  const [isChainSwitching, setIsChainSwitching] = useState<boolean>(false);
  const hasInitializedDefaults = useRef(false);

  const urlParamsApplied = useRef(false);

  const parseChainId = (param: string): number | string => {
    if (param === 'stellar' || param === 'pubnet' || param === 'testnet') {
      return getStellarConfig(currentNetwork).chainId;
    }
    const n = Number(param);
    return isNaN(n) ? param : n;
  };

  useEffect(() => {
    const stellarId = getStellarConfig(currentNetwork).chainId;
    if (isStellar(fromChainId) && fromChainId !== stellarId) {
      setFromChainId(stellarId);
    }
    if (isStellar(toChainId) && toChainId !== stellarId) {
      setToChainId(stellarId);
    }
  }, [currentNetwork, fromChainId, toChainId, setFromChainId, setToChainId]);

  useEffect(() => {
    if (locationState?.selectedAsset) {
      const asset = locationState.selectedAsset;
      const targetChainId =
        asset.chainType === 'stellar'
          ? getStellarConfig(currentNetwork).chainId
          : asset.chainId || 1;
      setFromChainId(targetChainId);
      setSellAssetSymbol(asset.symbol);
      setSellAssetAddress(asset.address || '');
      if (locationState.isPerp) setToChainId(targetChainId);
      urlParamsApplied.current = true;
      hasInitializedDefaults.current = true;
      return;
    }

    const fromParam = searchParams.get('fromChainId');
    const toParam = searchParams.get('toChainId');
    const sellAssetParam = searchParams.get('sellAsset');
    const sellAddressParam = searchParams.get('sellAddress');
    const buyAssetParam = searchParams.get('buyAsset');
    const buyAddressParam = searchParams.get('buyAddress');

    if (fromParam || toParam || sellAssetParam) {
      if (fromParam) setFromChainId(parseChainId(fromParam));
      if (toParam) setToChainId(parseChainId(toParam));
      if (sellAssetParam) setSellAssetSymbol(sellAssetParam);
      if (sellAddressParam) setSellAssetAddress(sellAddressParam);
      if (buyAssetParam) setBuyAssetSymbol(buyAssetParam);
      if (buyAddressParam) setBuyAssetAddress(buyAddressParam);
      urlParamsApplied.current = true;
      hasInitializedDefaults.current = true;
      return;
    }

    urlParamsApplied.current = true;
  }, [locationState, searchParams, currentNetwork]);

  useEffect(() => {
    if (hasInitializedDefaults.current) return;

    const stored = useSwapStore.getState();
    const hasStoredSelection =
      stored.sellAssetSymbol !== '' ||
      isStellar(stored.fromChainId) ||
      (stored.fromChainId !== 'pubnet' &&
        stored.fromChainId !== 'testnet' &&
        stored.fromChainId !== 1);

    if (hasStoredSelection) {
      hasInitializedDefaults.current = true;
      return;
    }

    const stellarId = getStellarConfig(currentNetwork).chainId;

    if (connectedWallets[WalletType.STELLAR]) {
      setFromChainId(stellarId);
      setToChainId(stellarId);
    } else if (connectedWallets[WalletType.EVM] && currentChainId) {
      const swapEnabledChains = getEvmSwapEnabledChains(currentNetwork);
      if (swapEnabledChains.some(c => c.chainId === currentChainId)) {
        setFromChainId(currentChainId);
        setToChainId(currentChainId);
      } else {
        // Testnet EVM chains have swapEnable: false — still use connected chain as default
        // so swap screen shows EVM chains instead of defaulting to Stellar
        const evmTestnetChains = getEvmChainsForNetwork(currentNetwork);
        const matchedChain = evmTestnetChains.find(c => c.chainId === currentChainId);
        if (matchedChain) {
          setFromChainId(currentChainId);
          setToChainId(currentChainId);
        } else if (evmTestnetChains.length > 0) {
          setFromChainId(evmTestnetChains[0].chainId);
          setToChainId(evmTestnetChains[0].chainId);
        } else {
          setFromChainId(stellarId);
          setToChainId(stellarId);
        }
      }
    } else {
      setFromChainId(stellarId);
      setToChainId(stellarId);
    }

    hasInitializedDefaults.current = true;
  }, [connectedWallets, currentChainId, currentNetwork]);

  useEffect(() => {
    if (!urlParamsApplied.current) return;
    const params = new URLSearchParams();
    params.set('fromChainId', String(fromChainId));
    params.set('toChainId', String(toChainId));
    if (sellAssetSymbol) params.set('sellAsset', sellAssetSymbol);
    if (sellAssetAddress) params.set('sellAddress', sellAssetAddress);
    if (buyAssetSymbol) params.set('buyAsset', buyAssetSymbol);
    if (buyAssetAddress) params.set('buyAddress', buyAssetAddress);
    setSearchParams(params, { replace: true });
  }, [
    fromChainId,
    toChainId,
    sellAssetSymbol,
    sellAssetAddress,
    buyAssetSymbol,
    buyAssetAddress,
    // setSearchParams intentionally omitted: React Router v6 returns a new reference
    // on every render, which would cause this effect to re-run (and re-navigate)
    // on every keystroke. setSearchParams is stable once the router is mounted.
  ]);

  const isInitialMount = useRef(true);
  const prevChainIds = useRef({ from: fromChainId, to: toChainId });
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      prevChainIds.current = { from: fromChainId, to: toChainId };
      return;
    }
    if (prevChainIds.current.from !== fromChainId || prevChainIds.current.to !== toChainId) {
      resetInputs();
      prevChainIds.current = { from: fromChainId, to: toChainId };
    }
  }, [fromChainId, toChainId, resetInputs]);

  // Note: locationState?.selectedAsset handling is covered by the combined URL-params
  // effect above (lines 67-103), which sets hasInitializedDefaults.current = true and
  // returns early on subsequent renders. The duplicate effect was removed because it
  // had no initialization guard and re-fired setFromChainId/setSellAssetSymbol on
  // every dependency change, overriding user selections made after mount.

  const lastAttemptedChainIdRef = useRef<string | number | null>(null);

  useEffect(() => {
    if (currentChainId !== null && String(currentChainId) === String(fromChainId)) {
      lastAttemptedChainIdRef.current = null;
    }
  }, [currentChainId, fromChainId]);

  useEffect(() => {
    if (
      connectedWallets[WalletType.EVM] &&
      isEvmChain(fromChainId) &&
      currentChainId !== null &&
      String(currentChainId) !== String(fromChainId) &&
      !isChainSwitching &&
      lastAttemptedChainIdRef.current !== fromChainId
    ) {
      let active = true;
      lastAttemptedChainIdRef.current = fromChainId;

      const autoSwitchChain = async () => {
        setIsChainSwitching(true);
        try {
          const provider = getProvider(WalletType.EVM);
          if (provider) {
            await switchOrAddChain(provider, fromChainId);
          }
        } catch (err) {
          console.warn('[useSwapAssetDefaults] autoSwitchChain delayed or rejected:', err);
        } finally {
          if (active) {
            setIsChainSwitching(false);
          }
        }
      };
      autoSwitchChain();
      return () => {
        active = false;
      };
    }
  }, [fromChainId, currentChainId, connectedWallets, isChainSwitching, getProvider]);

  return {
    isChainSwitching,
    setIsChainSwitching,
    hasInitializedDefaults,
  };
}
