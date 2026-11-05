import * as StellarSDK from '@stellar/stellar-sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  SOROSWAP_TESTNET_SUPPORTED_TOKENS,
  STELLAR_TESTNET_CONTRACT_MAP,
  SoroswapService,
  isSoroswapTestnetSupported,
} from '../soroswapService';

describe('SoroswapService', () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    localStorage.clear();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('Testnet Contract Resolution (getContractId)', () => {
    const testnetService = new SoroswapService(
      'https://horizon-testnet.stellar.org',
      StellarSDK.Networks.TESTNET
    );

    it('exports STELLAR_TESTNET_CONTRACT_MAP with expected token contracts', () => {
      expect(STELLAR_TESTNET_CONTRACT_MAP.XLM).toBe(
        'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC'
      );
      expect(STELLAR_TESTNET_CONTRACT_MAP.USDC).toBe(
        'CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75'
      );
      expect(STELLAR_TESTNET_CONTRACT_MAP.XTAR).toBe(SOROSWAP_TESTNET_SUPPORTED_TOKENS.XTAR);
    });

    it('resolves XLM / native to testnet contract address', () => {
      expect(testnetService.getContractId('XLM')).toBe(
        'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC'
      );
      expect(testnetService.getContractId('native')).toBe(
        'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC'
      );
      expect(testnetService.getContractId(StellarSDK.Asset.native())).toBe(
        'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC'
      );
    });

    it('resolves USDC (GBBD47IF...) to its deployed Soroban contract CCW67TSZV3...', () => {
      const assetString = 'USDC-GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
      const contractId = testnetService.getContractId(assetString);
      expect(contractId).toBe('CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75');
      expect(StellarSDK.StrKey.isValidContract(contractId)).toBe(true);
    });

    it('resolves UXIV, CYON, JAMN, VEOF, and XTAR to their respective testnet contracts', () => {
      expect(
        testnetService.getContractId(
          'UXIV-GCPJFNZAARY3Z2AM7RVXDZDLPOEBT4QHTQXFOFKMZHLV7PPDKE2M67Q6'
        )
      ).toBe('CADHV5C672FOGEUMCGYO2D6VQME3Y3NAP2FZRYJGA3VMDNOL5NAWQI7R');

      expect(
        testnetService.getContractId(
          'CYON-GCPJFNZAARY3Z2AM7RVXDZDLPOEBT4QHTQXFOFKMZHLV7PPDKE2M67Q6'
        )
      ).toBe('CBSWSTWY2OR7322PIIRU6Q6CY3VMMBBL6GX7TO5JV2M6OS2CG5ZHN7FX');

      expect(
        testnetService.getContractId(
          'JAMN-GCPJFNZAARY3Z2AM7RVXDZDLPOEBT4QHTQXFOFKMZHLV7PPDKE2M67Q6'
        )
      ).toBe('CBGFKYQJYMZC7HNW7RGQQOUR2LP5HAAQ3MPHDENMBNKBKOEDIWXJADAT');

      expect(
        testnetService.getContractId(
          'VEOF-GCPJFNZAARY3Z2AM7RVXDZDLPOEBT4QHTQXFOFKMZHLV7PPDKE2M67Q6'
        )
      ).toBe('CBV3JJ7CJK2J2YEJRM2HPFXT4GKBO574XEEVX6YL725R6CRARXITLDCH');

      expect(
        testnetService.getContractId(
          'XTAR-CCZGLAUBDKJSQK72QOZHVU7CUWKW45OZWYWCLL27AEK74U2OIBK6LXF2'
        )
      ).toBe('CCZGLAUBDKJSQK72QOZHVU7CUWKW45OZWYWCLL27AEK74U2OIBK6LXF2');
    });

    it('returns existing 56-char C... contract address unchanged', () => {
      const contract = 'CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75';
      expect(testnetService.getContractId(contract)).toBe(contract);
    });

    it('extracts contract from token objects directly', () => {
      const tokenObj = {
        symbol: 'USDC',
        asset: 'USDC-GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
        contract: 'CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75',
      };
      expect(testnetService.getContractId(tokenObj)).toBe(
        'CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75'
      );
    });
  });

  describe('Payload Verification on Testnet (/quote and /prepare-swap)', () => {
    it('sends contract addresses instead of issuer addresses in /quote payload on testnet', async () => {
      const testnetService = new SoroswapService(
        'https://horizon-testnet.stellar.org',
        StellarSDK.Networks.TESTNET
      );

      let capturedBody: any = null;
      global.fetch = vi.fn().mockImplementation(async (url: string, init: any) => {
        if (url.includes('/quote')) {
          capturedBody = JSON.parse(init.body);
          return {
            ok: true,
            json: async () => ({
              amountIn: '10000000',
              amountOut: '25000000',
              returnAmount: '25000000',
              routePlan: [{ swapInfo: { protocol: 'soroswap' } }],
            }),
          };
        }
        return { ok: true, json: async () => ({}) };
      });

      await testnetService.getQuote(
        'USDC-GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
        'XLM',
        '1.0'
      );

      expect(capturedBody).not.toBeNull();
      // Must NOT contain raw asset string or G... issuer address
      expect(capturedBody.assetIn).not.toContain('GBBD47IF');
      // Must be Soroban contract address starting with C
      expect(capturedBody.assetIn).toBe('CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75');
      expect(capturedBody.assetOut).toBe(
        'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC'
      );
    });

    it('sends contract addresses instead of issuer addresses in /prepare-swap payload on testnet', async () => {
      const testnetService = new SoroswapService(
        'https://horizon-testnet.stellar.org',
        StellarSDK.Networks.TESTNET
      );

      // Create a dummy valid transaction XDR for testnet
      const pubkey = 'GC2BKLYOOYPDEFJKLKY6FNNRQMGFLVHJKQRGNSSRRGSMPGF32LHCQVGF';
      const account = new StellarSDK.Account(pubkey, '100');
      const dummyTx = new StellarSDK.TransactionBuilder(account, {
        fee: '100',
        networkPassphrase: StellarSDK.Networks.TESTNET,
      })
        .setTimeout(30)
        .build();
      const dummyXdr = dummyTx.toXDR();

      let capturedBody: any = null;
      global.fetch = vi.fn().mockImplementation(async (url: string, init: any) => {
        if (url.includes('/prepare-swap')) {
          capturedBody = JSON.parse(init.body);
          return {
            ok: true,
            json: async () => ({
              xdr: dummyXdr,
              network: 'testnet',
              networkPassphrase: StellarSDK.Networks.TESTNET,
            }),
          };
        }
        return { ok: true, json: async () => ({}) };
      });

      await testnetService.prepareSwap({
        assetIn: 'USDC-GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
        assetOut: 'UXIV-GCPJFNZAARY3Z2AM7RVXDZDLPOEBT4QHTQXFOFKMZHLV7PPDKE2M67Q6',
        amount: '10.0',
        from: pubkey,
      });

      expect(capturedBody).not.toBeNull();
      // Must NOT contain issuer G...
      expect(capturedBody.assetIn).toBe('CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75');
      expect(capturedBody.assetOut).toBe(
        'CADHV5C672FOGEUMCGYO2D6VQME3Y3NAP2FZRYJGA3VMDNOL5NAWQI7R'
      );
    });

    it('correctly parses Soroswap quote response with estimatedAmountOutFormatted and minimumAmountOutFormatted', async () => {
      const testnetService = new SoroswapService(
        'https://horizon-testnet.stellar.org',
        StellarSDK.Networks.TESTNET
      );

      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('/quote')) {
          return {
            ok: true,
            json: async () => ({
              network: 'TESTNET',
              protocol: 'SOROSWAP',
              quoteType: 'INDICATIVE',
              pool: 'CDSQONFE5BS732OYYJINI2L7W4567XRBLJWDD7GPVQZLXLPC4CGA55ZO',
              router: 'CCJUD55AG6W5HAI5LRVNKAE5WDP5XGZBUDS5WNTIVDU7O264UZZE7BRD',
              assetIn: 'CCZGLAUBDKJSQK72QOZHVU7CUWKW45OZWYWCLL27AEK74U2OIBK6LXF2',
              assetOut: 'CB3TLW74NBIOT3BUWOZ3TUM6RFDF6A4GVIRUQRQZABG5KPOUL4JJOV2F',
              amountIn: '10000000',
              estimatedAmountOut: '5935400',
              minimumAmountOut: '5876046',
              amountInFormatted: '1',
              estimatedAmountOutFormatted: '0.59354',
              minimumAmountOutFormatted: '0.5876046',
              decimalsIn: 7,
              decimalsOut: 7,
              assumedFeeBps: 30,
              slippageBps: 100,
            }),
          };
        }
        return { ok: true, json: async () => ({}) };
      });

      const quote = await testnetService.getQuote(
        'CCZGLAUBDKJSQK72QOZHVU7CUWKW45OZWYWCLL27AEK74U2OIBK6LXF2',
        'CB3TLW74NBIOT3BUWOZ3TUM6RFDF6A4GVIRUQRQZABG5KPOUL4JJOV2F',
        '1'
      );

      expect(quote).toBeDefined();
      expect(quote.estimatedOutput).toBe('0.5935400');
      expect(quote.minimumOutput).toBe('0.5876046');
      expect(quote.source).toBe('SOROSWAP');
    });

    it('derives SAC contract IDs and sends /quote payload on mainnet', async () => {
      const mainnetService = new SoroswapService(
        'https://horizon.stellar.org',
        StellarSDK.Networks.PUBLIC
      );

      const usdcAsset = {
        symbol: 'USDC',
        address: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
        issuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
      };
      const aquaAsset = {
        symbol: 'AQUA',
        address: 'GBNZILSTVQZ4R7IKQDGHYGY2QXL5QOFJYQMXPKWRRM5PAV7Y4M67AQUA',
        issuer: 'GBNZILSTVQZ4R7IKQDGHYGY2QXL5QOFJYQMXPKWRRM5PAV7Y4M67AQUA',
      };

      const usdcContract = mainnetService.getContractId(usdcAsset);
      const aquaContract = mainnetService.getContractId(aquaAsset);

      expect(usdcContract).toBe('CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75');
      expect(StellarSDK.StrKey.isValidContract(aquaContract)).toBe(true);

      let capturedBody: any = null;
      global.fetch = vi.fn().mockImplementation(async (url: string, init: any) => {
        if (url.includes('/quote')) {
          capturedBody = JSON.parse(init.body);
          return {
            ok: true,
            json: async () => ({
              amountOut: '2720000000',
              estimatedAmountOutFormatted: '272.0',
              minimumAmountOutFormatted: '269.0',
              source: 'SOROSWAP',
            }),
          };
        }
        return { ok: true, json: async () => ({}) };
      });

      const quote = await mainnetService.getQuote(usdcAsset, aquaAsset, '0.1');
      expect(capturedBody).not.toBeNull();
      expect(capturedBody.assetIn).toBe('CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75');
      expect(capturedBody.assetOut).toBe(aquaContract);
      expect(quote).toBeDefined();
    });
  });

  describe('Testnet Supported Tokens Filtering', () => {
    it('defines verified XLM, USDC and XTAR tokens', () => {
      expect(SOROSWAP_TESTNET_SUPPORTED_TOKENS.XLM).toBe(
        'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC'
      );
      expect(SOROSWAP_TESTNET_SUPPORTED_TOKENS.USDC).toBe(
        'CB3TLW74NBIOT3BUWOZ3TUM6RFDF6A4GVIRUQRQZABG5KPOUL4JJOV2F'
      );
      expect(SOROSWAP_TESTNET_SUPPORTED_TOKENS.XTAR).toBe(
        'CCZGLAUBDKJSQK72QOZHVU7CUWKW45OZWYWCLL27AEK74U2OIBK6LXF2'
      );
    });

    it('correctly filters supported testnet tokens by contract', () => {
      expect(
        isSoroswapTestnetSupported({
          symbol: 'USDC',
          contract: 'CB3TLW74NBIOT3BUWOZ3TUM6RFDF6A4GVIRUQRQZABG5KPOUL4JJOV2F',
        })
      ).toBe(true);

      expect(
        isSoroswapTestnetSupported({
          symbol: 'XTAR',
          contract: 'CCZGLAUBDKJSQK72QOZHVU7CUWKW45OZWYWCLL27AEK74U2OIBK6LXF2',
        })
      ).toBe(true);

      expect(
        isSoroswapTestnetSupported({
          symbol: 'USDC',
          contract: 'CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75',
          issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
        })
      ).toBe(false);

      expect(
        isSoroswapTestnetSupported({
          symbol: 'XLM',
          address: 'native',
        })
      ).toBe(true);

      expect(
        isSoroswapTestnetSupported({
          symbol: 'XLM',
          isNative: true,
        })
      ).toBe(true);

      expect(
        isSoroswapTestnetSupported({
          symbol: 'STAK',
          issuer: 'GCVM2EPORQIRS24VBTXINTSLX2G55BBKIHOBCBG763OJBLJKIHJ7FCG2',
        })
      ).toBe(false);
    });
  });
});
