import BigNumber from 'bignumber.js';
import { ethers } from 'ethers';

import { switchOrAddChain } from '../../../../evm/utils/evmChainUtils';
import { EVM_CHAINS, getAsterDepositBridge } from '../constants';
import type { DepositAsset } from './account';

export const ASTER_TREASURY_ABI = [
  'function depositNative(uint256 broker) payable',
  'function deposit(address currency, uint256 amount, uint256 broker)',
];

export const REQUIRED_CONFIRMATIONS: Record<number, number> = {
  1: 2, // ETH
  56: 3, // BSC
  42161: 2, // Arbitrum
  97: 3, // BSC Testnet
  421614: 2, // Arb Sepolia
  11155111: 2, // Sepolia
};

export const MAX_DEPOSIT_GAS_LIMIT = 500_000n;
export const DEFAULT_BROKER_ID = 1n;

const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
];

export type DepositStep =
  | 'IDLE'
  | 'SWITCHING_NETWORK'
  | 'CHECKING_BALANCE'
  | 'AWAITING_SIGNATURE'
  | 'BROADCASTING'
  | 'CONFIRMING'
  | 'SUCCESS'
  | 'FAILED';

export interface DepositProgress {
  step: DepositStep;
  message: string;
  txHash?: string;
}

export interface DepositResult {
  success: boolean;
  txHash: string;
  blockNumber: number;
  asset: string;
  amount: string;
  chainId: number;
  explorerUrl?: string;
}

/**
 * Check on-chain balance of an asset (native or ERC20) in user's wallet
 */
export async function fetchOnChainWalletBalance(
  provider: any,
  userAddress: string,
  asset: DepositAsset
): Promise<string> {
  if (!provider || !userAddress || !asset) return '0';
  try {
    const browserProvider = new ethers.BrowserProvider(provider);
    const isNative =
      asset.isNative ||
      !asset.contractAddress ||
      asset.contractAddress === '0x0000000000000000000000000000000000000000';

    if (isNative) {
      const bal = await browserProvider.getBalance(userAddress);
      return ethers.formatEther(bal);
    } else {
      const contract = new ethers.Contract(asset.contractAddress, ERC20_ABI, browserProvider);
      const bal = await contract.balanceOf(userAddress);
      return ethers.formatUnits(bal, asset.decimals || 18);
    }
  } catch (err) {
    console.warn('[Deposit] Failed to fetch on-chain wallet balance:', err);
    return '0';
  }
}

