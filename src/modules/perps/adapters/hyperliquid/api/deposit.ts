import { BrowserProvider, Contract, parseUnits } from 'ethers';

import { useExchangeManager } from '../../../core/ExchangeManager';
import { type PerpNetwork, getHyperliquidConfig } from '../../../core/config/networks';

// Hyperliquid Bridge on Arbitrum One (Bridge2) - preserved for backward compatibility
export const HYPERLIQUID_BRIDGE_ADDRESS_ARBITRUM = '0x2Df1c51E09aECF9cacB7bc98cB1742757f163dF7';

// Native USDC on Arbitrum One - preserved for backward compatibility
export const USDC_ADDRESS_ARBITRUM = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';

export type DepositProgress = {
  step: 'SWITCHING_NETWORK' | 'APPROVING' | 'DEPOSITING' | 'SUCCESS' | 'FAILED';
  message: string;
  txHash?: string;
};

// Standard ERC20 ABI for Transfer and Approve
const ERC20_ABI = [
  'function transfer(address to, uint256 amount) public returns (bool)',
  'function approve(address spender, uint256 amount) public returns (bool)',
  'function allowance(address owner, address spender) public view returns (uint256)',
  'function balanceOf(address account) public view returns (uint256)',
];

/**
 * Deposits USDC to the Hyperliquid L1 Bridge (Arbitrum One for mainnet, Arbitrum Sepolia for testnet).
 * Hyperliquid validators listen to the `Transfer` event to the Bridge address.
 */
export async function depositToHyperliquid(
  provider: any,
  amount: string, // in human readable format (e.g., '10.5')
  onProgress?: (progress: DepositProgress) => void,
  networkOverride?: PerpNetwork
): Promise<{ txHash: string; amount: string; asset: string; chainId: number }> {
  const browserProvider = new BrowserProvider(provider);
  const signer = await browserProvider.getSigner();

  const network = networkOverride || useExchangeManager.getState().currentNetwork;
  const config = getHyperliquidConfig(network);

  const providerNetwork = await browserProvider.getNetwork();
  const currentChainId = Number(providerNetwork.chainId);

  if (currentChainId !== config.l1ChainId) {
    const targetChainName = config.isTestnet ? 'Arbitrum Sepolia (421614)' : 'Arbitrum One (42161)';
    throw new Error(
      `Network mismatch: Wallet is connected to chain ${currentChainId}, but Hyperliquid ${network} requires ${targetChainName}. Please switch your network.`
    );
  }

  onProgress?.({
    step: 'DEPOSITING',
    message: `Initiating USDC transfer to Hyperliquid bridge on ${config.isTestnet ? 'Arbitrum Sepolia' : 'Arbitrum'}...`,
  });

  // USDC uses 6 decimals
  const parsedAmount = parseUnits(amount, 6);
  const usdcContract = new Contract(config.usdcAddress, ERC20_ABI, signer);

  // Hyperliquid bridge works by simply transferring USDC to the bridge address.
  // The L1 indexer monitors these ERC20 transfers and credits the sender.
  const tx = await usdcContract.transfer(config.depositBridge, parsedAmount);

  onProgress?.({
    step: 'DEPOSITING',
    message: 'Transaction submitted. Waiting for on-chain confirmation...',
    txHash: tx.hash,
  });

  await tx.wait();

  return {
    txHash: tx.hash,
    amount,
    asset: 'USDC',
    chainId: config.l1ChainId,
  };
}
