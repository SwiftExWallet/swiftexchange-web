import { ChevronDown } from 'lucide-react';
import React, { useEffect } from 'react';

import { IS_MAINNET_ENABLED, IS_TESTNET_ENABLED, type NetworkType } from '../config/chains';
import { useWalletStore } from '../store/walletConnectStore';

const NetworkSwitch: React.FC = () => {
  const network = useWalletStore(state => state.network);
  const setNetwork = useWalletStore(state => state.setNetwork);

  useEffect(() => {
    if (!IS_TESTNET_ENABLED) {
      if (network !== 'mainnet') {
        setNetwork('mainnet');
      }
      localStorage.setItem('network', 'mainnet');
      return;
    }

    if (!IS_MAINNET_ENABLED) {
      if (network !== 'testnet') {
        setNetwork('testnet');
      }
      localStorage.setItem('network', 'testnet');
      return;
    }

    const storedNetwork = localStorage.getItem('network');
    if (!storedNetwork) {
      localStorage.setItem('network', network);
    }
  }, [network, setNetwork]);

  const handleNetworkChange = async (newNetwork: NetworkType) => {
    if (newNetwork === network) return;
    try {
      await setNetwork(newNetwork);
    } catch (error) {
      console.error('[NetworkSwitch] Error switching network:', error);
      alert('Failed to switch network. Please try again.');
    }
  };

  if (!IS_TESTNET_ENABLED) {
    return (
      <div className="flex items-center px-2.5 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 text-xs font-semibold tracking-wide select-none">
        <span>Mainnet</span>
      </div>
    );
  }

  if (!IS_MAINNET_ENABLED) {
    return (
      <div className="flex items-center px-2.5 py-1.5 rounded-lg bg-amber-500/10 text-amber-400 text-xs font-semibold tracking-wide select-none">
        <span>Testnet</span>
      </div>
    );
  }

  return (
    <div className="relative flex items-center">
      <select
        value={network}
        onChange={e => handleNetworkChange(e.target.value as NetworkType)}
        className="bg-[var(--color-bg-tertiary)]/60 hover:bg-[var(--color-bg-tertiary)] text-xs font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] rounded-lg px-2.5 py-1.5 cursor-pointer outline-none transition-all appearance-none pr-6 select-none"
      >
        <option
          value="mainnet"
          className="bg-[var(--color-bg-primary)] text-[var(--color-text-primary)]"
        >
          Mainnet
        </option>
        <option
          value="testnet"
          className="bg-[var(--color-bg-primary)] text-[var(--color-text-primary)]"
        >
          Testnet
        </option>
      </select>
      <ChevronDown
        size={12}
        className="absolute right-2 text-[var(--color-text-secondary)] pointer-events-none opacity-60"
      />
    </div>
  );
};

export default NetworkSwitch;
