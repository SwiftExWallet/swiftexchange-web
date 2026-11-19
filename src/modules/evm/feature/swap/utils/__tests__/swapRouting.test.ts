import { describe, expect, it } from 'vitest';

import { mapSwapError, parseSwapError } from '../swapErrorHandler';
import { getButtonLabel } from '../swapQuoteUtils';
import { isProxyProvider, selectProvider } from '../swapRoutingUtils';

describe('Task 2 & 3: selectProvider - Pure Routing Rules', () => {
  // Rule 1: EVM -> EVM same chain, gasless OFF -> Uniswap
  it('Rule 1: selects "uniswap" for EVM same-chain when gasless is OFF', () => {
    const result = selectProvider({
      fromChain: 1,
      toChain: 1,
      gaslessEnabled: false,
    });
    expect(result).toBe('uniswap');

    const bscResult = selectProvider({
      fromChain: 56,
      toChain: 56,
      gaslessEnabled: false,
    });
    expect(bscResult).toBe('uniswap');
  });

  // Rule 2: EVM -> EVM same chain, gasless ON -> Fusion gasless
  it('Rule 2: selects "fusion" for EVM same-chain when gasless is ON', () => {
    const result = selectProvider({
      fromChain: 1,
      toChain: 1,
      gaslessEnabled: true,
    });
    expect(result).toBe('fusion');

    const polygonResult = selectProvider({
      fromChain: 137,
      toChain: 137,
      gaslessEnabled: true,
    });
    expect(polygonResult).toBe('fusion');
  });

  // Rule 3: EVM -> EVM cross-chain -> Fusion+
  it('Rule 3: selects "fusion_plus" for EVM cross-chain swaps regardless of gasless toggle', () => {
    const sepoliaToBscTestnet = selectProvider({
      fromChain: 11155111,
      toChain: 97,
      gaslessEnabled: false,
    });
    expect(sepoliaToBscTestnet).toBe('fusion_plus');

    const ethToArb = selectProvider({
      fromChain: 1,
      toChain: 42161,
      gaslessEnabled: true,
    });
    expect(ethToArb).toBe('fusion_plus');
  });

  // Rule 4: EVM <-> Stellar (both directions) -> NEAR Intents
  it('Rule 4: selects "near_intent" for EVM to Stellar swaps', () => {
    const evmToStellar = selectProvider({
      fromChain: 1,
      toChain: 'pubnet',
      gaslessEnabled: false,
    });
    expect(evmToStellar).toBe('near_intent');

    const testnetEvmToStellar = selectProvider({
      fromChain: 11155111,
      toChain: 'testnet',
    });
    expect(testnetEvmToStellar).toBe('near_intent');
  });

  it('Rule 4: selects "near_intent" for Stellar to EVM swaps', () => {
    const stellarToEvm = selectProvider({
      fromChain: 'pubnet',
      toChain: 1,
      gaslessEnabled: false,
    });
    expect(stellarToEvm).toBe('near_intent');

    const testnetStellarToEvm = selectProvider({
      fromChain: 'testnet',
      toChain: 97,
    });
    expect(testnetStellarToEvm).toBe('near_intent');
  });

  // Rule 5: Everything else -> 'unsupported' (Never fallback)
  it('Rule 5: defaults to "unsupported" for non-EVM<->Stellar pairs and missing chains', () => {
    // Stellar to Stellar
    expect(
      selectProvider({
        fromChain: 'pubnet',
        toChain: 'pubnet',
      })
    ).toBe('unsupported');

    // Missing chains
    expect(
      selectProvider({
        fromChain: null,
        toChain: 1,
      })
    ).toBe('unsupported');

    expect(
      selectProvider({
        fromChain: 1,
        toChain: null,
      })
    ).toBe('unsupported');

    // Unsupported non-EVM non-Stellar chains
    expect(
      selectProvider({
        fromChain: 'cosmos',
        toChain: 'solana',
      })
    ).toBe('unsupported');
  });

  // Pure function principle check: auth, address, balance do NOT alter provider choice
  it('provider selection is pure and strictly independent of wallet, token, or address', () => {
    const base = { fromChain: 11155111, toChain: 97, gaslessEnabled: false };
    const withExtraFields = {
      ...base,
      walletAddress: '0x123',
      balance: '1000',
      authToken: 'token_xyz',
    };
    expect(selectProvider(base)).toBe('fusion_plus');
    expect(selectProvider(withExtraFields as any)).toBe('fusion_plus');
  });
});

describe('Task 4: Proxy Providers & Auth Gating', () => {
  it('identifies proxy providers correctly', () => {
    expect(isProxyProvider('fusion')).toBe(true);
    expect(isProxyProvider('fusion_plus')).toBe(true);
    expect(isProxyProvider('uniswap')).toBe(false);
    expect(isProxyProvider('near_intent')).toBe(false);
    expect(isProxyProvider('unsupported')).toBe(false);
  });
});

