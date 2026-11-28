import { Check, Copy, ExternalLink, Info } from 'lucide-react';
import React, { useState } from 'react';

import type { NetworkType } from '@/modules/walletconnect/config/chains';

import type { SingleVaultConfig } from '../config/vault.config';
import { getExplorerAccountUrl, getExplorerContractUrl } from '../config/vault.config';

interface VaultTransparencyProps {
  vault: SingleVaultConfig;
  network: NetworkType;
}

export const VaultTransparency: React.FC<VaultTransparencyProps> = ({ vault, network }) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopy = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const roles = [
    {
      title: 'Vault Manager',
      address: vault.roles.vaultManager,
      desc: 'Configures vault parameters and fees. Cannot withdraw user principal.',
    },
    {
      title: 'Rebalance Manager',
      address: vault.roles.rebalanceManager,
      desc: 'Allocates and compounds idle liquidity into active yield strategies.',
    },
    {
      title: 'Emergency Manager',
      address: vault.roles.emergencyManager,
      desc: 'Can pause deposits/withdrawals strictly in high-volatility protocol anomalies.',
    },
    {
      title: 'Fee Receiver',
      address: vault.roles.feeReceiver,
      desc: 'Designated account that receives performance fees accrued by the vault.',
    },
  ];

  return (
    <div className="divide-y divide-(--color-border)">
      <div className="p-4 sm:px-6 flex flex-wrap items-center justify-between gap-3 bg-(--color-bg-tertiary)/20">
        <h4 className="text-xs font-bold tracking-wider text-brand-primary uppercase">
          On-Chain Roles & Governance
        </h4>
        <span className="text-xs text-(--color-text-secondary)">
          Permissionless Soroban Bytecode
        </span>
      </div>

      <div className="p-4 sm:px-6 flex items-start gap-2.5 text-xs text-(--color-text-secondary) bg-brand-primary/5">
        <Info className="w-4 h-4 text-brand-primary shrink-0 mt-0.5" />
        <p>
          SwiftEx governance roles cannot block, lock, or redirect user withdrawals. All deposit and
          withdrawal operations execute directly on Soroban smart contracts.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-(--color-border)">
        {roles.map(r => (
          <div key={r.title} className="p-5 space-y-2">
            <div className="text-xs font-bold text-(--color-text-primary)">{r.title}</div>
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-xs text-(--color-text-secondary) truncate">
                {r.address
                  ? `${r.address.slice(0, 8)}...${r.address.slice(-6)}`
                  : 'On-Chain Managed'}
              </span>
              {r.address && (
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handleCopy(r.title, r.address)}
                    className="p-1 hover:bg-(--color-bg-hover) rounded-lg text-(--color-text-secondary) hover:text-(--color-text-primary) transition-colors cursor-pointer"
                    title="Copy address"
                  >
                    {copiedKey === r.title ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                  <a
                    href={getExplorerAccountUrl(r.address, network)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1 hover:bg-(--color-bg-hover) rounded-lg text-(--color-text-secondary) hover:text-brand-primary transition-colors"
                    title="View on Stellar Expert"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              )}
            </div>
            <div className="text-[11px] text-(--color-text-muted) leading-relaxed">{r.desc}</div>
          </div>
        ))}
      </div>

      <div className="p-4 sm:px-6 flex flex-wrap items-center justify-between gap-3 text-xs bg-(--color-bg-tertiary)/20">
        <div className="flex flex-wrap items-center gap-4">
          <div className="text-(--color-text-secondary)">
            Vault Contract:{' '}
            <a
              href={getExplorerContractUrl(vault.vaultAddress, network)}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-brand-primary hover:underline font-semibold"
            >
              {vault.vaultAddress.slice(0, 8)}...{vault.vaultAddress.slice(-6)}
            </a>
          </div>
          <div className="text-(--color-text-secondary)">
            Strategy Engine:{' '}
            <a
              href={getExplorerContractUrl(vault.strategyAddress, network)}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-brand-primary hover:underline font-semibold"
            >
              {vault.strategyAddress.slice(0, 8)}...{vault.strategyAddress.slice(-6)}
            </a>
          </div>
        </div>

        <a
          href={getExplorerContractUrl(vault.vaultAddress, network)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-(--color-bg-secondary) hover:bg-(--color-bg-hover) border border-(--color-border) text-xs font-semibold text-(--color-text-primary) transition-colors"
        >
          <span>View Contract on Stellar Expert</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>
    </div>
  );
};
