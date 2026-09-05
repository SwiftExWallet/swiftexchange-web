import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { validateAddress } from '../../../validator/AddressValidator';
import { addLocalTransaction } from '../../evm/service/localTransactionService';
import { getTokensForChain } from '../../evm/service/tokenListService';
import { CHAIN_REGISTRY, getChainById } from '../../evm/utils/Chainregistry';
import {
  buildAddTrustlineTransaction,
  checkTrustlineExists,
} from '../../stellar/service/stellarService';
import { useTransactionRouter } from '../../transaction/hook/useTransactionRouter';
import { WalletType } from '../../walletconnect/constants/Wallet';
import { useWalletConnect } from '../../walletconnect/hooks/useWalletConnect';
import { useWalletStore } from '../../walletconnect/store/walletConnectStore';

export const useReceiveAssets = () => {
  const { connectedWallets } = useWalletConnect();
  const { sendTransaction } = useTransactionRouter();
  const currentNetwork = useWalletStore(state => state.network);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [hasTrustline, setHasTrustline] = useState<boolean | null>(null);
  const [isAddingTrustline, setIsAddingTrustline] = useState(false);
  const [lastAutoEnbaledAsset, setLastAutoEnabledAsset] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  const assets = useMemo(() => {
    const list: any[] = [];
    const networkChains = CHAIN_REGISTRY.filter(
      c => c.networkType === currentNetwork && c.available
    );

    for (const config of networkChains) {
      if (!config.receiveEnable) continue;
      const isStellar = config.chainId === 'pubnet' || config.chainId === 'testnet';
      const chainPrefix = isStellar ? 'stellar' : 'evm';
      const walletType = isStellar ? WalletType.STELLAR : WalletType.EVM;
      const addressType = isStellar ? 'stellar' : 'evm';

      // 1. Native asset
      const nativeId = `${chainPrefix}-${config.chainId}-native`;
      list.push({
        id: nativeId,
        value: nativeId,
        symbol: config.nativeCurrency.symbol,
        name: config.nativeCurrency.name,
        image: config.nativeCurrency.logoURI || config.logoURI,
        label: `${config.nativeCurrency.symbol} (${config.name})`,
        network: config.name,
        chainId: config.chainId,
        chainType: addressType,
        walletType,
        decimals: config.nativeCurrency.decimals,
        tokenAddress: config.nativeCurrency.address,
        addressType,
        isNative: true,
      });

      // 2. Supported tokens
      const chainTokens = getTokensForChain(config.chainId);
      for (const t of chainTokens) {
        if (t.isNative || t.symbol.toUpperCase() === config.nativeCurrency.symbol.toUpperCase()) {
          continue;
        }
        const assetId = `${chainPrefix}-${config.chainId}-${t.symbol}`;
        list.push({
          id: assetId,
          value: assetId,
          symbol: t.symbol,
          name: t.name,
          image: t.logoURI,
          label: `${t.symbol} (${config.name})`,
          network: config.name,
          chainId: config.chainId,
          chainType: addressType,
          walletType,
          decimals: t.decimals,
          tokenAddress: t.address,
          addressType,
          isNative: false,
        });
      }
    }
    return list;
  }, [currentNetwork]);

  const assetParam = searchParams.get('asset');
  const chainIdParam = searchParams.get('chainId');
  const addressParam = searchParams.get('address');

  const currentAsset = useMemo(() => {
    if (assetParam && chainIdParam) {
      const stellarChainId = currentNetwork === 'testnet' ? 'testnet' : 'pubnet';
      const paramIdStr = chainIdParam === 'stellar' ? stellarChainId : String(chainIdParam);

      const found = assets.find(a => {
        const aChainIdStr = String(a.chainId);
        if (a.symbol.toUpperCase() !== assetParam.toUpperCase() || aChainIdStr !== paramIdStr)
          return false;

        if (addressParam) {
          const aIsNative =
            !!a.isNative ||
            !a.tokenAddress ||
            a.tokenAddress.toLowerCase() === '0x0000000000000000000000000000000000000000' ||
            a.tokenAddress.toLowerCase() === 'native';
          const paramIsNative =
            addressParam.toLowerCase() === 'native' ||
            addressParam.toLowerCase() === '0x0000000000000000000000000000000000000000';
          if (aIsNative !== paramIsNative) return false;
          if (!aIsNative && !paramIsNative) {
            return a.tokenAddress?.toLowerCase() === addressParam.toLowerCase();
          }
        }
        return true;
      });

      if (found) return found;

      // Fallback direct resolver
      const config = getChainById(paramIdStr);
      if (config) {
        const isStellar = config.chainId === 'pubnet' || config.chainId === 'testnet';
        const chainPrefix = isStellar ? 'stellar' : 'evm';
        const walletType = isStellar ? WalletType.STELLAR : WalletType.EVM;
        const addressType = isStellar ? 'stellar' : 'evm';
        const isNativeParam =
          !addressParam ||
          addressParam.toLowerCase() === 'native' ||
          addressParam.toLowerCase() === '0x0000000000000000000000000000000000000000';

        if (
          isNativeParam ||
          assetParam.toUpperCase() === config.nativeCurrency.symbol.toUpperCase()
        ) {
          return {
            id: `${chainPrefix}-${config.chainId}-native`,
            value: `${chainPrefix}-${config.chainId}-native`,
            symbol: config.nativeCurrency.symbol,
            name: config.nativeCurrency.name,
            image: config.nativeCurrency.logoURI || config.logoURI,
            label: `${config.nativeCurrency.symbol} (${config.name})`,
            network: config.name,
            chainId: config.chainId,
            chainType: addressType,
            walletType,
            decimals: config.nativeCurrency.decimals,
            tokenAddress: config.nativeCurrency.address,
            addressType,
            isNative: true,
          };
        }

        const chainTokens = getTokensForChain(config.chainId);
        const matched = chainTokens.find(
          t =>
            (addressParam &&
              addressParam.toLowerCase() !== 'native' &&
              t.address.toLowerCase() === addressParam.toLowerCase()) ||
            t.symbol.toUpperCase() === assetParam.toUpperCase()
        );

        if (matched) {
          return {
            id: `${chainPrefix}-${config.chainId}-${matched.symbol}`,
            value: `${chainPrefix}-${config.chainId}-${matched.symbol}`,
            symbol: matched.symbol,
            name: matched.name,
            image: matched.logoURI,
            label: `${matched.symbol} (${config.name})`,
            network: config.name,
            chainId: config.chainId,
            chainType: addressType,
            walletType,
            decimals: matched.decimals,
            tokenAddress: matched.address,
            addressType,
            isNative: false,
          };
        }
      }
    }
    return undefined;
  }, [assets, assetParam, chainIdParam, addressParam, currentNetwork]);

  useEffect(() => {
    if (!assetParam || !chainIdParam) {
      if (assets.length > 0) {
        const connectedFirst = assets.find(a => {
          return !!connectedWallets[a.walletType as WalletType];
        });

        const fallback = connectedFirst ?? assets[0];
        const targetChainId =
          fallback.chainId === 'pubnet' || fallback.chainId === 'testnet'
            ? 'stellar'
            : String(fallback.chainId);

        setSearchParams({ asset: fallback.symbol, chainId: targetChainId }, { replace: true });
      }
    }
  }, [assets, assetParam, chainIdParam, setSearchParams, connectedWallets]);

  const walletAddress = useMemo(() => {
    if (!currentAsset) return '';
    const walletType = currentAsset.walletType as WalletType;
    return connectedWallets[walletType]?.address || '';
  }, [connectedWallets, currentAsset]);

  const isAddressValid = useMemo(() => {
    if (!walletAddress || !currentAsset) return false;
    return validateAddress(walletAddress, {
      addressType: currentAsset.addressType as any,
      network: currentAsset.network,
    });
  }, [walletAddress, currentAsset]);

  useEffect(() => {
    const checkTrust = async () => {
      if (currentAsset?.chainType === 'stellar' && !currentAsset.isNative && walletAddress) {
        setHasTrustline(null);
        try {
          const exists = await checkTrustlineExists(
            walletAddress,
            currentAsset.symbol,
            currentAsset.tokenAddress
          );
          setHasTrustline(exists);
        } catch (e) {
          console.error('Trustline check error:', e);
          setHasTrustline(false);
        }
      } else {
        setHasTrustline(true);
      }
    };
    checkTrust();
  }, [currentAsset, walletAddress]);

  const handleAddTrustline = useCallback(async () => {
    if (!currentAsset || !walletAddress || isAddingTrustline) return;
    setIsAddingTrustline(true);
    try {
      const xdr = await buildAddTrustlineTransaction(
        walletAddress,
        currentAsset.symbol,
        currentAsset.tokenAddress
      );
      const res = await sendTransaction({
        type: 'stellar',
        network: currentAsset.network,
        networkKey: currentNetwork === 'testnet' ? 'testnet' : 'pubnet',
        from: walletAddress,
        to: '',
        amount: '0',
        data: { xdr, network: currentNetwork === 'testnet' ? 'TESTNET' : 'PUBLIC' },
      });

      if (res.status === 'success') {
        addLocalTransaction({
          hash: res.hash || '',
          chainId: 'pubnet',
          type: 'trustline',
          timestamp: Date.now(),
          status: 'success',
          from: walletAddress,
          network: currentNetwork,
          description: `Add trustline for ${currentAsset.symbol}`,
        });
        setHasTrustline(true);
      } else {
        throw new Error(res.error || 'Failed to add trustline');
      }
    } catch (e: any) {
      console.error('Add trustline error:', e);
      setCopyFeedback(`Error: ${e.message}`);
      setTimeout(() => setCopyFeedback(null), 3000);
    } finally {
      setIsAddingTrustline(false);
    }
  }, [currentAsset, walletAddress, isAddingTrustline, sendTransaction, currentNetwork]);

  useEffect(() => {
    // Auto-trigger trustline addition ONLY if it's missing AND we haven't tried for THIS asset in this session
    if (
      hasTrustline === false &&
      currentAsset &&
      walletAddress &&
      !isAddingTrustline &&
      lastAutoEnbaledAsset !== currentAsset.id
    ) {
      setLastAutoEnabledAsset(currentAsset.id);
      // Wait a bit to avoid flashing when switching assets
      const timer = setTimeout(() => {
        handleAddTrustline();
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [
    hasTrustline,
    currentAsset,
    walletAddress,
    isAddingTrustline,
    lastAutoEnbaledAsset,
    handleAddTrustline,
  ]);

  const handleCopy = useCallback(async () => {
    if (!walletAddress || !isAddressValid) return;
    try {
      await navigator.clipboard.writeText(walletAddress);
      setCopyFeedback(`Address copied!`);
      setTimeout(() => setCopyFeedback(null), 2000);
    } catch {
      setCopyFeedback('Failed to copy');
    }
  }, [walletAddress, isAddressValid]);

  const handleShare = useCallback(async () => {
    if (!walletAddress || !isAddressValid) return;
    const symbol = currentAsset?.symbol || 'asset';
    const text = `Send ${symbol} to my wallet:\n\nAddress: ${walletAddress}\nNetwork: ${currentAsset?.network}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: `My ${symbol} address`, text });
      } catch (err) {
        console.error('Share failed:', err);
      }
    } else {
      try {
        await navigator.clipboard.writeText(text);
        setCopyFeedback('Copied!');
        setTimeout(() => setCopyFeedback(null), 2000);
      } catch (err) {
        console.error('Share failed:', err);
      }
    }
  }, [walletAddress, isAddressValid, currentAsset]);

  return {
    assets,
    currentAsset,
    walletAddress,
    isAddressValid,
    isConnected: Object.keys(connectedWallets).length > 0,
    isWalletTypeConnected:
      !!currentAsset && !!connectedWallets[currentAsset.walletType as WalletType],
    handleCopy,
    handleShare,
    copyFeedback,
    hasTrustline,
    isAddingTrustline,
    handleAddTrustline,
  };
};