// Execute on-chain deposit of an asset to Aster DEX deposit bridge
export async function depositAssetOnChain(
  provider: any,
  asset: DepositAsset,
  amount: string,
  chainId: number,
  onProgress?: (p: DepositProgress) => void,
  broker: bigint = DEFAULT_BROKER_ID
): Promise<DepositResult> {
  if (!provider) {
    throw new Error('Wallet provider not available. Please connect your Web3 wallet.');
  }

  const bnAmount = new BigNumber(amount);
  if (bnAmount.isNaN() || !bnAmount.isFinite() || bnAmount.isLessThanOrEqualTo(0)) {
    throw new Error('Please enter a valid positive deposit amount.');
  }

  const bridgeAddress = getAsterDepositBridge(chainId);
  if (!bridgeAddress || !ethers.isAddress(bridgeAddress)) {
    throw new Error(`Unsupported deposit chain ${chainId}.`);
  }

  // Switch or add chain in wallet if needed
  onProgress?.({
    step: 'SWITCHING_NETWORK',
    message: `Ensuring wallet is connected to ${EVM_CHAINS[chainId]?.name || 'target chain'}...`,
  });
  await switchOrAddChain(provider, chainId);

  const browserProvider = new ethers.BrowserProvider(provider);
  const signer = await browserProvider.getSigner();
  const userAddress = await signer.getAddress();

  // Pre-flight balance check
  onProgress?.({
    step: 'CHECKING_BALANCE',
    message: 'Verifying wallet token balance...',
  });

  const isNative =
    asset.isNative ||
    !asset.contractAddress ||
    asset.contractAddress === '0x0000000000000000000000000000000000000000';

  const decimals = asset.decimals || 18;
  const parsedAmount = ethers.parseUnits(amount, decimals);
  const confirmations = REQUIRED_CONFIRMATIONS[chainId] || 2;

  if (isNative) {
    const nativeBal = await browserProvider.getBalance(userAddress);
    if (nativeBal < parsedAmount) {
      const avail = ethers.formatEther(nativeBal);
      throw new Error(
        `Insufficient native balance. Required: ${amount} ${asset.name}, Available: ${avail}`
      );
    }

    // Call Aster Treasury depositNative(broker)
    onProgress?.({
      step: 'AWAITING_SIGNATURE',
      message: `Please confirm the ${amount} ${asset.name} deposit to Aster Treasury in your wallet...`,
    });

    const treasury = new ethers.Contract(bridgeAddress, ASTER_TREASURY_ABI, signer);
    const tx = await treasury.depositNative(broker, {
      value: parsedAmount,
      gasLimit: MAX_DEPOSIT_GAS_LIMIT,
    });

    onProgress?.({
      step: 'CONFIRMING',
      message: `Transaction broadcasted. Waiting for ${confirmations} on-chain confirmation(s)...`,
      txHash: tx.hash,
    });

    const receipt = await tx.wait(confirmations);
    if (!receipt || receipt.status === 0) {
      throw new Error('Deposit transaction failed or was reverted on-chain.');
    }

    const explorer = EVM_CHAINS[chainId]?.explorer;
    return {
      success: true,
      txHash: tx.hash,
      blockNumber: receipt.blockNumber,
      asset: asset.name,
      amount,
      chainId,
      explorerUrl: explorer ? `${explorer}/tx/${tx.hash}` : undefined,
    };
  } else {
    // ERC-20 token deposit to Aster bridge
    const tokenContract = new ethers.Contract(asset.contractAddress, ERC20_ABI, signer);

    const tokenBal: bigint = await tokenContract.balanceOf(userAddress);
    if (tokenBal < parsedAmount) {
      const avail = ethers.formatUnits(tokenBal, decimals);
      throw new Error(
        `Insufficient ${asset.name} balance. Required: ${amount}, Available: ${avail}`
      );
    }

    // Check native gas balance
    const nativeGasBal = await browserProvider.getBalance(userAddress);
    if (nativeGasBal === 0n) {
      throw new Error(
        `Insufficient gas to execute transaction. Please fund your wallet with native tokens for gas fees.`
      );
    }

    // Check current allowance and approve Aster treasury if needed
    const currentAllowance: bigint = await tokenContract.allowance(userAddress, bridgeAddress);
    if (currentAllowance < parsedAmount) {
      onProgress?.({
        step: 'AWAITING_SIGNATURE',
        message: `Please approve Aster Treasury to spend ${amount} ${asset.name}...`,
      });

      const approveTx = await tokenContract.approve(bridgeAddress, parsedAmount, {
        gasLimit: MAX_DEPOSIT_GAS_LIMIT,
      });

      onProgress?.({
        step: 'CONFIRMING',
        message: `Approval submitted. Waiting for ${confirmations} on-chain confirmation(s)...`,
        txHash: approveTx.hash,
      });

      const approveReceipt = await approveTx.wait(confirmations);
      if (!approveReceipt || approveReceipt.status === 0) {
        throw new Error('Token approval transaction failed or was reverted on-chain.');
      }
    }

    onProgress?.({
      step: 'AWAITING_SIGNATURE',
      message: `Please confirm the ${amount} ${asset.name} deposit to Aster Treasury in your wallet...`,
    });

    const treasury = new ethers.Contract(bridgeAddress, ASTER_TREASURY_ABI, signer);
    const tx = await treasury.deposit(asset.contractAddress, parsedAmount, broker, {
      gasLimit: MAX_DEPOSIT_GAS_LIMIT,
    });

    onProgress?.({
      step: 'CONFIRMING',
      message: `Deposit broadcasted. Waiting for ${confirmations} on-chain confirmation(s)...`,
      txHash: tx.hash,
    });

    const receipt = await tx.wait(confirmations);
    if (!receipt || receipt.status === 0) {
      throw new Error('Deposit token transfer failed or was reverted on-chain.');
    }

    const explorer = EVM_CHAINS[chainId]?.explorer;
    return {
      success: true,
      txHash: tx.hash,
      blockNumber: receipt.blockNumber,
      asset: asset.name,
      amount,
      chainId,
      explorerUrl: explorer ? `${explorer}/tx/${tx.hash}` : undefined,
    };
  }
}
