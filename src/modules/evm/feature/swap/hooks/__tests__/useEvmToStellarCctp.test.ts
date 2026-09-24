import { act, renderHook, waitFor } from '@testing-library/react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as cctpService from '../../../../../../service/evmToStellarCctpService';
import { sendEVMTransaction } from '../../../../../../utils/walletConnectUtils';
import { useEvmToStellarCctp } from '../useEvmToStellarCctp';

vi.mock('../../../../../../service/evmToStellarCctpService', () => ({
  getCctpBridgeQuote: vi.fn(),
  createCctpBridge: vi.fn(),
  submitCctpEvmSignature: vi.fn(),
  submitCctpStellarSignature: vi.fn(),
  getCctpBridgeTransfer: vi.fn(),
  getCctpChainConfig: vi.fn(() => ({
    nativeChainKey: 'ETH',
    chainId: 11155111,
    network: 'testnet',
  })),
}));

vi.mock('../../../../../../utils/walletConnectUtils', () => ({
  sendEVMTransaction: vi.fn(),
}));

describe('useEvmToStellarCctp', () => {
  const mockEvmAddress = '0x8d7890D69df39691120c6D3ee55EEe7e46A477AE';
  const mockStellarAddress = 'GDYBA3XIRLC7SJHPVSYLYTKE32ZBJRVOX6JQDHFHHRLGAIVAEYF5VOTA';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches a quote correctly', async () => {
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
        evmAddress: mockEvmAddress,
        stellarAddress: mockStellarAddress,
        amount: '2',
        fast: false,
      },
      expect.any(AbortSignal)
    );
    expect(result.current.quote).toEqual(mockQuote);
  });

  it('calls sendEVMTransaction and submits broadcast txHash to backend', async () => {
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
      status: 'APPROVAL_SIGNATURE_REQUIRED',
      signingRequest: {
        type: 'EVM',
        purpose: 'APPROVAL',
        rawTx,
      },
    };

    const mockTxHash = '0xd6a7ffd2b8b07e26795b0cf6804d937df565275e767efae9e204fe2c95629824';

    const mockCompletedTransfer: cctpService.CctpBridgeTransfer = {
      id: 'f15bc324-5df6-4ba9-befe-27a120eed6b1',
      status: 'APPROVAL_PENDING',
      signingRequest: null,
    };

    const mockEvmProvider = {
      request: vi.fn().mockImplementation(async ({ method }) => {
        if (method === 'eth_chainId') return '0xaa36a7';
        return null;
      }),
    };

    (sendEVMTransaction as any).mockResolvedValue(mockTxHash);
    (cctpService.createCctpBridge as any).mockResolvedValue(mockTransferResponse);
    (cctpService.submitCctpEvmSignature as any).mockResolvedValue(mockCompletedTransfer);

    const { result } = renderHook(() =>
      useEvmToStellarCctp({
        evmAddress: mockEvmAddress,
        stellarAddress: mockStellarAddress,
        evmProvider: mockEvmProvider,
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
      expect(sendEVMTransaction).toHaveBeenCalledWith(
        mockEvmProvider,
        11155111,
        expect.objectContaining({
          from: mockEvmAddress,
          to: rawTx.to,
          data: rawTx.data,
          value: '0x0',
          nonce: rawTx.nonce,
          gas: rawTx.gasLimit,
          gasPrice: rawTx.gasPrice,
        })
      );
    });

    await waitFor(() => {
      expect(result.current.transfer?.status).toBe('APPROVAL_PENDING');
      expect(result.current.transfer?.approvalTxHash).toBe(mockTxHash);
    });

    expect(cctpService.submitCctpEvmSignature).not.toHaveBeenCalled();
  });
});
