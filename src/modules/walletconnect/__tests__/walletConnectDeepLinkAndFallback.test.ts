import { describe, expect, it } from 'vitest';

import {
  buildNativeDeepLink,
  buildUniversalDeepLink,
  formatWalletDeepLink,
  getWalletRedirectUrls,
} from '../../../utils/walletConnectUtils';
import { EVM_WALLETS, STELLAR_WALLETS, WALLET_METADATA_MAP } from '../constants/Wallet';

describe('WalletConnect Deep Linking & Registry Verification', () => {
  const SAMPLE_WC_URI =
    'wc:473d30d1-a39b-4335-b254-2fcf07cce8dc@2?relay-protocol=irn&symKey=0123456789abcdef';

  it('correctly maps all EVM and Stellar wallets from the registries', () => {
    const evmIds = EVM_WALLETS.map(w => w.id);
    expect(evmIds).toContain('swiftex');
    expect(evmIds).toContain('metamask');
    expect(evmIds).toContain('trust');
    expect(evmIds).toContain('phantom');

    const stellarIds = STELLAR_WALLETS.map(w => w.id);
    expect(stellarIds).toContain('swiftex');
    expect(stellarIds).toContain('freighter');
    expect(stellarIds).toContain('lobstr');
    expect(stellarIds).toContain('hotwallet');
  });

  describe('Native Deep Link Scheme Formatting', () => {
    it('formats MetaMask native deep link without intermediate web bounce', () => {
      const link = formatWalletDeepLink('metamask', SAMPLE_WC_URI, true);
      expect(link.startsWith('metamask://wc?uri=')).toBe(true);
      expect(link).toContain(encodeURIComponent(SAMPLE_WC_URI));
    });

    it('formats Trust Wallet native deep link with trust:// scheme', () => {
      const link = formatWalletDeepLink('trust', SAMPLE_WC_URI, true);
      expect(link.startsWith('trust://wc?uri=')).toBe(true);
      expect(link).toContain(encodeURIComponent(SAMPLE_WC_URI));
    });

    it('formats Phantom native deep link', () => {
      const link = formatWalletDeepLink('phantom', SAMPLE_WC_URI, true);
      expect(link.startsWith('phantom://wc?uri=')).toBe(true);
      expect(link).toContain(encodeURIComponent(SAMPLE_WC_URI));
    });

    it('formats SwiftEx native deep link with host path', () => {
      const link = formatWalletDeepLink('swiftex', SAMPLE_WC_URI, true);
      expect(link.startsWith('swiftEx://app.swiftexchange.io/wc?uri=')).toBe(true);
      expect(link).toContain(encodeURIComponent(SAMPLE_WC_URI));
    });

    it('formats HOT Wallet native deep link', () => {
      const link = formatWalletDeepLink('hotwallet', SAMPLE_WC_URI, true);
      expect(link.startsWith('hotwallet://wc?uri=')).toBe(true);
      expect(link).toContain(encodeURIComponent(SAMPLE_WC_URI));
    });

    it('formats LOBSTR native deep link', () => {
      const link = formatWalletDeepLink('lobstr', SAMPLE_WC_URI, true);
      expect(link.startsWith('lobstr://wc?uri=')).toBe(true);
      expect(link).toContain(encodeURIComponent(SAMPLE_WC_URI));
    });

    it('formats Freighter with exact registry scheme freighterwallet://wc-redirect', () => {
      const link = formatWalletDeepLink('freighter', SAMPLE_WC_URI, true);
      expect(link.startsWith('freighterwallet://wc-redirect?uri=')).toBe(true);
      expect(link).not.toContain('freighterwallet://wc-redirect/wc');
    });

    it('builds direct native deep links accurately with buildNativeDeepLink', () => {
      expect(buildNativeDeepLink('metamask', SAMPLE_WC_URI)).toBe(
        `metamask://wc?uri=${encodeURIComponent(SAMPLE_WC_URI)}`
      );
      expect(buildNativeDeepLink('freighterwallet://wc-redirect', SAMPLE_WC_URI)).toBe(
        `freighterwallet://wc-redirect?uri=${encodeURIComponent(SAMPLE_WC_URI)}`
      );
    });
  });

  describe('Universal Deep Link Fallback Formatting', () => {
    it('formats MetaMask universal link properly', () => {
      const universal = WALLET_METADATA_MAP['metamask']?.redirects?.universal;
      expect(universal).toBe('https://metamask.app.link');
      const formatted = buildUniversalDeepLink(universal!, SAMPLE_WC_URI);
      expect(formatted.startsWith('https://metamask.app.link/wc?uri=')).toBe(true);
    });

    it('formats LOBSTR universal link with /uni/wc path', () => {
      const universal = WALLET_METADATA_MAP['lobstr']?.redirects?.universal;
      expect(universal).toBe('https://lobstr.co/uni/wc');
      const formatted = buildUniversalDeepLink(universal!, SAMPLE_WC_URI);
      expect(formatted.startsWith('https://lobstr.co/uni/wc?uri=')).toBe(true);
    });

    it('formats Trust Wallet universal link without duplicate /wc paths', () => {
      const universal = WALLET_METADATA_MAP['trust']?.redirects?.universal;
      expect(universal).toBe('https://link.trustwallet.com');
      const formatted = buildUniversalDeepLink(universal!, SAMPLE_WC_URI);
      expect(formatted.startsWith('https://link.trustwallet.com/wc?uri=')).toBe(true);
    });

    it('retrieves both native and universal links from getWalletRedirectUrls', () => {
      const { native, universal, formattedUrl } = getWalletRedirectUrls('metamask', SAMPLE_WC_URI);
      expect(native).toContain('metamask://wc?uri=');
      expect(universal).toContain('https://metamask.app.link/wc?uri=');
      // On mobile / default, formattedUrl should prefer native
      expect(formattedUrl).toBe(native);
    });
  });
});
