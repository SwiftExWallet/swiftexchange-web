import { useCallback, useState } from 'react';

import { signStellarTransactionOnly } from '@/modules/stellar/utils/transactionService';
import { WalletType } from '@/modules/walletconnect/constants/Wallet';
import { useWalletConnect } from '@/modules/walletconnect/hooks/useWalletConnect';
import { useWalletStore } from '@/modules/walletconnect/store/walletConnectStore';
import * as FreighterApi from '@stellar/freighter-api';

import type { SingleVaultConfig } from '../config/vault.config';
import { getVaultEnvironment } from '../config/vault.config';
import { VaultService } from '../service/vaultService';
import { getVaultActivityKey, useVaultActivityStore } from '../store/vaultActivityStore';
import type { VaultTxState } from '../types/vault.types';

export const useVaultAction = (vault: SingleVaultConfig) => {
  const currentNetwork = useWalletStore(state => state.network);
  const { connectedWallets, getProvider } = useWalletConnect();
  const stellarAddress = connectedWallets.stellar?.address || '';

  const [txState, setTxState] = useState<VaultTxState>({
    step: 'idle',
  });

  const resetTxState = useCallback(() => {
    setTxState({ step: 'idle' });
  }, []);

  const getSignerProvider = useCallback(async (): Promise<any> => {
    const fromKit = getProvider(WalletType.STELLAR);
    if (fromKit) return fromKit;

    try {
      const isFreighterConnected = await FreighterApi.isConnected();
      if (isFreighterConnected) {
        return {
          _isFreighter: true,
          signTransaction: (xdrToSign: string, opts: any) =>
            FreighterApi.signTransaction(xdrToSign, opts),
        };
      }
    } catch {
      // not available
    }

    if (typeof window !== 'undefined') {
      const w = window as any;
      if (w.freighterApi && typeof w.freighterApi.signTransaction === 'function') {
        return w.freighterApi;
      }
      if (w.freighter && typeof w.freighter.signTransaction === 'function') {
        return w.freighter;
      }
      if (w.stellar && typeof w.stellar.signTransaction === 'function') {
        return w.stellar;
      }
    }
    return null;
  }, [getProvider]);

  /**
   * Execute Deposit
   */
  const executeDeposit = useCallback(
    async (amountStroops: bigint) => {
      if (!stellarAddress) {
        setTxState({ step: 'failed', errorMessage: 'Please connect your Stellar wallet first.' });
        return;
      }
      if (amountStroops <= 0n) {
        setTxState({ step: 'failed', errorMessage: 'Please enter a valid deposit amount.' });
        return;
      }

      const env = getVaultEnvironment(currentNetwork);

      try {
        setTxState({ step: 'building' });
        const { xdr } = await VaultService.buildDepositTransaction(
          vault,
          stellarAddress,
          amountStroops,
          currentNetwork
        );

        setTxState({ step: 'awaiting_signature' });
        const provider = await getSignerProvider();
        let signedXdr = '';

        if (provider) {
          signedXdr = await signStellarTransactionOnly(
            xdr,
            env.networkPassphrase,
            provider,
            currentNetwork
          );
        } else {
          throw new Error(
            'No compatible Stellar wallet provider found. Please connect Freighter or SwiftEx Extension.'
          );
        }

        setTxState({ step: 'submitting' });
        const hash = await VaultService.submitSignedTransaction(signedXdr, currentNetwork);

        setTxState({ step: 'pending', txHash: hash });
        await VaultService.pollTransactionStatus(hash, currentNetwork);

        const storedKey = `swiftex_vault_principal_${vault.id}_${stellarAddress}`;
        const prev = BigInt(localStorage.getItem(storedKey) || '0');
        localStorage.setItem(storedKey, (prev + amountStroops).toString());

        const actKey = getVaultActivityKey(currentNetwork, stellarAddress, vault.vaultAddress);
        useVaultActivityStore.getState().addActivity(actKey, {
          id: hash,
          type: 'deposit',
          vaultId: vault.id,
          vaultName: vault.name,
          vaultAddress: vault.vaultAddress,
          amount: (Number(amountStroops) / 1e7).toFixed(2),
          symbol: vault.underlyingAsset.symbol,
          txHash: hash,
          timestamp: Date.now(),
          status: 'confirmed',
        });

        setTxState({ step: 'success', txHash: hash });
        return hash;
      } catch (err: any) {
        console.error('[useVaultAction] Deposit error:', err);
        const rawMsg = err?.message || String(err);
        let humanMsg = rawMsg;
        if (rawMsg.includes('#13') || rawMsg.includes('balance')) {
          humanMsg = 'Insufficient balance of USDC in your wallet.';
        } else if (rawMsg.includes('User rejected') || rawMsg.includes('cancelled')) {
          humanMsg = 'Transaction was cancelled by user.';
        }
        setTxState({ step: 'failed', errorMessage: humanMsg });
        throw err;
      }
    },
    [vault, stellarAddress, currentNetwork, getSignerProvider]
  );

  /**
   * Execute Withdraw
   */
  const executeWithdraw = useCallback(
    async (sharesToBurn: bigint) => {
      if (!stellarAddress) {
        setTxState({ step: 'failed', errorMessage: 'Please connect your Stellar wallet first.' });
        return;
      }
      if (sharesToBurn <= 0n) {
        setTxState({ step: 'failed', errorMessage: 'Please enter a valid withdrawal amount.' });
        return;
      }

      const env = getVaultEnvironment(currentNetwork);

      try {
        setTxState({ step: 'building' });
        const { xdr } = await VaultService.buildWithdrawTransaction(
          vault,
          stellarAddress,
          sharesToBurn,
          currentNetwork
        );

        setTxState({ step: 'awaiting_signature' });
        const provider = await getSignerProvider();
        let signedXdr = '';

        if (provider) {
          signedXdr = await signStellarTransactionOnly(
            xdr,
            env.networkPassphrase,
            provider,
            currentNetwork
          );
        } else {
          throw new Error(
            'No compatible Stellar wallet provider found. Please connect Freighter or SwiftEx Extension.'
          );
        }

        setTxState({ step: 'submitting' });
        const hash = await VaultService.submitSignedTransaction(signedXdr, currentNetwork);

        setTxState({ step: 'pending', txHash: hash });
        await VaultService.pollTransactionStatus(hash, currentNetwork);

        const storedKey = `swiftex_vault_principal_${vault.id}_${stellarAddress}`;
        const prev = BigInt(localStorage.getItem(storedKey) || '0');
        const remaining = prev > sharesToBurn ? prev - sharesToBurn : 0n;
        localStorage.setItem(storedKey, remaining.toString());

        const actKey = getVaultActivityKey(currentNetwork, stellarAddress, vault.vaultAddress);
        useVaultActivityStore.getState().addActivity(actKey, {
          id: hash,
          type: 'withdraw',
          vaultId: vault.id,
          vaultName: vault.name,
          vaultAddress: vault.vaultAddress,
          amount: (Number(sharesToBurn) / 1e7).toFixed(2),
          symbol: vault.underlyingAsset.symbol,
          txHash: hash,
          timestamp: Date.now(),
          status: 'confirmed',
        });

        setTxState({ step: 'success', txHash: hash });
        return hash;
      } catch (err: any) {
        console.error('[useVaultAction] Withdraw error:', err);
        const rawMsg = err?.message || String(err);
        let humanMsg = rawMsg;
        if (rawMsg.includes('User rejected') || rawMsg.includes('cancelled')) {
          humanMsg = 'Transaction was cancelled by user.';
        } else if (rawMsg.includes('liquidity')) {
          humanMsg =
            'Underlying pool liquidity is currently constrained. Please try a smaller amount.';
        }
        setTxState({ step: 'failed', errorMessage: humanMsg });
        throw err;
      }
    },
    [vault, stellarAddress, currentNetwork, getSignerProvider]
  );

  return {
    txState,
    resetTxState,
    executeDeposit,
    executeWithdraw,
  };
};
