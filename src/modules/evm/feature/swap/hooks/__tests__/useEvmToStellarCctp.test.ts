import { act, cleanup, renderHook, waitFor } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as cctpService from '../../../../../../service/evmToStellarCctpService';
import { sendEVMTransaction } from '../../../../../../utils/walletConnectUtils';
import { signAndSubmitTransaction } from '../../../../../stellar/utils/transactionService';
import { useEvmToStellarCctp } from '../useEvmToStellarCctp';

vi.mock('../../../../../../service/evmToStellarCctpService', async () => {
  const actual = await vi.importActual<
    typeof import('../../../../../../service/evmToStellarCctpService')
  >('../../../../../../service/evmToStellarCctpService');
  return {
    ...actual,
    getCctpBridgeQuote: vi.fn(),
    createCctpBridge: vi.fn(),
    submitCctpSourceTx: vi.fn(),
    submitCctpApprovalTx: vi.fn(),
    submitCctpDestinationTx: vi.fn(),
    submitCctpEvmSignature: vi.fn(),
    submitCctpStellarSignature: vi.fn(),
    getCctpBridgeTransfer: vi.fn(),
  };
});

vi.mock('../../../../../../utils/walletConnectUtils', () => ({
  sendEVMTransaction: vi.fn(),
}));

vi.mock('../../../../../stellar/utils/transactionService', () => ({
  signAndSubmitTransaction: vi.fn(),
  refreshStellarPreconditions: vi.fn((xdr: string) => xdr),
}));

