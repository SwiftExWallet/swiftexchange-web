import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import BigNumber from 'bignumber.js';
import { ethers } from 'ethers';

import { SendErcAbi } from '../../../abi/SendErcAbi';
import { useNotificationStore } from '../../../store/notificationStore';
import { useTransactionModalStore } from '../../../store/transactionModalStore';
import { rejectPendingWCRequest } from '../../../utils/walletConnectUtils';
import { validateAddress } from '../../../validator/AddressValidator';
import { toPlainString } from '../../evm/feature/swap/utils/swapAmountUtils';
import { estimateEVMFees, sendCryptoEVMPrepare } from '../../evm/service/evmService';
import { storeSwapOrder } from '../../evm/service/evmTransactionStatusService';
import { fetchSingleTokenBalance, getTokensForChain } from '../../evm/service/tokenListService';
import { CHAIN_REGISTRY, getChainById, getExplorerUrl } from '../../evm/utils/Chainregistry';
import { getEVMNetworkConfig } from '../../evm/utils/evmUtils';
import { rpcManager } from '../../evm/utils/rpcProvider';
import { parseSwapError } from '../../evm/utils/swapErrorHandler';
import {
  checkTrustlineExists,
  estimateStellarFees,
  getStellarBalance,
  sendCryptoStellarBuild,
} from '../../stellar/service/stellarService';
import type { StellarSendTransaction } from '../../stellar/types/stellarTransaction.types';
import { useTransactionRouter } from '../../transaction/hook/useTransactionRouter';
import type { TransactionRequest } from '../../transaction/router/transactionRouter';
import { WalletType } from '../../walletconnect/constants/Wallet';
import { useWalletConnect } from '../../walletconnect/hooks/useWalletConnect';
import { useGlobalTxStore } from '../../walletconnect/store/globalTxStore';
import { usePortfolioStore } from '../../walletconnect/store/portfolioStore';
import { useWalletStore } from '../../walletconnect/store/walletConnectStore';

interface TransactionState {
  txHash: string | null;
  step: 'form' | 'review' | 'signing' | 'success' | 'error';
  error: string | null;
  stellarTransaction?: StellarSendTransaction | null;
}

export interface EnhancedSendAsset {
  value: string;
  symbol: string;
  label: string;
  logo: string;
  network: string;
  chainId: number | string;
  addressType: string;
  walletType: WalletType;
  tokenAddress?: string;
  decimals: number;
  isNative: boolean;
  type: 'evm' | 'stellar';
  networkKey: number | string;
  baseFee: number;
  balance: number;
  blockExplorerUrl?: string;
}

const formatErrorMessage = (error: any): string => {
  return parseSwapError(error);
};

