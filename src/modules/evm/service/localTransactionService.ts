import { getCurrentNetwork } from '../../../service/apiConfig';

const STORAGE_KEY = 'swiftex_local_transactions';
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type TransactionType =
  'swap' | 'send' | 'bridge' | 'approval' | 'trustline' | 'claim' | 'orderbook' | 'crosschain-swap';

export interface LocalTransaction {
  hash: string;
  chainId: number | string;
  type: TransactionType;
  timestamp: number;
  description?: string;
  status?: 'pending' | 'success' | 'failed';
  blockNumber?: number;
  gasUsed?: string;
  destinationHash?: string;
  from?: string;
  to?: string;
  network?: string;
  provider?: string;
}

export const addLocalTransaction = (tx: LocalTransaction): void => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const transactions: LocalTransaction[] = raw ? JSON.parse(raw) : [];
    const filtered = transactions.filter(t => t.hash.toLowerCase() !== tx.hash.toLowerCase());
    const enrichedTx: LocalTransaction = {
      ...tx,
      network: tx.network || getCurrentNetwork(),
    };
    filtered.unshift(enrichedTx);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  } catch (error) {
    console.error('Failed to add local transaction:', error);
  }
};

export const getLocalTransactions = (
  walletAddresses?: string[],
  network?: string
): LocalTransaction[] => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];

    const transactions: LocalTransaction[] = JSON.parse(stored);
    const now = Date.now();
    const activeNetwork = network || getCurrentNetwork();

    const validTransactions = transactions.filter(tx => {
      const isExpired = now - tx.timestamp >= MAX_AGE_MS;
      if (isExpired) return false;

      const isStellar =
        tx.chainId === 'stellar' || tx.chainId === 'pubnet' || tx.chainId === 'testnet';
      if (isStellar && tx.type !== 'bridge' && tx.type !== 'crosschain-swap') {
        return false;
      }
      return true;
    });

    let filteredTransactions = validTransactions;
    if (walletAddresses && walletAddresses.length > 0) {
      const lowerAddresses = walletAddresses.map(addr => addr.toLowerCase());
      filteredTransactions = filteredTransactions.filter(tx => {
        const isStellarTx =
          tx.chainId === 'pubnet' ||
          tx.chainId === 'testnet' ||
          tx.chainId === 'stellar' ||
          (tx.from && tx.from.toUpperCase().startsWith('G') && tx.from.length === 56);

        if (isStellarTx) {
          if (!tx.from) return true;
          return lowerAddresses.includes(tx.from.toLowerCase());
        }

        return tx.from && lowerAddresses.includes(tx.from.toLowerCase());
      });
    }
    if (activeNetwork) {
      filteredTransactions = filteredTransactions.filter(
        tx => !tx.network || tx.network === activeNetwork
      );
    }

    if (validTransactions.length !== transactions.length) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(validTransactions));
    }

    return filteredTransactions;
  } catch (error) {
    console.error('Failed to get local transactions:', error);
    return [];
  }
};

export const updateLocalTransactionStatus = (
  hash: string,
  status: 'pending' | 'success' | 'failed',
  blockNumber?: number,
  gasUsed?: string,
  destinationHash?: string,
  from?: string,
  to?: string
): void => {
  try {
    const transactions = getLocalTransactions();
    const index = transactions.findIndex(tx => tx.hash.toLowerCase() === hash.toLowerCase());
    if (index !== -1) {
      transactions[index] = {
        ...transactions[index],
        status,
        blockNumber: blockNumber ?? transactions[index].blockNumber,
        gasUsed: gasUsed ?? transactions[index].gasUsed,
        destinationHash: destinationHash ?? transactions[index].destinationHash,
        from: from ?? transactions[index].from,
        to: to ?? transactions[index].to,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
    }
  } catch (error) {
    console.error('Failed to update local transaction status:', error);
  }
};

export const removeLocalTransaction = (hash: string): void => {
  try {
    const transactions = getLocalTransactions();
    const filtered = transactions.filter(tx => tx.hash.toLowerCase() !== hash.toLowerCase());
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  } catch (error) {
    console.error('Failed to remove local transaction:', error);
  }
};

export const clearLocalTransactions = (): void => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('Failed to clear local transactions:', error);
  }
};

export const getTransactionsByChain = (chainId: number | string): LocalTransaction[] => {
  return getLocalTransactions().filter(tx => tx.chainId === chainId);
};
