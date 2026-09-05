import { Check, Copy, Search, SearchX, X } from 'lucide-react';
import { type FC, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AutoSizer } from 'react-virtualized-auto-sizer';
import { FixedSizeList } from 'react-window';

import {
  type NearIntentToken,
  fetchNearIntentTokens,
  getEvmChainId,
} from '../../evm/feature/swap/services/oneClickApi';
import { getTokensForChain } from '../../evm/service/tokenListService';
import { getChainById, getChainsForNetwork } from '../../evm/utils/Chainregistry';
import {
  getEVMChains,
  getStellarConfig,
  isStellarChainId,
} from '../../walletconnect/config/chains';
import { useWalletAssets } from '../../walletconnect/hooks/useWalletAssets';
import { useWalletStore } from '../../walletconnect/store/walletConnectStore';
import { portfolioUtils } from '../../walletconnect/utils/portfolioUtils';
import { useAssetSelectorModal } from './useAssetSelectorModal';

const ROW_HEIGHT = 72;
const DYDX_CHAIN_ID = 'dydx-mainnet-1';

interface NetworkOption {
  id: string | number;
  name: string;
  logo?: string;
  sendEnable: boolean;
  receiveEnable: boolean;
  bridgeEnable: boolean;
  swapEnable: boolean;
}