describe('useEvmToStellarCctp', () => {
  const mockEvmAddress = '0x8d7890D69df39691120c6D3ee55EEe7e46A477AE';
  const mockStellarAddress = 'GDYBA3XIRLC7SJHPVSYLYTKE32ZBJRVOX6JQDHFHHRLGAIVAEYF5VOTA';

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    (signAndSubmitTransaction as any).mockReset();
    (sendEVMTransaction as any).mockReset();
    (cctpService.getCctpBridgeQuote as any).mockReset();
    (cctpService.createCctpBridge as any).mockReset();
    (cctpService.submitCctpSourceTx as any).mockReset();
    (cctpService.submitCctpApprovalTx as any).mockReset();
    (cctpService.submitCctpDestinationTx as any).mockReset();
    (cctpService.getCctpBridgeTransfer as any).mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it('excludes BNB from CCTP supported EVM chains', () => {
    const chains = cctpService.CCTP_SUPPORTED_EVM_CHAINS;
    const bnbChain = chains.find(c => c.id === 'bsc' || c.symbol === 'BNB');
    expect(bnbChain).toBeUndefined();
    expect(chains.some(c => c.id === 'ethereum')).toBe(true);
    expect(chains.some(c => c.id === 'arbitrum')).toBe(true);
    expect(chains.some(c => c.id === 'base')).toBe(true);
    expect(chains.some(c => c.id === 'optimism')).toBe(true);
    expect(chains.some(c => c.id === 'avalanche')).toBe(true);
  });

  it('fetches a quote correctly with fast=true by default for EVM chains and direction=EVM_TO_STELLAR', async () => {
    const mockQuote: cctpService.CctpBridgeQuote = {
      amount: '2',
      protocolFee: '0.01',
      maxFee: '0.001',
      minimumReceived: '1.989',
    };
    (cctpService.getCctpBridgeQuote as any).mockResolvedValue(mockQuote);

    const { result } = renderHook(() =>
      useEvmToStellarCctp({
        evmAddress: mockEvmAddress,
        stellarAddress: mockStellarAddress,
        network: 'testnet',
      })
    );

    act(() => {
      result.current.setAmount('2');
    });

    await act(async () => {
      await result.current.getQuote();
    });

    expect(cctpService.getCctpBridgeQuote).toHaveBeenCalledWith(
      {
        direction: 'EVM_TO_STELLAR',
        evmAddress: mockEvmAddress,
        stellarAddress: mockStellarAddress,
        amount: '2',
        sourceChain: 'sepolia',
        fast: true,
      },
      expect.any(AbortSignal)
    );
    expect(result.current.quote).toEqual(mockQuote);
  });

  it('calls sendEVMTransaction and submits broadcast txHash to backend via submitCctpSourceTx on EVM deposit', async () => {
    const rawTx = {
      chainId: '0xaa36a7',
      type: 0,
      nonce: '0x24',
      gasPrice: '0x40e4e346',
      gasLimit: '0x107a0',
      value: '0x0',
      to: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
      data: '0x095ea7b3000000000000000000000000b81fbd73c129d047806c2f1b6538359430e2990f00000000000000000000000000000000000000000000000000000000001e8480',
    };

    const mockTransferResponse: cctpService.CctpBridgeTransfer = {
      id: 'f15bc324-5df6-4ba9-befe-27a120eed6b1',
      status: 'BRIDGE_SIGNATURE_REQUIRED',
      signingRequest: {
        type: 'EVM',
        purpose: 'BRIDGE',
        rawTx,
      },
    };

    const mockTxHash = '0xd6a7ffd2b8b07e26795b0cf6804d937df565275e767efae9e204fe2c95629824';

    const mockEvmProvider = {
      request: vi.fn().mockImplementation(async ({ method }) => {
        if (method === 'eth_chainId') return '0xaa36a7';
        return null;
      }),
    };

    (sendEVMTransaction as any).mockResolvedValue(mockTxHash);
    (cctpService.createCctpBridge as any).mockResolvedValue(mockTransferResponse);
    (cctpService.submitCctpSourceTx as any).mockResolvedValue({
      ...mockTransferResponse,
      status: 'SOURCE_PENDING',
      sourceTxHash: mockTxHash,
    });

    const { result } = renderHook(() =>
      useEvmToStellarCctp({
        evmAddress: mockEvmAddress,
        stellarAddress: mockStellarAddress,
        evmProvider: mockEvmProvider,
        network: 'testnet',
      })
    );

    act(() => {
      result.current.setAmount('2');
    });

    (cctpService.getCctpBridgeQuote as any).mockResolvedValue({
      amount: '2',
      protocolFee: '0.01',
      maxFee: '0.001',
      minimumReceived: '1.989',
    });
    await act(async () => {
      await result.current.getQuote();
    });

    await act(async () => {
      await result.current.startBridge();
    });

    await waitFor(() => {
      expect(sendEVMTransaction).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(cctpService.submitCctpSourceTx).toHaveBeenCalledWith(
        'f15bc324-5df6-4ba9-befe-27a120eed6b1',
        mockTxHash
      );
    });

    expect(cctpService.submitCctpEvmSignature).not.toHaveBeenCalled();
  });

  it('calls signAndSubmitTransaction and submitCctpSourceTx for STELLAR_TO_EVM direct broadcast', async () => {
    const mockTransferResponse: cctpService.CctpBridgeTransfer = {
      id: 'stellar-transfer-123',
      status: 'STELLAR_SIGNATURE_REQUIRED',
      signingRequest: {
        type: 'STELLAR',
        purpose: 'BRIDGE',
        xdr: 'mock-xdr-payload',
      },
    };

    const mockStellarTxHash = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

    (signAndSubmitTransaction as any).mockResolvedValue({
      success: true,
      hash: mockStellarTxHash,
    });
    (cctpService.createCctpBridge as any).mockResolvedValue(mockTransferResponse);
    (cctpService.submitCctpSourceTx as any).mockResolvedValue({
      ...mockTransferResponse,
      status: 'SOURCE_PENDING',
      sourceTxHash: mockStellarTxHash,
    });

    const { result } = renderHook(() =>
      useEvmToStellarCctp({
        evmAddress: mockEvmAddress,
        stellarAddress: mockStellarAddress,
        initialDirection: 'STELLAR_TO_EVM',
        network: 'testnet',
      })
    );

    act(() => {
      result.current.setAmount('5');
    });

    (cctpService.getCctpBridgeQuote as any).mockResolvedValue({
      amount: '5',
      protocolFee: '0.02',
      maxFee: '0.001',
      minimumReceived: '4.979',
    });
    await act(async () => {
      await result.current.getQuote();
    });

    expect(cctpService.getCctpBridgeQuote).toHaveBeenCalledWith(
      expect.objectContaining({
        direction: 'STELLAR_TO_EVM',
        sourceChain: 'sepolia',
        fast: false,
      }),
      expect.any(AbortSignal)
    );

    await act(async () => {
      await result.current.startBridge();
    });

    expect(cctpService.createCctpBridge).toHaveBeenCalledWith(
      expect.objectContaining({
        direction: 'STELLAR_TO_EVM',
        sourceChain: 'sepolia',
        fast: false,
        idempotencyKey: expect.any(String),
      })
    );

    await waitFor(() => {
      expect(signAndSubmitTransaction).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(cctpService.submitCctpSourceTx).toHaveBeenCalledWith(
        'stellar-transfer-123',
        mockStellarTxHash
      );
    });
  });

  it('handles STELLAR_SIGNATURE_REQUIRED with purpose MINT by signing and broadcasting on Stellar network', async () => {
    const mockMintXdr = 'AAAAAgMockMintXdrPayload==';
    const mockDestTxHash = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';

    (signAndSubmitTransaction as any).mockResolvedValue({
      success: true,
      hash: mockDestTxHash,
    });

    const mockTransferState: cctpService.CctpBridgeTransfer = {
      id: 'bd849580-f108-4ddd-983b-a4e753ffc235',
      direction: 'EVM_TO_STELLAR',
      sourceChain: 'arbitrum_sepolia',
      status: 'STELLAR_SIGNATURE_REQUIRED',
      sourceTxHash: '0x3009672fe4a69063ff3fac1f13406aa692480a2a48a2822aac629f9c7f1b7bcd',
      stellarUnsignedXdr: mockMintXdr,
      signingRequest: {
        type: 'STELLAR',
        purpose: 'MINT',
        xdr: mockMintXdr,
      },
    };

    const { result } = renderHook(() =>
      useEvmToStellarCctp({
        evmAddress: mockEvmAddress,
        stellarAddress: mockStellarAddress,
        network: 'testnet',
      })
    );

    act(() => {
      result.current.setTransfer(mockTransferState);
    });

    await waitFor(() => {
      expect(signAndSubmitTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          xdr: mockMintXdr,
        })
      );
    });

    await waitFor(() => {
      expect(result.current.status).toBe('COMPLETED');
      expect(result.current.transfer?.destinationTxHash).toBe(mockDestTxHash);
    });
  });

  it('handles STELLAR_TO_EVM MINT_SIGNATURE_REQUIRED by sending EVM transaction and submitting destination tx to backend', async () => {
    const mockDestEvmTxHash = '0x8888888888abcdef8888888888abcdef8888888888abcdef8888888888abcdef';
    (sendEVMTransaction as any).mockResolvedValue(mockDestEvmTxHash);

    const mockTransferState: cctpService.CctpBridgeTransfer = {
      id: '5c55a7cd-2248-4a87-9eac-fdf99fa7c64e',
      direction: 'STELLAR_TO_EVM',
      status: 'MINT_SIGNATURE_REQUIRED',
      sourceTxHash: '5f69cbceb77f122e4f7dda3e7285838a75968305ee8b28edd85a24bd1d67dbb5',
      destinationTxHash: null,
      message: '0x000000010000001b',
      attestation: '0x66ea5f0e',
      signingRequest: {
        type: 'EVM',
        purpose: 'MINT',
        rawTx: {
          chainId: '0xaa36a7',
          type: 0,
          nonce: '0x46',
          gasPrice: '0x4d2e17d3',
          gasLimit: '0x2dfea',
          value: '0x0',
          to: '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275',
          data: '0x57ecfd2800000000',
        },
      },
    };

    const mockEvmProvider = {
      request: vi.fn().mockImplementation(async ({ method }) => {
        if (method === 'eth_chainId') return '0xaa36a7';
        return null;
      }),
    };

    const { result } = renderHook(() =>
      useEvmToStellarCctp({
        evmAddress: mockEvmAddress,
        stellarAddress: mockStellarAddress,
        network: 'testnet',
        evmProvider: mockEvmProvider,
      })
    );

    act(() => {
      result.current.setDirection('STELLAR_TO_EVM');
      result.current.setTransfer(mockTransferState);
    });

    await waitFor(() => {
      expect(sendEVMTransaction).toHaveBeenCalledWith(
        mockEvmProvider,
        11155111,
        expect.objectContaining({
          to: '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275',
        })
      );
    });

    await waitFor(() => {
      expect(cctpService.submitCctpDestinationTx).toHaveBeenCalledWith(
        '5c55a7cd-2248-4a87-9eac-fdf99fa7c64e',
        mockDestEvmTxHash
      );
    });

    await waitFor(() => {
      expect(result.current.status).toBe('COMPLETED');
      expect(result.current.transfer?.destinationTxHash).toBe(mockDestEvmTxHash);
    });
  });

  it('handles STELLAR_TO_EVM APPROVAL_SIGNATURE_REQUIRED by broadcasting approval and setting APPROVAL_PENDING', async () => {
    const mockXdr = 'AAAAAgMockXdrPayload==';
    const mockTxHash = '1111111111abcdef1111111111abcdef1111111111abcdef1111111111abcdef';

    (signAndSubmitTransaction as any).mockResolvedValue({
      success: true,
      hash: mockTxHash,
      signedXdr: mockXdr,
    });

    const mockInitialTransfer: cctpService.CctpBridgeTransfer = {
      id: 'stellar-transfer-123',
      direction: 'STELLAR_TO_EVM',
      sourceChain: 'sepolia',
      status: 'APPROVAL_SIGNATURE_REQUIRED',
      idempotencyKey: 'idemp-123',
      stellarUnsignedXdr: mockXdr,
    };

    const mockBurnTransfer: cctpService.CctpBridgeTransfer = {
      id: 'stellar-transfer-123',
      direction: 'STELLAR_TO_EVM',
      sourceChain: 'sepolia',
      status: 'BURN_SIGNATURE_REQUIRED',
      idempotencyKey: 'idemp-123',
      stellarUnsignedXdr: mockXdr,
      signingRequest: {
        type: 'STELLAR',
        purpose: 'BURN',
        xdr: mockXdr,
      },
    };

    (cctpService.submitCctpApprovalTx as any).mockResolvedValue({
      ...mockInitialTransfer,
      status: 'APPROVAL_PENDING',
      approvalTxHash: mockTxHash,
    });
    (cctpService.getCctpBridgeTransfer as any).mockResolvedValue(mockBurnTransfer);

    const { result } = renderHook(() =>
      useEvmToStellarCctp({
        evmAddress: mockEvmAddress,
        stellarAddress: mockStellarAddress,
        initialDirection: 'STELLAR_TO_EVM',
        network: 'testnet',
      })
    );

    act(() => {
      result.current.setTransfer(mockInitialTransfer);
    });

    await waitFor(
      () => {
        expect(signAndSubmitTransaction).toHaveBeenCalled();
        expect(cctpService.submitCctpApprovalTx).toHaveBeenCalledWith(
          'stellar-transfer-123',
          mockTxHash
        );
      },
      { timeout: 10000 }
    );
  });

  it('validates EVM and Stellar addresses and USDC amount strings', () => {
    // EVM Address
    expect(cctpService.validateEvmAddress(mockEvmAddress).valid).toBe(true);
    expect(cctpService.validateEvmAddress('invalid-evm').valid).toBe(false);
    expect(cctpService.validateEvmAddress('').valid).toBe(false);

    // Stellar Address
    expect(cctpService.validateStellarAddress(mockStellarAddress).valid).toBe(true);
    expect(cctpService.validateStellarAddress('invalid-stellar').valid).toBe(false);
    expect(
      cctpService.validateStellarAddress('0x8d7890D69df39691120c6D3ee55EEe7e46A477AE').valid
    ).toBe(false);

    // USDC Amount
    expect(cctpService.validateUsdcAmount('1').valid).toBe(true);
    expect(cctpService.validateUsdcAmount('1.234567').valid).toBe(true);
    expect(cctpService.validateUsdcAmount('1.2345678').valid).toBe(false); // > 6 decimals
    expect(cctpService.validateUsdcAmount('0').valid).toBe(false); // not positive
    expect(cctpService.validateUsdcAmount('-5').valid).toBe(false); // negative
    expect(cctpService.validateUsdcAmount('abc').valid).toBe(false);
  });

  it('formats bridge errors into { error: { code, message } }', () => {
    const userRejectErr = cctpService.formatBridgeError(new Error('User rejected the transaction'));
    expect(userRejectErr.error.code).toBe('USER_REJECTED');

    const decimalErr = cctpService.formatBridgeError(
      new Error('amount must have at most 6 decimals')
    );
    expect(decimalErr.error.code).toBe('INVALID_AMOUNT');
  });

  it('handles user wallet rejection by marking transfer as CANCELLED', async () => {
    (signAndSubmitTransaction as any).mockReset();
    (signAndSubmitTransaction as any).mockResolvedValue({
      success: false,
      error: 'User rejected the transaction',
    });

    const mockTransfer: cctpService.CctpBridgeTransfer = {
      id: 'stellar-reject-123',
      direction: 'STELLAR_TO_EVM',
      sourceChain: 'sepolia',
      status: 'APPROVAL_SIGNATURE_REQUIRED',
      idempotencyKey: 'idemp-reject',
      signingRequest: {
        type: 'STELLAR',
        purpose: 'APPROVAL',
        xdr: 'AAAAAgAAAADwEG7oisX5JO+ssLxNRN6y...',
      },
    };

    const { result } = renderHook(() =>
      useEvmToStellarCctp({
        evmAddress: mockEvmAddress,
        stellarAddress: mockStellarAddress,
        initialDirection: 'STELLAR_TO_EVM',
        network: 'testnet',
      })
    );

    act(() => {
      result.current.setTransfer(mockTransfer);
    });

    await waitFor(
      () => {
        expect(result.current.transfer?.status).toBe('CANCELLED');
        expect(result.current.message).toContain('rejected by user');
      },
      { timeout: 4000 }
    );
  });

  it('strictly forces fast=false for Avalanche as Avax does not support CCTP Fast Transfer', async () => {
    const { result } = renderHook(() =>
      useEvmToStellarCctp({
        evmAddress: mockEvmAddress,
        stellarAddress: mockStellarAddress,
        initialDirection: 'EVM_TO_STELLAR',
        initialEvmChainId: 43113,
        initialFast: true,
        network: 'testnet',
      })
    );

    expect(result.current.isAvax).toBe(true);
    expect(result.current.isFastSupported).toBe(false);
    expect(result.current.fast).toBe(false);

    // Try toggling fastEnabled to true on Avax
    act(() => {
      result.current.setFastEnabled(true);
    });
    // Must strictly remain false for Avalanche
    expect(result.current.fast).toBe(false);

    // Switch to Sepolia (supports fast transfer)
    act(() => {
      result.current.setSelectedEvmChainId(11155111);
    });
    expect(result.current.isAvax).toBe(false);
    expect(result.current.isFastSupported).toBe(true);
    expect(result.current.fast).toBe(true);
  });

  it('sends sourceChain when direction is STELLAR_TO_EVM to match backend DTO requirement', async () => {
    const mockQuote: cctpService.CctpBridgeQuote = {
      amount: '5',
      protocolFee: '0.02',
      maxFee: '0.001',
      minimumReceived: '4.979',
    };
    (cctpService.getCctpBridgeQuote as any).mockResolvedValue(mockQuote);

    const { result } = renderHook(() =>
      useEvmToStellarCctp({
        evmAddress: mockEvmAddress,
        stellarAddress: mockStellarAddress,
        initialDirection: 'STELLAR_TO_EVM',
        network: 'testnet',
      })
    );

    act(() => {
      result.current.setAmount('5');
    });

    await act(async () => {
      await result.current.getQuote('5');
    });

    expect(cctpService.getCctpBridgeQuote).toHaveBeenCalledWith(
      expect.objectContaining({
        direction: 'STELLAR_TO_EVM',
        sourceChain: 'sepolia',
        fast: false,
      }),
      expect.any(AbortSignal)
    );
  }, 15000);
});