export const useSendAsset = (onBack?: () => void) => {
  const { connectedWallets, getProvider } = useWalletConnect();
  const { sendTransaction } = useTransactionRouter();
  const currentNetwork = useWalletStore(state => state.network);
  const { isLocked } = useGlobalTxStore();
  const storeAssets = usePortfolioStore(state => state.assets);
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [recipientAddress, setRecipientAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [balance, setBalance] = useState('0');
  const [isFetchingBalance, setIsFetchingBalance] = useState(false);
  const [transactionState, setTransactionState] = useState<TransactionState>({
    txHash: null,
    step: 'form',
    error: null,
  });
  const [isEstimatingFees, setIsEstimatingFees] = useState(false);
  const [estimatedFees, setEstimatedFees] = useState<any>(null);
  const [hasTrustline, setHasTrustline] = useState<boolean | null>(null);
  const [recipientHasTrustline, setRecipientHasTrustline] = useState<boolean | null>(null);
  const [isFetchingRecipientTrust, setIsFetchingRecipientTrust] = useState(false);
  const isConfirmingRef = useRef(false);

  const allAssets: EnhancedSendAsset[] = useMemo(() => {
    const registryAssets: EnhancedSendAsset[] = [];
    const networkChains = CHAIN_REGISTRY.filter(
      c => c.networkType === currentNetwork && c.available
    );

    // Map store assets by chainId & address/native for fast balance lookup
    const storeMap = new Map<string, any>();
    storeAssets.forEach(a => {
      const cId = String(
        a.chainId ||
          (a.chainType === 'stellar' ? (currentNetwork === 'testnet' ? 'testnet' : 'pubnet') : '')
      );
      const isNative =
        !!a.isNative ||
        !a.address ||
        a.address.toLowerCase() === 'native' ||
        a.address.toLowerCase() === '0x0000000000000000000000000000000000000000';
      const addr = isNative ? 'native' : (a.address || '').toLowerCase();
      storeMap.set(`${cId}:${addr}:${a.symbol.toUpperCase()}`, a);
      if (!isNative) {
        storeMap.set(`${cId}:${addr}`, a);
      }
    });

    for (const config of networkChains) {
      if (!config.sendEnable) continue;
      const isStellar = config.chainId === 'pubnet' || config.chainId === 'testnet';
      const type: 'evm' | 'stellar' = isStellar ? 'stellar' : 'evm';
      const walletType = isStellar ? WalletType.STELLAR : WalletType.EVM;

      // 1. Native currency
      const nativeStoreKey = `${config.chainId}:native:${config.nativeCurrency.symbol.toUpperCase()}`;
      const nativeStoreItem = storeMap.get(nativeStoreKey);
      const nativeBalance = nativeStoreItem?.balance || 0;

      registryAssets.push({
        value: `send-${config.chainId}-native`,
        symbol: config.nativeCurrency.symbol,
        label: `${config.nativeCurrency.symbol} (${config.name})`,
        logo: config.nativeCurrency.logoURI || config.logoURI,
        network: config.name,
        chainId: config.chainId,
        addressType: type,
        walletType,
        tokenAddress: undefined,
        decimals: config.nativeCurrency.decimals || (isStellar ? 7 : 18),
        isNative: true,
        type,
        networkKey: config.chainId,
        baseFee: isStellar ? 0.00001 : 0.001,
        balance: nativeBalance,
        blockExplorerUrl: config.blockExplorerUrl,
      });

      // 2. Chain tokens from tokenListService
      const chainTokens = getTokensForChain(config.chainId);
      for (const t of chainTokens) {
        if (t.isNative || t.symbol.toUpperCase() === config.nativeCurrency.symbol.toUpperCase()) {
          continue;
        }
        const tokenAddr = t.address || '';
        const tokenStoreKey = `${config.chainId}:${tokenAddr.toLowerCase()}`;
        const storeItem =
          storeMap.get(tokenStoreKey) ||
          storeMap.get(`${config.chainId}:${tokenAddr.toLowerCase()}:${t.symbol.toUpperCase()}`);
        const tokenBalance = storeItem?.balance || 0;

        registryAssets.push({
          value: `send-${config.chainId}-${t.symbol}`,
          symbol: t.symbol,
          label: `${t.symbol} (${config.name})`,
          logo: t.logoURI || '',
          network: config.name,
          chainId: config.chainId,
          addressType: type,
          walletType,
          tokenAddress: tokenAddr,
          decimals: t.decimals || (isStellar ? 7 : 18),
          isNative: false,
          type,
          networkKey: config.chainId,
          baseFee: isStellar ? 0.00001 : 0.001,
          balance: tokenBalance,
          blockExplorerUrl: config.blockExplorerUrl,
        });
      }
    }

    // 3. Append custom imported user tokens from storeAssets that aren't in registry
    const existingKeys = new Set(
      registryAssets.map(
        a => `${a.chainId}:${(a.isNative ? 'native' : a.tokenAddress || '').toLowerCase()}`
      )
    );

    for (const a of storeAssets) {
      if ((a.balance || 0) <= 0) continue;
      const type: 'evm' | 'stellar' = a.chainType === 'stellar' ? 'stellar' : 'evm';
      const defaultStellarId = currentNetwork === 'testnet' ? 'testnet' : 'pubnet';
      const chainId = a.chainId || (type === 'stellar' ? defaultStellarId : 0);
      const isNative =
        !!a.isNative ||
        !a.address ||
        a.address.toLowerCase() === 'native' ||
        a.address.toLowerCase() === '0x0000000000000000000000000000000000000000';
      const key = `${chainId}:${(isNative ? 'native' : a.address || '').toLowerCase()}`;

      if (!existingKeys.has(key)) {
        registryAssets.push({
          value: a.id || `send-${chainId}-${a.symbol}`,
          symbol: a.symbol,
          label: `${a.symbol} (${a.chainName || ''})`,
          logo: a.image,
          network: a.chainName || '',
          chainId,
          addressType: type,
          walletType: type === 'stellar' ? WalletType.STELLAR : WalletType.EVM,
          tokenAddress: isNative ? undefined : a.address,
          decimals: a.decimals || (type === 'stellar' ? 7 : 18),
          isNative,
          type,
          networkKey: chainId,
          baseFee: type === 'stellar' ? 0.00001 : 0.001,
          balance: a.balance || 0,
          blockExplorerUrl: a.blockExplorerUrl,
        });
        existingKeys.add(key);
      }
    }

    // 4. Sort: funded tokens first, then native assets, then alphabetically
    return registryAssets.sort((a, b) => {
      if (a.balance > 0 && b.balance <= 0) return -1;
      if (b.balance > 0 && a.balance <= 0) return 1;
      if (a.balance > 0 && b.balance > 0 && a.balance !== b.balance) {
        return b.balance - a.balance;
      }
      if (a.isNative && !b.isNative) return -1;
      if (!a.isNative && b.isNative) return 1;
      return a.symbol.localeCompare(b.symbol);
    });
  }, [storeAssets, currentNetwork]);

  const assetParam = searchParams.get('asset');
  const chainIdParam = searchParams.get('chainId');
  const addressParam = searchParams.get('address');

  const currentAsset = useMemo(() => {
    if (assetParam && chainIdParam) {
      const stellarChainId = currentNetwork === 'testnet' ? 'testnet' : 'pubnet';
      const paramIdStr = chainIdParam === 'stellar' ? stellarChainId : String(chainIdParam);

      // 1. Search in allAssets
      const found = allAssets.find(a => {
        const aChainIdStr = String(a.chainId);
        if (a.symbol.toUpperCase() !== assetParam.toUpperCase() || aChainIdStr !== paramIdStr) {
          return false;
        }

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

      // 2. Direct fallback resolution if asset not yet loaded in allAssets
      const config = getChainById(paramIdStr);
      if (config) {
        const isStellar = config.chainId === 'pubnet' || config.chainId === 'testnet';
        const type: 'evm' | 'stellar' = isStellar ? 'stellar' : 'evm';
        const walletType = isStellar ? WalletType.STELLAR : WalletType.EVM;
        const isNativeParam =
          !addressParam ||
          addressParam.toLowerCase() === 'native' ||
          addressParam.toLowerCase() === '0x0000000000000000000000000000000000000000';

        if (
          isNativeParam ||
          assetParam.toUpperCase() === config.nativeCurrency.symbol.toUpperCase()
        ) {
          return {
            value: `send-${config.chainId}-native`,
            symbol: config.nativeCurrency.symbol,
            label: `${config.nativeCurrency.symbol} (${config.name})`,
            logo: config.nativeCurrency.logoURI || config.logoURI,
            network: config.name,
            chainId: config.chainId,
            addressType: type,
            walletType,
            tokenAddress: undefined,
            decimals: config.nativeCurrency.decimals || (isStellar ? 7 : 18),
            isNative: true,
            type,
            networkKey: config.chainId,
            baseFee: isStellar ? 0.00001 : 0.001,
            balance: 0,
            blockExplorerUrl: config.blockExplorerUrl,
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
            value: `send-${config.chainId}-${matched.symbol}`,
            symbol: matched.symbol,
            label: `${matched.symbol} (${config.name})`,
            logo: matched.logoURI || '',
            network: config.name,
            chainId: config.chainId,
            addressType: type,
            walletType,
            tokenAddress: matched.address,
            decimals: matched.decimals || (isStellar ? 7 : 18),
            isNative: !!matched.isNative,
            type,
            networkKey: config.chainId,
            baseFee: isStellar ? 0.00001 : 0.001,
            balance: 0,
            blockExplorerUrl: config.blockExplorerUrl,
          };
        }
      }
    }
    return undefined;
  }, [allAssets, assetParam, chainIdParam, addressParam, currentNetwork]);

  useEffect(() => {
    // Only default to first asset if URL has NO asset or chainId params at all
    if (!assetParam || !chainIdParam) {
      if (allAssets.length > 0) {
        const first = allAssets[0];
        const tarChain =
          first.chainId === 'pubnet' || first.chainId === 'testnet'
            ? 'stellar'
            : String(first.chainId);
        setSearchParams({ asset: first.symbol, chainId: tarChain }, { replace: true });
      }
    }
  }, [allAssets, assetParam, chainIdParam, setSearchParams]);

  const senderAddress = useMemo(() => {
    if (!currentAsset) return null;
    return connectedWallets[currentAsset.walletType]?.address || null;
  }, [connectedWallets, currentAsset]);

  const fetchBalance = useCallback(
    async (isManual = false) => {
      if (!currentAsset || !senderAddress) return;

      const storeAssets = usePortfolioStore.getState().assets;
      const storeItem = storeAssets.find(a => a.id === currentAsset.value);
      if (storeItem) setBalance(toPlainString(storeItem.balance));

      const shouldShowLoading = isManual || !storeItem;
      if (shouldShowLoading) {
        setIsFetchingBalance(true);
      }

      try {
        let balStr: string = '0';
        if (currentAsset.type === 'evm') {
          const config = getEVMNetworkConfig(Number(currentAsset.networkKey));
          balStr = await rpcManager.fetchWithFallback(
            Number(currentAsset.networkKey),
            config.rpcUrls,
            async provider =>
              fetchSingleTokenBalance(
                senderAddress,
                provider,
                currentAsset.tokenAddress || '',
                currentAsset.isNative,
                currentAsset.decimals
              )
          );
        } else if (currentAsset.type === 'stellar') {
          const key = currentAsset.isNative
            ? 'native'
            : `${currentAsset.symbol}:${currentAsset.tokenAddress}`;
          balStr = await getStellarBalance(key, senderAddress);
        }
        setBalance(balStr);
      } catch (e) {
        console.error('Balance error:', e);
      } finally {
        if (shouldShowLoading) {
          setTimeout(() => setIsFetchingBalance(false), 500);
        }
      }
    },
    [currentAsset, senderAddress]
  );

  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  useEffect(() => {
    const checkTrust = async () => {
      if (currentAsset?.type === 'stellar' && !currentAsset.isNative && senderAddress) {
        try {
          const exists = await checkTrustlineExists(
            senderAddress,
            currentAsset.symbol,
            currentAsset.tokenAddress || ''
          );
          setHasTrustline(exists);
        } catch {
          setHasTrustline(false);
        }
      } else {
        setHasTrustline(true);
      }
    };
    checkTrust();
  }, [currentAsset, senderAddress]);

  useEffect(() => {
    const checkRecipientTrust = async () => {
      if (
        currentAsset?.type === 'stellar' &&
        !currentAsset.isNative &&
        recipientAddress &&
        validateAddress(recipientAddress, { addressType: 'stellar', network: currentAsset.network })
      ) {
        setIsFetchingRecipientTrust(true);
        try {
          const exists = await checkTrustlineExists(
            recipientAddress,
            currentAsset.symbol,
            currentAsset.tokenAddress || ''
          );
          setRecipientHasTrustline(exists);
        } catch {
          setRecipientHasTrustline(false);
        } finally {
          setIsFetchingRecipientTrust(false);
        }
      } else {
        setRecipientHasTrustline(true);
        setIsFetchingRecipientTrust(false);
      }
    };
    const timer = setTimeout(checkRecipientTrust, 500);
    return () => clearTimeout(timer);
  }, [currentAsset, recipientAddress]);

  useEffect(() => {
    const estimate = async () => {
      if (
        !currentAsset ||
        !senderAddress ||
        !recipientAddress ||
        !amount ||
        parseFloat(amount) <= 0 ||
        !validateAddress(recipientAddress, {
          addressType: currentAsset.addressType as any,
          network: currentAsset.network,
        })
      ) {
        setEstimatedFees(null);
        return;
      }
      setIsEstimatingFees(true);
      try {
        let fees;
        if (currentAsset.type === 'evm') {
          fees = await estimateEVMFees(
            Number(currentAsset.networkKey),
            senderAddress,
            recipientAddress,
            amount || '0.0001',
            currentAsset.isNative ? undefined : currentAsset.tokenAddress,
            currentAsset.decimals
          );
        } else if (currentAsset.type === 'stellar') {
          fees = await estimateStellarFees();
        }
        setEstimatedFees(fees);
      } catch (e: any) {
        setEstimatedFees({
          totalCost: currentAsset.baseFee.toFixed(8),
          error: formatErrorMessage(e),
        });
      } finally {
        setIsEstimatingFees(false);
      }
    };
    const timer = setTimeout(estimate, 500);
    return () => clearTimeout(timer);
  }, [currentAsset, senderAddress, recipientAddress, amount, memo]);

  const handleConfirmTransaction = async () => {
    if (!currentAsset || !senderAddress) {
      console.warn('[useSendAsset] Cannot confirm transaction: missing asset or sender address');
      return;
    }

    if (isConfirmingRef.current) {
      console.warn(
        '[useSendAsset] Transaction confirmation already in progress. Blocking concurrent request.'
      );
      return;
    }

    if (isLocked()) {
      useNotificationStore.getState().showToast({
        type: 'SEND',
        title: 'Wallet Request Pending',
        message:
          'Your wallet already has a pending request. Open your wallet and Approve or Reject it first.',
        dontSave: true,
      });
      return;
    }

    isConfirmingRef.current = true;

    try {
      setTransactionState(p => ({ ...p, step: 'signing', error: null }));
      let req: TransactionRequest;

      if (currentAsset.type === 'evm') {
        console.log('[useSendAsset] Building EVM transaction request');
        let data: string | undefined = memo || undefined;
        let to = recipientAddress;
        let sendAmt = amount;

        if (!currentAsset.isNative && currentAsset.tokenAddress) {
          console.log('[useSendAsset] Preparing ERC20 transfer data');
          data = new ethers.Interface(SendErcAbi).encodeFunctionData('transfer', [
            recipientAddress,
            ethers.parseUnits(amount, currentAsset.decimals),
          ]);
          to = currentAsset.tokenAddress;
          sendAmt = '0';
        }

        let unsignedTx: string | undefined;

        // Backend API proxy prepare requires mainnet device authentication.
        // On testnet, skip backend prepare and use direct client-side simulation + wallet signing.
        if (currentNetwork !== 'testnet') {
          console.log('[useSendAsset] Preparing EVM transaction via backend API...');
          try {
            const prepRes = await sendCryptoEVMPrepare(
              Number(currentAsset.networkKey),
              senderAddress,
              to,
              sendAmt,
              { data }
            );
            unsignedTx = prepRes.unsignedTx;
          } catch (apiError) {
            console.warn(
              '[useSendAsset] Backend transaction preparation failed. Falling back to client-side simulation:',
              apiError
            );
          }
        }

        req = {
          type: 'evm',
          network: currentAsset.network,
          networkKey: Number(currentAsset.networkKey),
          from: senderAddress,
          to,
          amount: sendAmt,
          data,
          unsignedTx,
        };
        console.log('[useSendAsset] Sending transaction request to router:', req);
        const res = await sendTransaction(req);
        const chainSymbol =
          currentAsset.type === 'evm'
            ? getChainById(Number(currentAsset.networkKey))?.symbol || currentAsset.network
            : currentAsset.network;

        await storeSwapOrder({
          txHash: res.hash || 'unknown',
          walletAddress: senderAddress,
          provider: 'EVMTX',
          fromChain: chainSymbol,
          toChain: chainSymbol,
          fromToken: currentAsset.symbol,
          toToken: currentAsset.symbol,
          amountIn: amount,
          amountOut: amount,
          txType: currentAsset.isNative ? 'Native Transfer' : 'Token Transfer',
        }).catch((err: any) => console.error('Failed to store transfer to backend:', err));

        setRecipientAddress('');
        setAmount('');
        setMemo('');
        setTransactionState({ txHash: null, step: 'form', error: null });

        if (res.hash) {
          useTransactionModalStore.getState().openModal({
            status: 'success',
            type: 'Send',
            hash: res.hash,
            explorerUrl: getExplorerUrl(currentAsset.chainId, 'tx', res.hash),
            networkName: currentAsset.network,
            isStellar: false,
          });
        }
      } else if (currentAsset.type === 'stellar') {
        console.log('[useSendAsset] Building Stellar transaction request');

        const executeStellarWithRetry = async (retryCount = 0): Promise<any> => {
          try {
            const isTestnet = currentNetwork === 'testnet' || currentAsset.chainId === 'testnet';
            const tx = await sendCryptoStellarBuild(
              senderAddress,
              recipientAddress,
              amount,
              memo ? { memo } : {},
              {
                code: currentAsset.symbol,
                issuer: currentAsset.tokenAddress,
                isNative: currentAsset.isNative,
                chainId: isTestnet ? 'testnet' : 'pubnet',
              }
            );

            req = {
              type: 'stellar',
              network: currentAsset.network,
              networkKey: isTestnet ? 'testnet' : 'pubnet',
              from: senderAddress,
              to: recipientAddress,
              amount,
              data: {
                xdr: tx.xdr,
                network: isTestnet ? 'TESTNET' : 'PUBNET',
                networkPassphrase: isTestnet
                  ? 'Test SDF Network ; September 2015'
                  : 'Public Global Stellar Network ; September 2015',
              },
            };

            console.log(
              `[useSendAsset] Sending transaction request to router (attempt ${retryCount + 1}):`,
              req
            );
            const res = await sendTransaction(req);
            return res;
          } catch (err: any) {
            const errorStr = (err.message || JSON.stringify(err)).toLowerCase();
            const isSequenceError =
              errorStr.includes('tx_bad_seq') ||
              errorStr.includes('sequence_mismatch') ||
              errorStr.includes('bad sequence');

            if (retryCount < 1 && isSequenceError) {
              console.warn(
                '[useSendAsset] Stellar sequence mismatch detected. Retrying with fresh account data...'
              );
              await new Promise(resolve => setTimeout(resolve, 1500));
              return executeStellarWithRetry(retryCount + 1);
            }
            throw err;
          }
        };

        const res = await executeStellarWithRetry();

        if (res.status !== 'success') throw new Error(res.error || 'Failed');

        setRecipientAddress('');
        setAmount('');
        setMemo('');
        setTransactionState({ txHash: null, step: 'form', error: null });

        useTransactionModalStore.getState().openModal({
          status: 'success',
          type: 'Send',
          hash: res.hash || undefined,
          isStellar: true,
        });
      }
    } catch (e: any) {
      console.error('[useSendAsset] Transaction exception caught:', e);
      const errMsg = formatErrorMessage(e);
      setRecipientAddress('');
      setAmount('');
      setMemo('');
      setTransactionState({ txHash: null, step: 'form', error: null });

      useNotificationStore.getState().showToast({
        type: currentAsset?.type === 'evm' ? 'EVM_SWAP' : 'STELLAR',
        title: 'Transaction Failed',
        message: errMsg,
        dontSave: true,
      });

      useTransactionModalStore.getState().openModal({
        status: 'error',
        type: 'Send',
        error: errMsg,
        isStellar: currentAsset?.type === 'stellar',
      });
    } finally {
      isConfirmingRef.current = false;
    }
  };

  const handleMaxClick = useCallback(() => {
    if (!currentAsset) return;

    const bnBalance = new BigNumber(balance);
    const fee = estimatedFees?.totalCost
      ? new BigNumber(estimatedFees.totalCost)
      : new BigNumber(currentAsset.baseFee);

    let maxAmount: BigNumber;

    if (currentAsset.isNative) {
      maxAmount = bnBalance.isGreaterThan(fee) ? bnBalance.minus(fee) : bnBalance;
    } else {
      maxAmount = bnBalance;
    }

    if (maxAmount.isLessThanOrEqualTo(0)) {
      setAmount('0');
      return;
    }

    const amountStr = maxAmount.toFixed(currentAsset.decimals, BigNumber.ROUND_DOWN);
    setAmount(amountStr.replace(/(\.[0-9]*[1-9])0+$/, '$1').replace(/\.0+$/, ''));
  }, [currentAsset, estimatedFees, balance]);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const copyToClipboard = async (text: string, _label?: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      console.error('Copy error', e);
    }
  };

  const handleCancelPending = useCallback(async () => {
    const { status, pendingRequest, clearPending } = useGlobalTxStore.getState();
    if (status === 'pending' && pendingRequest && currentAsset) {
      const provider = getProvider(currentAsset.walletType as any);
      if (provider) {
        useNotificationStore.getState().showToast({
          type: 'SEND',
          title: 'Cancelling...',
          message: 'If you already approved this in your wallet, this may not stop it.',
          dontSave: true,
        });
        await rejectPendingWCRequest(provider, pendingRequest.id, pendingRequest.topic);
      }
      clearPending();
    }
  }, [currentAsset, connectedWallets]);

  const handleBackToForm = useCallback(() => {
    handleCancelPending();
    setTransactionState({ txHash: null, step: 'form', error: null });
  }, [handleCancelPending]);

  const handleRetryTransaction = useCallback(() => {
    handleCancelPending();
    setTransactionState({ txHash: null, step: 'form', error: null });
  }, [handleCancelPending]);

  const handleDone = useCallback(() => {
    handleCancelPending();
    if (currentAsset?.type === 'evm') {
      navigate('/transactions?tab=recent');
    } else if (currentAsset?.type === 'stellar') {
      navigate('/transactions?tab=stellar');
    } else if (onBack) {
      onBack();
    } else {
      setTransactionState({ txHash: null, step: 'form', error: null });
    }
  }, [currentAsset, navigate, onBack, handleCancelPending]);

  return {
    recipientAddress,
    setRecipientAddress,
    amount,
    setAmount,
    memo,
    setMemo,
    balance,
    isFetchingBalance,
    transactionState,
    setTransactionState,
    isEstimatingFees,
    estimatedFees,
    currentAsset,
    senderAddress,
    isWalletConnected: !!senderAddress,
    handleMaxClick,
    handleRefreshBalances: () => fetchBalance(true),
    handleReviewTransaction: () => setTransactionState(p => ({ ...p, step: 'review' })),
    handleConfirmTransaction,
    handleBackToForm,
    handleDone,
    handleRetryTransaction,
    copyToClipboard,
    formError: !currentAsset
      ? null
      : !senderAddress
        ? null
        : recipientAddress &&
            !validateAddress(recipientAddress, {
              addressType: currentAsset.addressType as any,
              network: currentAsset.network,
            })
          ? 'Invalid address'
          : amount && amount !== '.' && new BigNumber(amount).isGreaterThan(balance) && hasTrustline
            ? 'Insufficient funds'
            : null,
    assets: allAssets,
    availableChains: [],
    onBack,
    needsTrustline: hasTrustline === false,
    recipientNeedsTrustline: recipientHasTrustline === false,
    isFetchingRecipientTrust,
    buttonLabel:
      hasTrustline === false
        ? 'Add Trust & Send'
        : transactionState.step === 'review'
          ? 'Send Now'
          : 'Continue to Review',
  };
};
