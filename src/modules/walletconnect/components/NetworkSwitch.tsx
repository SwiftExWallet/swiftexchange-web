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

  const isTestnet = network === 'testnet';

  return (
    <div className="relative flex items-center">
      <div
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
          isTestnet
            ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
            : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
        }`}
      >
        <span
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${
            isTestnet ? 'bg-amber-400' : 'bg-emerald-400'
          }`}
        />
        <select
          value={network}
          onChange={e => handleNetworkChange(e.target.value as NetworkType)}
          className="bg-transparent text-xs font-semibold cursor-pointer outline-none appearance-none pr-3.5 text-inherit select-none"
        >
          <option
            value="testnet"
            className="bg-[var(--color-bg-primary)] text-[var(--color-text-primary)]"
          >
            Testnet
          </option>
          <option
            value="mainnet"
            className="bg-[var(--color-bg-primary)] text-[var(--color-text-primary)]"
          >
            Mainnet
          </option>
        </select>
        <ChevronDown size={11} className="pointer-events-none opacity-70 shrink-0 -ml-2.5" />
      </div>
    </div>
  );
};

export default NetworkSwitch;