const AssetSelectorModal: FC = () => {
  const navigate = useNavigate();
  const {
    isOpen,
    actionType,
    defaultNetwork,
    forceNetwork,
    pairedChainId,
    showAllStellarAssets,
    onSelect,
    closeAssetSelector,
  } = useAssetSelectorModal();
  const { network: currentNetwork, connectedWallets } = useWalletStore();
  const { assets: walletAssets } = useWalletAssets(currentNetwork);

  const isChainConnected = useCallback(
    (cId: string | number | undefined) => {
      if (!cId) return false;
      if (cId === 'pubnet' || cId === 'testnet' || cId === 'stellar') {
        return !!connectedWallets.stellar?.address;
      }

      return !!connectedWallets.evm?.address;
    },
    [connectedWallets]
  );

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNetwork, setSelectedNetwork] = useState<string | number>('all');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [registryVersion, setRegistryVersion] = useState(0);
  const [nearTokens, setNearTokens] = useState<NearIntentToken[]>([]);

  useEffect(() => {
    fetchNearIntentTokens().then(setNearTokens).catch(console.error);
  }, []);

  useEffect(() => {
    const handleUpdate = () => setRegistryVersion(v => v + 1);
    window.addEventListener('dynamic_assets_registered', handleUpdate);
    return () => window.removeEventListener('dynamic_assets_registered', handleUpdate);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setSelectedNetwork(forceNetwork || defaultNetwork || 'all');
      setSearchQuery('');
    }
  }, [isOpen, defaultNetwork, forceNetwork]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const networks = useMemo(() => {
    const stellarConfig = getStellarConfig(currentNetwork);
    const allNetworks: NetworkOption[] = [
      {
        id: 'all',
        name: 'All Networks',
        sendEnable: true,
        receiveEnable: true,
        bridgeEnable: true,
        swapEnable: true,
      },
      ...getEVMChains(currentNetwork).map(
        c =>
          ({
            id: c.chainId,
            name: c.name,
            logo: c.logoUrl,
            ...getChainById(c.chainId),
          }) as any
      ),
      {
        id: stellarConfig.chainId,
        name: 'Stellar',
        logo: stellarConfig.logoUrl,
        ...getChainById(stellarConfig.chainId),
      } as any,
    ];

    return allNetworks.filter(net => {
      if (forceNetwork && net.id !== forceNetwork) return false;
      if (net.id === 'all' && forceNetwork) return false;
      if (net.id === 'all') return true;
      // On testnet, always show ALL chains in every action type —
      // testnet EVM chains have swapEnable/bridgeEnable: false to avoid production routing,
      // but we still want them visible in the UI for testing purposes.
      if (currentNetwork === 'testnet') return true;
      if (actionType === 'SEND') return net.sendEnable;
      if (actionType === 'RECEIVE') return net.receiveEnable;
      if (actionType === 'SWAP') return net.swapEnable;
      if (actionType === 'BRIDGE') return net.bridgeEnable;
      return true;
    });
  }, [currentNetwork, actionType, forceNetwork]);

  const allNetworkOption = networks[0];
  const chainNetworks = networks.slice(1);

  const effectiveActionType = useMemo(() => {
    if (selectedNetwork === 'all') return actionType;
    if (pairedChainId && selectedNetwork !== pairedChainId) {
      if (actionType === 'SWAP' || actionType === 'BRIDGE') return 'BRIDGE';
    }
    if (pairedChainId && selectedNetwork === pairedChainId) {
      if (actionType === 'SWAP' || actionType === 'BRIDGE') return 'SWAP';
    }
    return actionType;
  }, [selectedNetwork, pairedChainId, actionType]);

  const filteredAssets = useMemo(() => {
    let result: any[] = [];
    const stellarConfig = getStellarConfig(currentNetwork);

    if (effectiveActionType === 'SEND') {
      // SEND: show only portfolio tokens (user must have balance to send)
      walletAssets.forEach(wa => {
        const isWANative =
          !!wa.isNative ||
          !wa.address ||
          wa.address.toLowerCase() === '0x0000000000000000000000000000000000000000' ||
          wa.address.toLowerCase() === 'native';
        result.push({
          id: `send-${wa.chainId}-${wa.symbol}-${isWANative ? 'native' : wa.address || ''}`,
          symbol: wa.symbol,
          name: wa.name,
          image: wa.image || '',
          chainId: wa.chainId,
          address: wa.address,
          decimals: wa.decimals,
          isNative: wa.isNative,
          balance: wa.balance || 0,
          chainType: wa.chainType,
        });
      });

      // On testnet EVM: show native tokens as fallback when portfolio is empty
      if (currentNetwork === 'testnet') {
        const evmTestnetChains = getChainsForNetwork('testnet').filter(
          c => typeof c.chainId === 'number'
        );
        evmTestnetChains.forEach(chainConfig => {
          const alreadyInResult = result.some(
            r => String(r.chainId) === String(chainConfig.chainId) && r.isNative
          );
          if (!alreadyInResult && chainConfig.nativeCurrency) {
            result.push({
              id: `send-${chainConfig.chainId}-${chainConfig.nativeCurrency.symbol}-native`,
              symbol: chainConfig.nativeCurrency.symbol,
              name: chainConfig.nativeCurrency.name,
              image: chainConfig.nativeCurrency.logoURI || chainConfig.logoURI || '',
              chainId: chainConfig.chainId,
              address: '0x0000000000000000000000000000000000000000',
              decimals: chainConfig.nativeCurrency.decimals,
              isNative: true,
              balance: 0,
              chainType: 'evm',
            });
          }
        });
      }

      // Stellar fallback for SEND
      const hasStellarInSend = result.some(
        r => r.chainType === 'stellar' || isStellarChainId(r.chainId)
      );
      if (!hasStellarInSend) {
        const stellarChainConfig = getChainById(stellarConfig.chainId);
        result.push({
          id: `send-${stellarConfig.chainId}-XLM-native`,
          symbol: 'XLM',
          name: 'Stellar Lumens',
          image:
            stellarChainConfig?.nativeCurrency?.logoURI ||
            stellarChainConfig?.logoURI ||
            'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/stellar/info/logo.png',
          chainId: stellarConfig.chainId,
          address: 'native',
          decimals: 7,
          isNative: true,
          balance: 0,
          chainType: 'stellar',
        });
      }
    } else if (
      effectiveActionType === 'RECEIVE' ||
      effectiveActionType === 'SWAP' ||
      effectiveActionType === 'BRIDGE'
    ) {
      // RECEIVE: show ALL registry tokens (user can receive any token, balance shown if available)
      // SWAP/BRIDGE: same registry-based approach
      const networkChainConfigs = getChainsForNetwork(currentNetwork as any);
      const allPossibleChains = [...networkChainConfigs.map(c => c.chainId), stellarConfig.chainId];
      if (currentNetwork === 'mainnet') {
        allPossibleChains.push(DYDX_CHAIN_ID);
      }

      const targetChains =
        selectedNetwork === 'all'
          ? Array.from(new Set(allPossibleChains)).filter(chainId => {
              const chainConfig = getChainById(chainId);
              if (!chainConfig) return false;
              // On testnet: include ALL chains (EVM + Stellar) for both SWAP and BRIDGE
              // so tokens are shown even when swapEnable/bridgeEnable is false
              if (currentNetwork === 'testnet') return true;
              if (effectiveActionType === 'SWAP') {
                return chainConfig.swapEnabled || (chainConfig as any).swapEnable;
              }
              if (effectiveActionType === 'BRIDGE') return chainConfig.bridgeEnable;
              return true;
            })
          : [selectedNetwork];

      targetChains.forEach(activeChainId => {
        const registryTokens = getTokensForChain(activeChainId);
        // tokenListService now handles testnet EVM chains via src/data/testnet/evm-testnet-tokens.ts
        // so registryTokens will always be populated for known testnet chains.
        let validTokens = [...registryTokens];

        if (effectiveActionType === 'BRIDGE' && currentNetwork === 'mainnet') {
          const isStellarInvolved =
            isStellarChainId(activeChainId) || isStellarChainId(pairedChainId);

          if (isStellarInvolved && !showAllStellarAssets) {
            const intentsSupportedSymbols = nearTokens
              .filter(nt => {
                if (isStellarChainId(activeChainId)) {
                  return nt.blockchain?.toLowerCase().includes('stellar');
                }
                const tChainId = getEvmChainId(nt);
                return String(tChainId) === String(activeChainId);
              })
              .map(nt => nt.symbol.toUpperCase());

            const combinedSupportedSymbols = Array.from(new Set([...intentsSupportedSymbols]));

            if (combinedSupportedSymbols.length > 0) {
              validTokens = registryTokens.filter(t =>
                combinedSupportedSymbols.includes(t.symbol.toUpperCase())
              );
            }
          }
        }

        const customWalletAssetsForChain = walletAssets.filter(
          wa => String(wa.chainId) === String(activeChainId)
        );
        for (const wa of customWalletAssetsForChain) {
          const alreadyExists = validTokens.some(vt =>
            vt.isNative && wa.isNative
              ? vt.symbol.toUpperCase() === wa.symbol.toUpperCase()
              : (vt.address || '').toLowerCase() === (wa.address || '').toLowerCase()
          );
          if (!alreadyExists) {
            validTokens.push({
              chainId: activeChainId,
              address: wa.address || '',
              name: wa.name || wa.symbol,
              symbol: wa.symbol,
              decimals: wa.decimals || 7,
              logoURI: wa.image,
              isNative: wa.isNative,
              type: wa.chainType === 'stellar' ? 'STELLAR' : 'ERC20',
            });
          }
        }

        validTokens.forEach(t => {
          const isTNative =
            !!t.isNative ||
            !t.address ||
            t.address.toLowerCase() === '0x0000000000000000000000000000000000000000' ||
            t.address.toLowerCase() === 'native';
          result.push({
            id: `${effectiveActionType.toLowerCase()}-${activeChainId}-${t.symbol}-${isTNative ? 'native' : t.address || ''}`,
            symbol: t.symbol,
            name: t.name,
            image: t.logoURI,
            chainId: activeChainId,
            address: t.address,
            decimals: t.decimals,
            isNative: t.isNative,
            balance:
              walletAssets.find(w => {
                if (String(w.chainId) !== String(activeChainId)) return false;
                const wIsNative =
                  !!w.isNative ||
                  !w.address ||
                  w.address.toLowerCase() === '0x0000000000000000000000000000000000000000' ||
                  w.address.toLowerCase() === 'native';
                if (wIsNative && isTNative) {
                  return w.symbol.toUpperCase() === t.symbol.toUpperCase();
                }
                if (!wIsNative && !isTNative) {
                  if (
                    w.address &&
                    t.address &&
                    w.address.toLowerCase() === t.address.toLowerCase()
                  ) {
                    return true;
                  }
                  return w.symbol.toUpperCase() === t.symbol.toUpperCase();
                }
                return false;
              })?.balance || 0,
          });
        });
      });
    }

    if (selectedNetwork !== 'all') {
      result = result.filter(
        a =>
          String(a.chainId) === String(selectedNetwork) ||
          (isStellarChainId(selectedNetwork) &&
            (a.chainType === 'stellar' || isStellarChainId(a.chainId))) ||
          selectedNetwork === DYDX_CHAIN_ID
      );
    }

    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase();
      result = result.filter(
        a =>
          a.symbol.toLowerCase().includes(q) ||
          (a.name && a.name.toLowerCase().includes(q)) ||
          (a.address && q.length > 5 && a.address.toLowerCase().includes(q)) ||
          (a.address && a.address.toLowerCase() === q)
      );
    }

    return result.sort((a, b) => {
      if (a.isNative && !b.isNative) return -1;
      if (!a.isNative && b.isNative) return 1;
      return a.symbol.toLowerCase().localeCompare(b.symbol.toLowerCase());
    });
  }, [
    currentNetwork,
    walletAssets,
    selectedNetwork,
    debouncedSearch,
    effectiveActionType,
    pairedChainId,
    showAllStellarAssets,
    registryVersion,
    nearTokens,
  ]);

  const handleSelect = useCallback(
    (asset: any) => {
      const isAssetNative =
        !!asset.isNative ||
        !asset.address ||
        asset.address.toLowerCase() === '0x0000000000000000000000000000000000000000' ||
        asset.address.toLowerCase() === 'native';
      const addressVal = isAssetNative ? 'native' : asset.address;

      if (onSelect) {
        onSelect(asset);
        closeAssetSelector();
        if (actionType === 'SEND' || actionType === 'RECEIVE') {
          const path = actionType === 'SEND' ? '/send' : '/receive';
          const cId = isStellarChainId(asset.chainId)
            ? 'stellar'
            : asset.chainId === DYDX_CHAIN_ID
              ? 'dydx'
              : asset.chainId;
          navigate(`${path}?asset=${asset.symbol}&chainId=${cId}&address=${addressVal}`, {
            replace: true,
          });
        }
        return;
      }
      const cId = isStellarChainId(asset.chainId)
        ? 'stellar'
        : asset.chainId === DYDX_CHAIN_ID
          ? 'dydx'
          : asset.chainId;
      const path =
        actionType === 'SEND'
          ? '/send'
          : actionType === 'RECEIVE'
            ? '/receive'
            : actionType === 'BRIDGE'
              ? '/bridge'
              : '/swap';
      navigate(`${path}?asset=${asset.symbol}&chainId=${cId}&address=${addressVal}`, {
        replace: true,
      });
      closeAssetSelector();
    },
    [actionType, navigate, closeAssetSelector, onSelect]
  );

  const handleCopyAddress = useCallback((e: React.MouseEvent, asset: any) => {
    e.stopPropagation();
    if (!asset.address) return;
    navigator.clipboard.writeText(asset.address);
    setCopiedId(asset.id);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  const AssetRow = useCallback(
    ({ index, style }: any) => {
      const asset = filteredAssets[index];
      const chainConfig = getChainById(asset.chainId || 0);
      const showBalance = actionType === 'SEND' || actionType === 'SWAP' || actionType === 'BRIDGE';

      return (
        <div style={{ ...style, padding: '0 16px' }}>
          <div
            role="button"
            tabIndex={0}
            onClick={() => handleSelect(asset)}
            onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && handleSelect(asset)}
            className="group flex w-full items-center justify-between px-3 py-3 rounded-2xl hover:bg-bg-hover transition-all text-left cursor-pointer"
          >
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="relative flex-shrink-0">
                <img
                  src={asset.image || asset.logoURI}
                  alt=""
                  className="w-10 h-10 rounded-full bg-bg-tertiary object-cover"
                />
                {chainConfig?.logoURI && (
                  <img
                    src={chainConfig.logoURI}
                    alt=""
                    className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-bg-secondary"
                  />
                )}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[15px] font-bold text-text-primary">{asset.symbol}</span>
                  {asset.isNative ? (
                    <span className="text-[10px] bg-primary text-brand-primary px-1.5 py-1 rounded-md font-black uppercase">
                      Native
                    </span>
                  ) : (
                    <span className="text-[10px] bg-bg-tertiary text-text-secondary px-1.5 py-0.5 rounded-md font-bold uppercase overflow-hidden text-ellipsis whitespace-nowrap max-w-[80px]">
                      {asset.address?.slice(0, 6)}...{asset.address?.slice(-4)}
                    </span>
                  )}
                  {asset.address && !asset.isNative && (
                    <button
                      onClick={e => handleCopyAddress(e, asset)}
                      className="p-1 hover:bg-bg-tertiary rounded-md text-text-muted transition-colors"
                    >
                      {copiedId === asset.id ? (
                        <Check size={12} className="text-green-500" />
                      ) : (
                        <Copy size={12} />
                      )}
                    </button>
                  )}
                </div>
                <div className="text-xs text-text-secondary truncate">
                  {asset.name || asset.symbol}
                </div>
              </div>
            </div>
            {showBalance && (
              <div className="text-right ml-4">
                <div className="text-[14px] font-bold text-text-primary">
                  {isChainConnected(asset.chainId)
                    ? portfolioUtils.formatBalance(asset.balance || 0)
                    : '--'}
                </div>
              </div>
            )}
          </div>
        </div>
      );
    },
    [filteredAssets, handleSelect, actionType, copiedId, handleCopyAddress, isChainConnected]
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 backdrop-blur-sm">
      <div className="absolute inset-0" onClick={closeAssetSelector} />
      <div className="relative w-full max-w-lg bg-bg-secondary rounded-t-[28px] shadow-2xl flex flex-col h-[75vh] border border-divider border-b-0 animate-slide-up">
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-9 h-1 rounded-full bg-bg-tertiary" />
        </div>

        <div className="px-5 pt-3 pb-3 flex items-center justify-between">
          <h2 className="text-base font-bold text-text-primary uppercase tracking-widest">
            {effectiveActionType}
          </h2>
          <button
            onClick={closeAssetSelector}
            className="w-9 h-9 flex items-center justify-center bg-bg-tertiary rounded-full text-text-secondary hover:text-text-primary transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-5 pb-3">
          <div className="relative">
            <Search
              className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted"
              size={16}
            />
            <input
              type="text"
              placeholder="Search tokens"
              className="w-full bg-bg-primary border-none pl-11 pr-4 py-2.5 rounded-xl text-sm focus:ring-1 focus:ring-brand-primary/20 transition-all"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
        {!forceNetwork && (
          <div className="pb-3 flex items-center border-b border-divider">
            <div className="pl-5 pr-3 flex-shrink-0">
              <button
                onClick={() => setSelectedNetwork(allNetworkOption.id)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all"
                style={
                  selectedNetwork === 'all'
                    ? {
                        backgroundColor: '#3b4fd9',
                        color: '#fff',
                        boxShadow: '0 4px 12px #3b4fd940',
                      }
                    : undefined
                }
              >
                All
              </button>
            </div>

            <div className="w-px self-stretch bg-divider flex-shrink-0 my-1" />
            <div
              className="flex gap-2 px-3 flex-1 hide-scrollbar"
              style={{ overflowX: 'auto', minWidth: 0 }}
            >
              {chainNetworks.map(net => (
                <button
                  key={net.id}
                  onClick={() => setSelectedNetwork(net.id)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex-shrink-0"
                  style={
                    selectedNetwork === net.id
                      ? {
                          backgroundColor: '#3b4fd9',
                          color: '#fff',
                          boxShadow: '0 4px 12px #3b4fd940',
                        }
                      : undefined
                  }
                >
                  {net.logo && <img src={net.logo} alt="" className="w-4 h-4 rounded-full" />}
                  {net.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex-1 overflow-hidden">
          {filteredAssets.length > 0 ? (
            <AutoSizer
              renderProp={({ height, width }) => (
                <FixedSizeList
                  height={height || 0}
                  itemCount={filteredAssets.length}
                  itemSize={ROW_HEIGHT}
                  width={width || 0}
                >
                  {AssetRow}
                </FixedSizeList>
              )}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center px-10">
              <div className="w-16 h-16 bg-bg-tertiary rounded-full flex items-center justify-center mb-4">
                <SearchX size={32} className="text-text-muted opacity-25" />
              </div>
              <h3 className="text-base font-bold text-text-primary mb-1">No assets found</h3>
              <p className="text-sm text-text-secondary leading-relaxed">
                {searchQuery
                  ? `No results for "${searchQuery}" on this network.`
                  : 'No assets available on this network.'}
              </p>
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="mt-6 text-brand-primary font-bold text-xs uppercase tracking-widest hover:underline"
                >
                  Clear search
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AssetSelectorModal;
