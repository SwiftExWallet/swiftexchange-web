import * as StellarSDK from '@stellar/stellar-sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AquariusService } from '../aquariusService';

describe('AquariusService', () => {
  const service = new AquariusService(
    'https://horizon-testnet.stellar.org',
    StellarSDK.Networks.TESTNET
  );

  const testUserAddress = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
  const mockIssuer = 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN';

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Contract ID derivation', () => {
    it('resolves native XLM to deterministic contract ID', () => {
      const contractId = service.getContractId('XLM');
      expect(StellarSDK.StrKey.isValidContract(contractId)).toBe(true);
      expect(contractId).toBe(StellarSDK.Asset.native().contractId(StellarSDK.Networks.TESTNET));
    });

    it('returns direct contract address if already formatted as C...', () => {
      const directContract = 'CBCFTQSPDBAIZ6R6PJQKSQWKNKWH2QIV3I4J72SHWBIK3ADRRAM5A6GD';
      expect(service.getContractId(directContract)).toBe(directContract);
    });

    it('derives contract ID from classic code and issuer', () => {
      const derived = service.getContractId(`TEST:${mockIssuer}`);
      const expected = new StellarSDK.Asset('TEST', mockIssuer).contractId(
        StellarSDK.Networks.TESTNET
      );
      expect(derived).toBe(expected);
    });
  });

  describe('Trustline Validation in buildSwapTransaction', () => {
    it('throws descriptive trustline error when user lacks trustline for destination asset', async () => {
      const mockAccount = {
        balances: [
          { asset_type: 'native', balance: '100.0000000' },
          // user only has XLM, no trustline for AQUA
        ],
        sequenceNumber: () => '1000',
      };

      vi.spyOn(StellarSDK.Horizon.Server.prototype, 'loadAccount').mockResolvedValue(
        mockAccount as any
      );

      const mockQuote: any = {
        fromAsset: StellarSDK.Asset.native(),
        toAsset: new StellarSDK.Asset('AQUA', mockIssuer),
        inputAmount: '10',
        minimumOutput: '50',
        swapChainXdr: 'AAAAAgAAAAEAAAAB',
      };

      await expect(service.buildSwapTransaction(testUserAddress, mockQuote)).rejects.toThrow(
        /Trustline required for AQUA/i
      );
    });

    it('does not throw trustline error when destination asset is native XLM', async () => {
      const mockAccount = {
        balances: [{ asset_type: 'native', balance: '100.0000000' }],
        sequenceNumber: () => '1000',
      };

      vi.spyOn(StellarSDK.Horizon.Server.prototype, 'loadAccount').mockResolvedValue(
        mockAccount as any
      );

      // Simulation will fail later because RPC isn't mocked, but it must pass the trustline check
      const mockQuote: any = {
        fromAsset: new StellarSDK.Asset('USDC', mockIssuer),
        toAsset: StellarSDK.Asset.native(),
        inputAmount: '10',
        minimumOutput: '50',
        swapChainXdr: 'AAAAAgAAAAEAAAAB',
      };

      try {
        await service.buildSwapTransaction(testUserAddress, mockQuote);
      } catch (err: any) {
        // It must NOT fail with trustline error
        expect(err.message).not.toContain('Trustline required');
      }
    });

    it('does not throw trustline error when user already has the required trustline', async () => {
      const mockAccount = {
        balances: [
          { asset_type: 'native', balance: '100.0000000' },
          {
            asset_type: 'credit_alphanum4',
            asset_code: 'AQUA',
            asset_issuer: mockIssuer,
            balance: '0.0000000',
          },
        ],
        sequenceNumber: () => '1000',
      };

      vi.spyOn(StellarSDK.Horizon.Server.prototype, 'loadAccount').mockResolvedValue(
        mockAccount as any
      );

      const mockQuote: any = {
        fromAsset: StellarSDK.Asset.native(),
        toAsset: new StellarSDK.Asset('AQUA', mockIssuer),
        inputAmount: '10',
        minimumOutput: '50',
        swapChainXdr: 'AAAAAgAAAAEAAAAB',
      };

      try {
        await service.buildSwapTransaction(testUserAddress, mockQuote);
      } catch (err: any) {
        // Since user has AQUA trustline, it must pass trustline check and proceed to simulation
        expect(err.message).not.toContain('Trustline required');
      }
    });
  });
});
