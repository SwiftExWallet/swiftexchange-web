import { useCallback, useEffect, useRef, useState } from 'react';

import * as StellarSDK from '@stellar/stellar-sdk';

import { useTransactionModalStore } from '../../../../../store/transactionModalStore';
import { AquariusService } from '../../../../stellar/service/aquariusService';
import { SoroswapService } from '../../../../stellar/service/soroswapService';
import { getAssetsForChain } from '../../../utils/Chainregistry';
import { getSwapQuote } from '../services/evmSwapService';
import { get1InchFusionQuote } from '../services/fusionOrderService';
import {
  DUMMY_EVM_ADDRESS,
  DUMMY_STELLAR_ADDRESS,
  fetchNearIntentTokens,
  getNearIntentQuote,
  isStellarBlockchain,
  matchNearIntentToken,
  safeParseUnits,
} from '../services/oneClickApi';
import { useQuoteTimerStore } from '../store/quoteTimerStore';
import type { UnifiedAsset, UnifiedQuote } from '../types/swap.types';
import { isStellar } from '../utils/swapAssetUtils';
import { parseSwapError } from '../utils/swapErrorHandler';

export interface UseSwapQuoteParams {
  sellAmount: string;
  showFusionScreen: boolean;
  actionType: 'SWAP' | 'BRIDGE';
  fromChainId: number | string;
  toChainId: number | string;
  ammService: any;
  selectedSellAsset: UnifiedAsset | null;
  selectedBuyAsset: UnifiedAsset | null;
  userSlippageTolerance: number;
  sellAssetSymbol: string;
  buyAssetSymbol: string;
  fromChainConfig: any;
  toChainConfig: any;
  setFeePayType: (type: 'native' | 'stablecoin') => void;
  setCrossChainWarning: (warning: string | null) => void;
  setBridgeErrorMsg: (msg: string | null) => void;
  resetSwap: () => void;
  swapError: any;
  bridgeTxStatus: string;
  swapQuoteLoading: boolean;
  isSameAssetSelected: boolean;
  evmAddress?: string;
  stellarAddress?: string;
  isStellarAccountActive?: boolean | null;
  currentNetwork?: 'mainnet' | 'testnet';
}