describe('Task 5: Error Mapping (Zero Provider Leakage)', () => {
  it('maps 401 / unauthorized to "Session expired. Reconnect your wallet"', () => {
    expect(mapSwapError({ status: 401, message: 'Unauthorized' })).toBe(
      'Session expired. Reconnect your wallet'
    );
    expect(mapSwapError('Error 401: jwt expired')).toBe('Session expired. Reconnect your wallet');
    expect(mapSwapError({ statusCode: 401 })).toBe('Session expired. Reconnect your wallet');
  });

  it('maps 5xx, timeouts, and network failures to "Service unavailable. Try again"', () => {
    expect(mapSwapError({ status: 500, message: 'Internal Server Error' })).toBe(
      'Service unavailable. Try again'
    );
    expect(mapSwapError({ statusCode: 502, message: 'Bad Gateway' })).toBe(
      'Service unavailable. Try again'
    );
    expect(mapSwapError({ status: 503 })).toBe('Service unavailable. Try again');
    expect(mapSwapError(new Error('Connection timed out'))).toBe('Service unavailable. Try again');
    expect(mapSwapError('Failed to fetch from proxy')).toBe('Service unavailable. Try again');
  });

  it('maps testnet errors to "Not available on testnet"', () => {
    expect(
      mapSwapError('NEAR Intents is not supported on Testnet. Please switch to Mainnet.')
    ).toBe('Not available on testnet');
    expect(mapSwapError('Swaps only available on mainnet for this route')).toBe(
      'Not available on testnet'
    );
  });

  it('maps unsupported pair errors to "This pair isn\'t available yet"', () => {
    expect(mapSwapError('Pair not supported by NEAR Intents')).toBe(
      "This pair isn't available yet"
    );
    expect(mapSwapError('Unsupported pair for cross-chain')).toBe("This pair isn't available yet");
    expect(mapSwapError('Route unsupported')).toBe("This pair isn't available yet");
  });

  it('maps liquidity / route errors to "No route found for this amount"', () => {
    expect(mapSwapError('Insufficient liquidity for swap')).toBe('No route found for this amount');
    expect(mapSwapError('No swap route found for pool')).toBe('No route found for this amount');
    expect(mapSwapError('No route found for 1000 ETH')).toBe('No route found for this amount');
  });

  it('never exposes provider names (1inch, NEAR, Fusion, Uniswap, Soroswap, Aquarius) in output', () => {
    const errorWithProviders =
      '1inch Fusion Plus returned error: Pair not supported by NEAR Intents and Uniswap router';
    const mapped = mapSwapError(errorWithProviders);
    expect(mapped.toLowerCase()).not.toContain('1inch');
    expect(mapped.toLowerCase()).not.toContain('near');
    expect(mapped.toLowerCase()).not.toContain('fusion');
    expect(mapped.toLowerCase()).not.toContain('uniswap');
  });

  it('parseSwapError delegates to mapped standard errors without fallback trigger', () => {
    expect(parseSwapError({ status: 401 })).toBe('Session expired. Reconnect your wallet');
    expect(parseSwapError({ status: 503 })).toBe('Service unavailable. Try again');
    expect(parseSwapError('Pair not supported')).toBe("This pair isn't available yet");
  });
});

describe('Task 8: Button State Machine', () => {
  const baseButtonParams = {
    isFetchingSwapAssets: false,
    isQuoteLoading: false,
    isFetchingStellarAssets: false,
    sellAmount: '1.0',
    isSameAssetSelected: false,
    errorMessage: null,
    isInsufficientBalance: false,
    isAmountLessThanFee: false,
    hasInsufficientStellarGas: false,
    hasInsufficientEvmGas: false,
    fromChainId: 1,
    toChainId: 1,
    selectedBuyAsset: null,
    nativeSymbol: 'ETH',
    sellAssetSymbol: 'ETH',
    isWalletConnected: true,
  };

  it('State 1: returns "Connect Wallet" when wallet is not connected', () => {
    expect(getButtonLabel({ ...baseButtonParams, isWalletConnected: false })).toBe(
      'Connect Wallet'
    );
    expect(getButtonLabel({ ...baseButtonParams, missingWallets: ['evm'] })).toBe(
      'Connect EVM Wallet'
    );
    expect(getButtonLabel({ ...baseButtonParams, missingWallets: ['wallet'] })).toBe(
      'Connect Wallet'
    );
    expect(getButtonLabel({ ...baseButtonParams, missingWallets: ['evm', 'stellar'] })).toBe(
      'Connect Wallet'
    );
  });

  it('State 2: returns "Enter amount" when amount is empty or zero', () => {
    expect(getButtonLabel({ ...baseButtonParams, sellAmount: '' })).toBe('Enter amount');
    expect(getButtonLabel({ ...baseButtonParams, sellAmount: '0' })).toBe('Enter amount');
  });

  it('State 3: returns "Pair not available" for unsupported pairs', () => {
    expect(
      getButtonLabel({
        ...baseButtonParams,
        isUnsupportedPair: true,
      })
    ).toBe('Pair not available');

    expect(
      getButtonLabel({
        ...baseButtonParams,
        errorMessage: "This pair isn't available yet",
      })
    ).toBe('Pair not available');

    expect(
      getButtonLabel({
        ...baseButtonParams,
        errorMessage: 'Not available on testnet',
      })
    ).toBe('Not available on testnet');
  });

  it('State 4: returns "Insufficient {symbol} balance" when balance is insufficient', () => {
    expect(
      getButtonLabel({
        ...baseButtonParams,
        isInsufficientBalance: true,
        sellAssetSymbol: 'USDC',
      })
    ).toBe('Insufficient USDC balance');

    expect(
      getButtonLabel({
        ...baseButtonParams,
        isInsufficientBalance: true,
        sellAssetSymbol: 'ETH',
      })
    ).toBe('Insufficient ETH balance');
  });

  it('State 5: returns "Switch to {chain}" when on wrong chain', () => {
    expect(
      getButtonLabel({
        ...baseButtonParams,
        isWrongChain: true,
        targetChainName: 'Arbitrum',
      })
    ).toBe('Switch to Arbitrum');
  });

  it('State 6: returns "Approve {symbol}" when token approval is needed', () => {
    expect(
      getButtonLabel({
        ...baseButtonParams,
        isApprovalNeeded: true,
        sellAssetSymbol: 'USDT',
      })
    ).toBe('Approve USDT');
  });

  it('State 7: returns "Swap" when ready', () => {
    expect(getButtonLabel(baseButtonParams)).toBe('Swap');
  });
});
