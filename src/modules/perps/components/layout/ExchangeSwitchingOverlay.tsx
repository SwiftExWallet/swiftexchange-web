import { Loader2 } from 'lucide-react';
import React from 'react';

import { useExchangeManager } from '../../core/ExchangeManager';

export const ExchangeSwitchingOverlay: React.FC = () => {
  const isSwitching = useExchangeManager(state => state.isSwitching);
  const currentExchange = useExchangeManager(state => state.currentExchange);
  const currentNetwork = useExchangeManager(state => state.currentNetwork);

  if (!isSwitching) return null;

  const isAster = currentExchange === 'aster';
  const isTestnet = currentNetwork === 'testnet';
  const exchangeName = isAster ? 'Aster V3' : 'Hyperliquid';
  const logoSrc = isAster ? '/aster.png' : '/hyperliquid.webp';

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-md flex flex-col items-center justify-center p-4 select-none animate-in fade-in duration-200">
      <div className="bg-[#12141a]/95 border border-white/10 rounded-2xl p-6 max-w-sm w-full shadow-2xl flex flex-col items-center text-center space-y-4 relative overflow-hidden">
        {/* Top ambient glow */}
        <div
          className={`absolute -top-16 left-1/2 -translate-x-1/2 w-48 h-32 rounded-full blur-3xl opacity-35 pointer-events-none ${
            isAster ? 'bg-amber-500' : 'bg-cyan-500'
          }`}
        />

        {/* Animated Protocol Logo Card */}
        <div className="relative">
          <div
            className={`w-16 h-16 rounded-2xl p-2.5 flex items-center justify-center shadow-xl border relative z-10 ${
              isAster
                ? 'bg-gradient-to-b from-amber-500/20 to-amber-950/40 border-amber-500/40'
                : 'bg-gradient-to-b from-cyan-500/20 to-cyan-950/40 border-cyan-500/40'
            }`}
          >
            <img
              src={logoSrc}
              alt={exchangeName}
              className="w-full h-full object-contain drop-shadow-md"
            />
          </div>
          {/* Animated Spinner Ring */}
          <div
            className={`absolute -inset-1.5 rounded-3xl border-2 border-dashed animate-spin ${
              isAster ? 'border-amber-400/50' : 'border-cyan-400/50'
            }`}
          />
        </div>

        {/* Friendly User Status Heading */}
        <div className="space-y-1.5 z-10">
          <div className="flex items-center justify-center gap-2">
            <h3 className="text-[16px] font-bold text-primary tracking-tight">
              Switching to {exchangeName}
            </h3>
            <span
              className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                isTestnet
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  : 'bg-success/20 text-success border border-success/30'
              }`}
            >
              {isTestnet ? 'Testnet' : 'Mainnet'}
            </span>
          </div>
          <p className="text-[12px] text-secondary leading-relaxed">
            Loading real-time orderbooks & chart data...
          </p>
        </div>

        {/* Smooth Gradient Progress Bar */}
        <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden relative z-10">
          <div
            className={`h-full rounded-full animate-pulse transition-all duration-300 ${
              isAster
                ? 'bg-gradient-to-r from-amber-500 to-yellow-300 w-full'
                : 'bg-gradient-to-r from-cyan-500 to-blue-400 w-full'
            }`}
          />
        </div>

        <div className="flex items-center gap-1.5 text-[11px] text-muted z-10">
          <Loader2 size={13} className="animate-spin text-brand" />
          <span>Almost ready...</span>
        </div>
      </div>
    </div>
  );
};