export function useSwapQuote(params: UseSwapQuoteParams) {
  const {
    sellAmount,
    showFusionScreen,
    actionType,
    fromChainId,
    toChainId,
    ammService,
    selectedSellAsset,
    selectedBuyAsset,
    userSlippageTolerance,
    sellAssetSymbol,
    buyAssetSymbol,
    setCrossChainWarning,
    setBridgeErrorMsg,
    resetSwap,
    bridgeTxStatus,
    swapQuoteLoading,
    isSameAssetSelected,
    evmAddress,
    stellarAddress,
    isStellarAccountActive,
    currentNetwork,
  } = params;

  const [currentQuote, setCurrentQuote] = useState<UnifiedQuote>({
    source: null,
    data: null,
    error: null,
    loading: false,
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const latestRequestId = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchUnifiedQuote = useCallback(async () => {
    const isModalOpen = useTransactionModalStore.getState().isOpen;
    if ((bridgeTxStatus && bridgeTxStatus !== 'idle') || isModalOpen) {
      return;
    }

    if (!sellAmount || parseFloat(sellAmount) <= 0 || showFusionScreen) {
      setCurrentQuote({ source: null, data: null, error: null, loading: false });
      return;
    }

    let warningError: string | null = null;

    const isBuyClassic =
      selectedBuyAsset &&
      !selectedBuyAsset.isNative &&
      Boolean(
        (selectedBuyAsset as any).issuer?.startsWith('G') ||
        ((selectedBuyAsset as any).address?.startsWith('G') &&
          !(selectedBuyAsset as any).address?.startsWith('C'))
      );

    if (
      isStellar(toChainId) &&
      isStellarAccountActive === false &&
      buyAssetSymbol.toUpperCase() !== 'XLM'
    ) {
      warningError = 'Account activation required';
    } else if (
      isStellar(toChainId) &&
      isStellarAccountActive !== false &&
      isBuyClassic &&
      !selectedBuyAsset?.hasTrustline
    ) {
      warningError = 'Trustline required';
    }

    if (!selectedSellAsset || !selectedBuyAsset) {
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    const requestId = ++latestRequestId.current;
    setCrossChainWarning(null);
    setBridgeErrorMsg(null);
    resetSwap();

    const isBothStellar = isStellar(fromChainId) && isStellar(toChainId);
    if (actionType === 'SWAP' || isBothStellar) {
      if ((isStellar(fromChainId) || isStellar(toChainId)) && ammService) {
        if (!selectedSellAsset || !selectedBuyAsset) return;
        try {
          const fromContract =
            (selectedSellAsset as any)?.contract ||
            (selectedSellAsset as any)?.address ||
            selectedSellAsset.asset;
          const toContract =
            (selectedBuyAsset as any)?.contract ||
            (selectedBuyAsset as any)?.address ||
            selectedBuyAsset.asset;
          if (!fromContract || !toContract) return;

          setCurrentQuote({ source: 'STELLAR_SWAP', data: null, error: null, loading: true });

          let sq: any = null;

          try {
            const soroService = new SoroswapService(
              ammService.horizonUrl,
              ammService.networkPassphrase
            );
            sq = await soroService.getQuote(fromContract, toContract, sellAmount, {
              slippageTolerance: userSlippageTolerance,
            });
            if (sq) {
              sq.source = 'SOROSWAP';
              sq.provider =
                sq.platform?.toLowerCase() === 'sdex'
                  ? 'Soroswap Router (SDEX)'
                  : 'Soroswap Router (AMM)';
            }
          } catch (soroErr) {
            console.warn('[useSwapQuote] Soroswap quote failed, checking Aquarius:', soroErr);
          }

          const toClassicAsset = (a: any) => {
            if (!a) return null;
            if (a.asset && typeof a.asset.isNative === 'function') return a.asset;
            if (a.isNative || a.symbol === 'XLM') return StellarSDK.Asset.native();
            const issuer = a.issuer || (a.address?.startsWith('G') ? a.address : null);
            if (issuer && issuer.startsWith('G')) {
              try {
                return new StellarSDK.Asset(a.symbol, issuer);
              } catch {
                return null;
              }
            }
            return null;
          };

          const classicFrom = toClassicAsset(selectedSellAsset);
          const classicTo = toClassicAsset(selectedBuyAsset);
          const canUseClassicAmm = Boolean(classicFrom && classicTo);

          if (!sq && canUseClassicAmm) {
            try {
              const aquaService = new AquariusService(
                ammService.horizonUrl,
                ammService.networkPassphrase
              );
              sq = await aquaService.getQuote(classicFrom, classicTo, sellAmount, {
                slippageTolerance: userSlippageTolerance,
              });
              if (sq) {
                sq.source = 'AQUARIUS';
                sq.provider = 'Aquarius Router';
              }
            } catch (aquaErr) {
              console.warn(
                '[useSwapQuote] Aquarius quote failed, falling back to Horizon AMM:',
                aquaErr
              );
            }
          }

          if (!sq && canUseClassicAmm) {
            try {
              sq = await ammService.getSwapQuote(classicFrom, classicTo, sellAmount, {
                slippageTolerance: userSlippageTolerance,
              });
              if (sq) {
                sq.source = 'STELLAR_AMM';
                sq.provider = 'Classic Horizon AMM';
              }
            } catch (ammErr) {
              console.warn('[useSwapQuote] Horizon AMM quote failed:', ammErr);
            }
          }

          if (requestId !== latestRequestId.current) return;

          setCurrentQuote({
            source: 'STELLAR_SWAP',
            data: sq,
            error: sq ? warningError : warningError || 'No swap route or liquidity pool found',
            loading: false,
          });
        } catch (err) {
          if (requestId !== latestRequestId.current) return;
          console.error('Stellar quote error:', err);
          setCurrentQuote({
            source: 'STELLAR_SWAP',
            data: null,
            error: parseSwapError(err),
            loading: false,
          });
        }
      } else {
        if (
          !selectedSellAsset ||
          !selectedBuyAsset ||
          selectedSellAsset.address?.toLowerCase() === selectedBuyAsset.address?.toLowerCase()
        )
          return;
        try {
          const quoteRequest = {
            tokenIn: {
              symbol: selectedSellAsset.symbol,
              name: selectedSellAsset.name || selectedSellAsset.symbol,
              decimals: selectedSellAsset.decimals || 18,
              address: selectedSellAsset.isNative
                ? '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
                : selectedSellAsset.address || '',
              balance: selectedSellAsset.balance || '0',
              logoUri: selectedSellAsset.logoUri || null,
              chainId: fromChainId,
              isNative: !!selectedSellAsset.isNative,
            },
            tokenOut: {
              symbol: selectedBuyAsset.symbol,
              name: selectedBuyAsset.name || selectedBuyAsset.symbol,
              decimals: selectedBuyAsset.decimals || 18,
              address: selectedBuyAsset.isNative
                ? '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
                : selectedBuyAsset.address || '',
              balance: selectedBuyAsset.balance || '0',
              logoUri: selectedBuyAsset.logoUri || null,
              chainId: toChainId,
              isNative: !!selectedBuyAsset.isNative,
            },
            amount: sellAmount,
            recipient: evmAddress || DUMMY_EVM_ADDRESS,
            slippage: userSlippageTolerance ? userSlippageTolerance.toString() : '1',
          };
          setCurrentQuote(prev => ({ ...prev, source: 'EVM_SWAP', loading: true }));
          const sq = await getSwapQuote(
            fromChainId,
            quoteRequest,
            abortControllerRef.current.signal
          );
          if (requestId !== latestRequestId.current) return;
          setCurrentQuote({ source: 'EVM_SWAP', data: sq, error: warningError, loading: false });
        } catch (err: any) {
          if (requestId !== latestRequestId.current) return;
          if (
            err?.message === 'Quote request cancelled' ||
            err?.message === 'Quote request superseded'
          )
            return;
          console.error('Swap quote error:', err);
          setCurrentQuote({
            source: 'EVM_SWAP',
            data: null,
            error: parseSwapError(err),
            loading: false,
          });
        }
      }
    } else {
      if (!selectedSellAsset || !selectedBuyAsset) return;

      if (currentNetwork === 'testnet' && (isStellar(fromChainId) || isStellar(toChainId))) {
        const unsupportedMsg =
          'Stellar ↔ EVM swaps via NEAR Intents are only available on Mainnet. Please switch to Mainnet.';
        setCurrentQuote({
          source: 'NEAR_INTENT',
          data: null,
          error: unsupportedMsg,
          loading: false,
        });
        setCrossChainWarning(unsupportedMsg);
        return;
      }

      const fetchNearIntentQuote = async () => {
        try {
          const nearTokens = await fetchNearIntentTokens(currentNetwork);

          const resolveMatchingAddress = (asset: any, symbol: string, chainId: any) => {
            if (
              asset?.address &&
              asset.address !== 'native' &&
              asset.address !== '0x0000000000000000000000000000000000000000' &&
              asset.address.toLowerCase() !== '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
            ) {
              return asset.address;
            }
            const chainAssets = getAssetsForChain(chainId);
            const found = chainAssets.find(
              (a: any) => a.symbol.toUpperCase() === (symbol || '').toUpperCase()
            );
            if (
              found?.address &&
              found.address !== 'native' &&
              found.address !== '0x0000000000000000000000000000000000000000' &&
              found.address.toLowerCase() !== '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
            ) {
              return found.address;
            }
            return asset?.address || '';
          };

          const sellAddr = resolveMatchingAddress(selectedSellAsset, sellAssetSymbol, fromChainId);
          const buyAddr = resolveMatchingAddress(selectedBuyAsset, buyAssetSymbol, toChainId);

          const nearSellAsset = matchNearIntentToken(
            nearTokens,
            sellAssetSymbol,
            sellAddr,
            fromChainId
          );
          const nearBuyAsset = matchNearIntentToken(nearTokens, buyAssetSymbol, buyAddr, toChainId);

          if (nearSellAsset && nearBuyAsset) {
            const isStellarOrigin = isStellarBlockchain(nearSellAsset.blockchain);
            const isStellarDest = isStellarBlockchain(nearBuyAsset.blockchain);

            const originWalletConnected = isStellarOrigin ? !!stellarAddress : !!evmAddress;
            const destWalletConnected = isStellarDest ? !!stellarAddress : !!evmAddress;
            const isDryRun = !originWalletConnected || !destWalletConnected;

            const recipient = isStellarDest
              ? stellarAddress || DUMMY_STELLAR_ADDRESS
              : evmAddress || DUMMY_EVM_ADDRESS;
            const refundTo = isStellarOrigin
              ? stellarAddress || DUMMY_STELLAR_ADDRESS
              : evmAddress || DUMMY_EVM_ADDRESS;

            const quotePayload = {
              dry: isDryRun,
              depositMode: (isStellarOrigin ? 'MEMO' : 'SIMPLE') as 'MEMO' | 'SIMPLE',
              swapType: 'EXACT_INPUT' as const,
              slippageTolerance: userSlippageTolerance * 100,
              originAsset: nearSellAsset.assetId,
              depositType: 'ORIGIN_CHAIN',
              destinationAsset: nearBuyAsset.assetId,
              amount: safeParseUnits(sellAmount, nearSellAsset.decimals),
              recipient: recipient as string,
              recipientType: 'DESTINATION_CHAIN' as const,
              refundTo: refundTo as string,
              refundType: 'ORIGIN_CHAIN',
              deadline: new Date(Date.now() + 1200000).toISOString(),
            };

            return await getNearIntentQuote(quotePayload).then(res => res.quote);
          }
          return { error: 'Pair not supported by NEAR Intents' };
        } catch (err: any) {
          console.warn('NEAR Intents quote failed', err);
          return { error: err.message || 'Intents setup failed' };
        }
      };

      const isFromStellar = isStellar(fromChainId);
      const isToStellar = isStellar(toChainId);
      const isEvmWalletConnected = !!evmAddress;

      if (isFromStellar || isToStellar || !isEvmWalletConnected) {
        setCurrentQuote({ source: 'NEAR_INTENT', data: null, error: null, loading: true });
        setCrossChainWarning(null);

        try {
          const inQ = await fetchNearIntentQuote();

          if (requestId !== latestRequestId.current) return;

          if (!inQ || (inQ as any).error) {
            throw new Error((inQ as any)?.error || 'Pair not supported by NEAR Intents');
          }

          setCurrentQuote({
            source: 'NEAR_INTENT',
            data: inQ,
            error: warningError,
            loading: false,
          });
        } catch (err: any) {
          if (requestId !== latestRequestId.current) return;
          if (
            err?.message === 'Quote request cancelled' ||
            err?.message === 'Quote request superseded'
          )
            return;
          console.error('Cross-chain quote error:', err);
          setCrossChainWarning(parseSwapError(err));
          setCurrentQuote({
            source: 'NEAR_INTENT',
            data: null,
            error: parseSwapError(err),
            loading: false,
          });
        }
      } else {
        // EVM to EVM cross-chain -> Fusion Plus (1inch) with NEAR Intents fallback
        setCurrentQuote({ source: 'FUSION_PLUS', data: null, error: null, loading: true });
        setCrossChainWarning(null);

        const resolveTokenAddr = (asset: any) => {
          if (!asset) return '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
          const addr = (asset.address || '').toLowerCase();
          if (
            asset.isNative ||
            !addr ||
            addr === 'native' ||
            addr === '0x0000000000000000000000000000000000000000'
          ) {
            return '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
          }
          return asset.address;
        };

        const tokenInAddr = resolveTokenAddr(selectedSellAsset);
        const tokenOutAddr = resolveTokenAddr(selectedBuyAsset);

        try {
          const fusionQuote = await get1InchFusionQuote(
            fromChainId,
            {
              tokenIn: tokenInAddr,
              tokenOut: tokenOutAddr,
              amount: safeParseUnits(sellAmount, selectedSellAsset.decimals || 18),
              walletAddress: evmAddress || '0x0000000000000000000000000000000000000000',
            },
            toChainId
          );

          if (requestId !== latestRequestId.current) return;

          if (!fusionQuote || (fusionQuote as any).error) {
            throw new Error((fusionQuote as any)?.error || 'Pair not supported by Fusion Plus');
          }

          setCurrentQuote({
            source: 'FUSION_PLUS',
            data: fusionQuote,
            error: warningError,
            loading: false,
          });
        } catch (err: any) {
          if (requestId !== latestRequestId.current) return;
          if (
            err?.message === 'Quote request cancelled' ||
            err?.message === 'Quote request superseded'
          )
            return;
          console.warn('Fusion Plus quote failed, attempting fallback to NEAR Intents:', err);

          try {
            setCurrentQuote(prev => ({ ...prev, source: 'NEAR_INTENT', loading: true }));
            const inQ = await fetchNearIntentQuote();
            if (requestId !== latestRequestId.current) return;
            if (!inQ || (inQ as any).error) {
              throw new Error((inQ as any)?.error || 'Pair not supported');
            }
            setCurrentQuote({
              source: 'NEAR_INTENT',
              data: inQ,
              error: warningError,
              loading: false,
            });
          } catch (nearErr: any) {
            if (requestId !== latestRequestId.current) return;
            console.error('Fusion Plus and NEAR Intents both failed:', nearErr);
            // Arch-B fix: report the NEAR Intents error as the primary (it's the last
            // attempted provider). Appending the Fusion error gives context without hiding
            // the real failure. Source is NEAR_INTENT since that was the final attempt.
            const fusionErrMsg = parseSwapError(err);
            const nearErrMsg = parseSwapError(nearErr);
            const combinedMsg =
              fusionErrMsg !== nearErrMsg
                ? `${nearErrMsg} (Fusion fallback: ${fusionErrMsg})`
                : nearErrMsg;
            setCrossChainWarning(combinedMsg);
            setCurrentQuote({
              source: 'NEAR_INTENT',
              data: null,
              error: nearErrMsg,
              loading: false,
            });
          }
        }
      }
    }
  }, [
    actionType,
    fromChainId,
    toChainId,
    selectedSellAsset,
    selectedBuyAsset,
    sellAmount,
    sellAssetSymbol,
    buyAssetSymbol,
    userSlippageTolerance,
    showFusionScreen,
    ammService,
    evmAddress,
    stellarAddress,
    setCrossChainWarning,
    setBridgeErrorMsg,
    resetSwap,
    isStellarAccountActive,
    currentNetwork,
    bridgeTxStatus,
  ]);

  const isQuoteLoading = !!(currentQuote.loading || swapQuoteLoading || isRefreshing);

  useEffect(() => {
    useQuoteTimerStore.getState().resetTimer(30);
    resetSwap();
  }, [fromChainId, toChainId, sellAssetSymbol, buyAssetSymbol, resetSwap]);

  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const fetchUnifiedQuoteRef = useRef(fetchUnifiedQuote);
  fetchUnifiedQuoteRef.current = fetchUnifiedQuote;

  useEffect(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      fetchUnifiedQuoteRef.current();
    }, 500);
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [
    sellAmount,
    sellAssetSymbol,
    buyAssetSymbol,
    fromChainId,
    toChainId,
    selectedSellAsset,
    selectedBuyAsset,
    actionType,
    userSlippageTolerance,
  ]);

  useEffect(() => {
    let timer: NodeJS.Timeout;

    if (sellAmount && parseFloat(sellAmount) > 0) {
      timer = setInterval(() => {
        // Re-evaluate pause conditions on every tick so we react to modal open/close
        // and loading-state changes that happen *after* the interval was created.
        const isModalOpen = useTransactionModalStore.getState().isOpen;
        const shouldPause =
          showFusionScreen ||
          isSameAssetSelected ||
          isQuoteLoading ||
          (bridgeTxStatus && bridgeTxStatus !== 'idle') ||
          isModalOpen;

        if (shouldPause) return;

        const { timeLeft, setTimeLeft, resetTimer } = useQuoteTimerStore.getState();
        if (timeLeft <= 1) {
          resetTimer(30);
          fetchUnifiedQuote();
        } else {
          setTimeLeft(prev => prev - 1);
        }
      }, 1000);
    } else {
      useQuoteTimerStore.getState().resetTimer(30);
    }

    return () => {
      if (timer) clearInterval(timer);
    };
  }, [
    sellAmount,
    showFusionScreen,
    isSameAssetSelected,
    // isQuoteLoading intentionally omitted: each loading flip was restarting the
    // interval and resetting the 30-second timer on every quote fetch.
    // The check is now inside the tick body where it is always fresh.
    bridgeTxStatus,
    fetchUnifiedQuote,
  ]);

  return {
    currentQuote,
    setCurrentQuote,
    isRefreshing,
    setIsRefreshing,
    isQuoteLoading,
    fetchUnifiedQuote,
  };
}
