import {
  Check,
  Coins,
  Copy,
  Droplets,
  ExternalLink,
  Loader2,
  Sparkles,
  Wallet,
  X,
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import * as StellarSDK from '@stellar/stellar-sdk';

import { useNotificationStore } from '../../../store/notificationStore';
import { StellarSequenceTracker } from '../../stellar/utils/StellarSequenceTracker';
import {
  buildTrustlineTransaction,
  signAndSubmitTrustline,
} from '../../stellar/utils/assetUtils/assetUtils';
import { getStellarConfig } from '../../walletconnect/config/chains';
import { WalletType } from '../../walletconnect/constants/Wallet';
import { useWalletConnect } from '../../walletconnect/hooks/useWalletConnect';
import { usePortfolioStore } from '../../walletconnect/store/portfolioStore';

interface FundWalletModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface TestnetAsset {
  code: string;
  name: string;
  issuer: string;
  faucetUrl?: string;
  logo: string;
}

const STELLAR_TESTNET_ASSETS: TestnetAsset[] = [
  {
    code: 'USDC',
    name: 'USD Coin (Testnet AMM)',
    issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
    faucetUrl: 'https://faucet.circle.com',
    logo: 'https://coin-images.coingecko.com/coins/images/6319/large/usdc.png',
  },
  {
    code: 'AQUA',
    name: 'Aquarius (Testnet AMM)',
    issuer: 'GAO2UQT2N7NGSHLNNS5AUGEEEOU3BXER6GGIYFJBF5OUNCLVONUYT3PS',
    logo: 'https://coin-images.coingecko.com/coins/images/19830/large/AQUA.png',
  },
  {
    code: 'SWIFT',
    name: 'SwiftEx Token (Testnet AMM)',
    issuer: 'GBVAJRR3O24B3TULTXH5HP4HGADXMORIEEOEWZAKUQFUZETT64NRF5LI',
    logo: 'https://coin-images.coingecko.com/coins/images/100/large/Stellar_symbol_black_RGB.png',
  },
  {
    code: 'WBTC',
    name: 'Wrapped Bitcoin (Testnet AMM)',
    issuer: 'GAXAMPQXMVMRZPZNZEHIAVXO5PXL5VYXOWRRB3SCERPPDLZKUKHV6ZRZ',
    logo: 'https://coin-images.coingecko.com/coins/images/1/large/bitcoin.png',
  },
  {
    code: 'WETH',
    name: 'Wrapped Ethereum (Testnet AMM)',
    issuer: 'GBWDY7L6YMM4TAX4RSPX4NMDSFMIX7PQLYKYCTXZH76EIVMPSRJ2CKM4',
    logo: 'https://coin-images.coingecko.com/coins/images/279/large/ethereum.png',
  },
  {
    code: 'EURC',
    name: 'Euro Coin (Testnet AMM)',
    issuer: 'GACD5TONLCRLWT2EOSQLSK5D6CFJMQSWO6PIP5VF6B73UVCKRSYIMXTY',
    logo: 'https://coin-images.coingecko.com/coins/images/26045/large/EURC.png',
  },
  {
    code: 'ACME',
    name: 'Acme Asset (Testnet AMM)',
    issuer: 'GB75GYGNXJ566NKBMDUBMKGZQWWNLYAT3FWSMCPX3O3427JGQ3D3CC33',
    logo: 'https://coin-images.coingecko.com/coins/images/325/large/Tether.png',
  },
];

const EVM_TESTNET_FAUCETS = [
  {
    name: 'Sepolia ETH Faucet (Google Web3)',
    url: 'https://cloud.google.com/application/web3/faucet/ethereum/sepolia',
    chain: 'Ethereum Sepolia',
  },
  {
    name: 'Polygon Amoy Faucet',
    url: 'https://faucet.polygon.technology',
    chain: 'Polygon Amoy',
  },
  {
    name: 'Arbitrum Sepolia Faucet',
    url: 'https://faucets.chain.link/arbitrum-sepolia',
    chain: 'Arbitrum Sepolia',
  },
  {
    name: 'Circle Multi-Chain USDC Faucet',
    url: 'https://faucet.circle.com',
    chain: 'Multi-Chain (EVM & Stellar)',
  },
];

export const FundWalletModal: React.FC<FundWalletModalProps> = ({ isOpen, onClose }) => {
  const { connectedWallets, openModal, getProvider } = useWalletConnect();
  const showToast = useNotificationStore(state => state.showToast);

  const stellarWallet = connectedWallets[WalletType.STELLAR];
  const evmWallet = connectedWallets[WalletType.EVM];

  const hasStellar = Boolean(stellarWallet);
  const hasEvm = Boolean(evmWallet);

  const availableTabs = useMemo(() => {
    if (hasStellar && !hasEvm) {
      return [
        { id: 'stellar', label: 'Stellar XLM Faucet', icon: Droplets },
        { id: 'assets', label: 'Testnet Tokens', icon: Coins },
      ];
    }
    if (hasEvm && !hasStellar) {
      return [{ id: 'evm', label: 'EVM Faucets', icon: ExternalLink }];
    }
    return [
      { id: 'stellar', label: 'Stellar XLM Faucet', icon: Droplets },
      { id: 'assets', label: 'Testnet Tokens', icon: Coins },
      { id: 'evm', label: 'EVM Faucets', icon: ExternalLink },
    ];
  }, [hasStellar, hasEvm]);

  const [activeTab, setActiveTab] = useState<'stellar' | 'assets' | 'evm'>('stellar');

  useEffect(() => {
    if (!availableTabs.some(t => t.id === activeTab)) {
      setActiveTab(availableTabs[0].id as any);
    }
  }, [availableTabs, activeTab]);

  const [customStellarAddress, setCustomStellarAddress] = useState('');
  const [isFundingStellar, setIsFundingStellar] = useState(false);
  const [addingTrustlineCode, setAddingTrustlineCode] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [existingTrustlines, setExistingTrustlines] = useState<Set<string>>(new Set());
  const [trustlineBalances, setTrustlineBalances] = useState<Record<string, string>>({});

  const targetStellarAddress = customStellarAddress.trim() || stellarWallet?.address || '';

  const fetchExistingTrustlines = useCallback(async () => {
    if (!stellarWallet?.address) {
      setExistingTrustlines(new Set());
      setTrustlineBalances({});
      return;
    }

    try {
      const config = getStellarConfig('testnet');
      const server = new StellarSDK.Horizon.Server(config.horizonUrl);
      const account = await server.loadAccount(stellarWallet.address);

      const trustlineSet = new Set<string>();
      const balancesMap: Record<string, string> = {};

      account.balances.forEach((b: any) => {
        if (b.asset_type !== 'native' && b.asset_code && b.asset_issuer) {
          const key = `${b.asset_code}:${b.asset_issuer}`;
          trustlineSet.add(key);
          trustlineSet.add(b.asset_code);
          balancesMap[key] = b.balance;
          balancesMap[b.asset_code] = b.balance;
        }
      });

      setExistingTrustlines(trustlineSet);
      setTrustlineBalances(balancesMap);
    } catch {
      // Account not found or unactivated on testnet
    }
  }, [stellarWallet?.address]);

  useEffect(() => {
    if (isOpen && activeTab === 'assets' && stellarWallet?.address) {
      fetchExistingTrustlines();
    }
  }, [isOpen, activeTab, stellarWallet?.address, fetchExistingTrustlines]);

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleFundStellar = useCallback(async () => {
    if (!targetStellarAddress) {
      showToast({
        type: 'STELLAR',
        title: 'Address Required',
        message: 'Please connect a Stellar wallet or enter a valid G... public address',
        dontSave: true,
      });
      return;
    }

    setIsFundingStellar(true);
    try {
      const response = await fetch(
        `https://friendbot.stellar.org?addr=${encodeURIComponent(targetStellarAddress)}`
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.detail || errorData.title || `Friendbot response status ${response.status}`
        );
      }

      showToast({
        type: 'STELLAR',
        title: 'Wallet Funded!',
        message: 'Successfully credited 10,000 Testnet XLM to your account via Friendbot.',
        dontSave: false,
      });
      await fetchExistingTrustlines();
      usePortfolioStore.getState().fetchAssets(connectedWallets, 'testnet');
    } catch (err: any) {
      showToast({
        type: 'STELLAR',
        title: 'Funding Failed',
        message: err.message || 'Failed to request testnet XLM from Friendbot',
        dontSave: true,
      });
    } finally {
      setIsFundingStellar(false);
    }
  }, [targetStellarAddress, showToast, fetchExistingTrustlines, connectedWallets]);

  const handleAddTrustline = useCallback(
    async (asset: TestnetAsset) => {
      const provider = getProvider(WalletType.STELLAR);
      if (!stellarWallet?.address || !provider) {
        openModal();
        return;
      }

      setAddingTrustlineCode(asset.code);
      try {
        const config = getStellarConfig('testnet');
        const server = new StellarSDK.Horizon.Server(config.horizonUrl);

        StellarSequenceTracker.reset(stellarWallet.address);

        const xdr = await buildTrustlineTransaction({
          server,
          stellarAddress: stellarWallet.address,
          assetCode: asset.code,
          assetIssuer: asset.issuer,
          currentNetwork: 'testnet',
        });

        const result = await signAndSubmitTrustline(
          xdr,
          'testnet',
          StellarSDK.Networks.TESTNET,
          provider
        );

        if (!result.success) {
          throw new Error(result.error || 'Failed to sign trustline transaction');
        }

        showToast({
          type: 'STELLAR',
          title: 'Trustline Added',
          message: `Successfully enabled trustline for ${asset.code} on Testnet.`,
          dontSave: false,
        });
        await fetchExistingTrustlines();
        usePortfolioStore.getState().fetchAssets(connectedWallets, 'testnet');
      } catch (err: any) {
        StellarSequenceTracker.reset(stellarWallet.address);
        showToast({
          type: 'STELLAR',
          title: 'Trustline Failed',
          message: err.message || 'User rejected or failed to add trustline',
          dontSave: true,
        });
      } finally {
        setAddingTrustlineCode(null);
      }
    },
    [stellarWallet, getProvider, openModal, showToast, fetchExistingTrustlines, connectedWallets]
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn select-none">
      <div
        className="relative w-full max-w-lg overflow-hidden bg-bg-secondary border border-border-color rounded-2xl shadow-2xl flex flex-col max-h-[90vh] text-text-primary"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-divider">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-text-primary">Testnet Faucet & Liquidity</h2>
              <p className="text-xs text-text-muted">
                Fund your testnet account and set up testnet tokens
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-tertiary transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {availableTabs.length > 1 && (
          <div className="p-3 border-b border-divider bg-bg-primary/50 shrink-0">
            <div className="flex bg-bg-tertiary p-1 rounded-xl gap-1">
              {availableTabs.map(tab => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                      isActive
                        ? 'bg-brand text-white shadow-sm'
                        : 'text-text-muted hover:text-text-primary hover:bg-bg-hover'
                    }`}
                  >
                    <Icon size={14} />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="p-6 overflow-y-auto space-y-6 flex-1 custom-scrollbar">
          {activeTab === 'stellar' && (
            <div className="space-y-5">
              <div className="p-4 rounded-xl bg-bg-tertiary/50 border border-border-color flex items-start gap-3.5">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
                  <Droplets className="w-4 h-4" />
                </div>
                <div className="text-xs space-y-1">
                  <span className="font-bold text-text-primary">Instant 10,000 XLM</span>
                  <p className="text-text-secondary text-[11px] leading-relaxed">
                    Uses official Stellar Testnet Friendbot to instantly fund or activate your
                    testnet account with 10,000 test XLM.
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-[10px] font-bold text-text-muted uppercase tracking-wider">
                  Target Stellar Address
                </label>
                <div className="relative bg-bg-primary rounded-xl border border-border-color focus-within:border-brand transition-colors p-3.5 flex items-center gap-2.5">
                  <Wallet size={16} className="text-text-muted shrink-0" />
                  <input
                    type="text"
                    value={customStellarAddress || stellarWallet?.address || ''}
                    onChange={e => setCustomStellarAddress(e.target.value)}
                    placeholder="Enter Stellar address (G...)"
                    className="flex-1 bg-transparent border-none outline-none text-xs font-mono text-text-primary placeholder:text-text-muted"
                  />
                  {stellarWallet?.address && !customStellarAddress && (
                    <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded">
                      Connected
                    </span>
                  )}
                </div>
              </div>

              <button
                onClick={handleFundStellar}
                disabled={isFundingStellar || !targetStellarAddress}
                className="w-full py-3.5 px-4 rounded-xl bg-brand hover:bg-brand-hover text-white font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer active:scale-[0.99]"
              >
                {isFundingStellar ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Funding Account with 10,000 XLM...</span>
                  </>
                ) : (
                  <>
                    <Droplets size={16} />
                    <span>Claim 10,000 Testnet XLM</span>
                  </>
                )}
              </button>

              {!stellarWallet && (
                <div className="text-center pt-1">
                  <button
                    onClick={openModal}
                    className="text-xs font-bold text-brand hover:underline cursor-pointer"
                  >
                    Connect Stellar Wallet
                  </button>
                </div>
              )}
            </div>
          )}

          {activeTab === 'assets' && (
            <div className="space-y-4">
              <div className="text-xs text-text-muted leading-relaxed">
                Add trustlines and acquire testnet tokens for liquidity, swap, and cross-chain
                testing:
              </div>

              <div className="space-y-3">
                {STELLAR_TESTNET_ASSETS.map(asset => {
                  const hasTrustline =
                    existingTrustlines.has(`${asset.code}:${asset.issuer}`) ||
                    existingTrustlines.has(asset.code);
                  const balance =
                    trustlineBalances[`${asset.code}:${asset.issuer}`] ||
                    trustlineBalances[asset.code];

                  return (
                    <div
                      key={asset.code}
                      className="p-4 rounded-xl bg-bg-tertiary/40 border border-border-color hover:border-brand/40 transition-all space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <img
                            src={asset.logo}
                            alt={asset.code}
                            className="w-9 h-9 rounded-xl bg-bg-secondary p-1 border border-border-color object-contain"
                          />
                          <div>
                            <div className="text-xs font-bold text-text-primary">{asset.code}</div>
                            <div className="text-[10px] text-text-muted">{asset.name}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {stellarWallet &&
                            (hasTrustline ? (
                              <div className="px-2.5 py-1.5 rounded-lg bg-success/10 border border-success/20 text-success text-[11px] font-bold inline-flex items-center gap-1.5 select-none">
                                <Check size={13} className="text-success stroke-[2.5]" />
                                <span>
                                  Active{' '}
                                  {balance && parseFloat(balance) > 0
                                    ? `(${parseFloat(balance).toLocaleString()})`
                                    : ''}
                                </span>
                              </div>
                            ) : (
                              <button
                                onClick={() => handleAddTrustline(asset)}
                                disabled={addingTrustlineCode === asset.code}
                                className="px-3 py-1.5 rounded-lg bg-brand hover:bg-brand-hover text-white text-[11px] font-semibold inline-flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 active:scale-95"
                              >
                                {addingTrustlineCode === asset.code ? (
                                  <Loader2 size={12} className="animate-spin" />
                                ) : null}
                                <span>Add Trustline</span>
                              </button>
                            ))}
                          {asset.faucetUrl && (
                            <a
                              href={asset.faucetUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="px-2.5 py-1.5 rounded-lg bg-bg-secondary hover:bg-bg-hover border border-border-color text-text-primary text-[10px] font-bold inline-flex items-center gap-1 transition-colors"
                            >
                              Faucet <ExternalLink size={10} />
                            </a>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between bg-bg-primary p-2.5 rounded-lg border border-divider text-[10px] font-mono">
                        <span className="text-text-muted truncate max-w-[280px]">
                          {asset.issuer}
                        </span>
                        <button
                          onClick={() => handleCopy(asset.issuer, asset.code)}
                          className="text-text-muted hover:text-text-primary p-1 rounded transition-colors cursor-pointer"
                          title="Copy Issuer Address"
                        >
                          {copiedKey === asset.code ? (
                            <Check size={12} className="text-success" />
                          ) : (
                            <Copy size={12} />
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === 'evm' && (
            <div className="space-y-4">
              <div className="text-xs text-text-muted leading-relaxed">
                Official faucet providers for EVM test networks:
              </div>

              <div className="space-y-2.5">
                {EVM_TESTNET_FAUCETS.map(faucet => (
                  <a
                    key={faucet.name}
                    href={faucet.url}
                    target="_blank"
                    rel="noreferrer"
                    className="p-3.5 rounded-xl bg-bg-tertiary/40 border border-border-color hover:border-border-dark hover:bg-bg-tertiary transition-all flex items-center justify-between group"
                  >
                    <div>
                      <div className="text-xs font-bold text-text-primary group-hover:text-brand transition-colors">
                        {faucet.name}
                      </div>
                      <div className="text-[10px] text-text-muted">{faucet.chain}</div>
                    </div>
                    <ExternalLink
                      size={14}
                      className="text-text-muted group-hover:text-text-primary transition-colors"
                    />
                  </a>
                ))}
              </div>

              {evmWallet?.address && (
                <div className="pt-2">
                  <div className="flex items-center justify-between bg-bg-tertiary/40 p-3.5 rounded-xl border border-border-color">
                    <div>
                      <div className="text-[10px] font-bold text-text-muted uppercase">
                        Connected EVM Address
                      </div>
                      <code className="text-xs font-mono text-text-primary">
                        {evmWallet.address.slice(0, 10)}...{evmWallet.address.slice(-6)}
                      </code>
                    </div>
                    <button
                      onClick={() => handleCopy(evmWallet.address, 'evm')}
                      className="px-3 py-1.5 rounded-lg bg-brand hover:bg-brand-hover text-white text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer active:scale-95"
                    >
                      {copiedKey === 'evm' ? (
                        <>
                          <Check size={12} className="text-success" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy size={12} />
                          <span>Copy Address</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
