import { Check, ChevronDown } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { useExchangeManager } from '../../core/ExchangeManager';

export const ExchangeNetworkSelector: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, right: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentExchange = useExchangeManager(state => state.currentExchange);
  const setExchange = useExchangeManager(state => state.setExchange);

  const updatePosition = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setCoords({
        top: rect.bottom + 6,
        right: Math.max(12, window.innerWidth - rect.right),
      });
    }
  };

  const handleToggle = () => {
    if (!isOpen) {
      updatePosition();
    }
    setIsOpen(!isOpen);
  };

  // Close on outside click, window scroll or resize
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current &&
        !triggerRef.current.contains(target) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    const handleScrollOrResize = () => {
      if (isOpen) updatePosition();
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
      window.addEventListener('scroll', handleScrollOrResize, true);
      window.addEventListener('resize', handleScrollOrResize);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [isOpen]);

  const isAster = currentExchange === 'aster';

  return (
    <>
      {/* ── Compact DEX Trigger Pill ── */}
      <button
        ref={triggerRef}
        type="button"
        onClick={handleToggle}
        className={`flex items-center gap-1.5 h-7.5 px-2.5 rounded-lg border transition-all cursor-pointer select-none text-[12px] font-medium shadow-xs ${
          isOpen
            ? 'bg-hover border-brand/50 ring-2 ring-brand/10'
            : 'bg-tertiary hover:bg-hover border-color hover:border-color-hover'
        }`}
        title={`DEX Protocol: ${isAster ? 'Aster V3' : 'Hyperliquid'}`}
      >
        {/* Exchange Actual Logo */}
        <div className="flex items-center gap-1.5 font-semibold text-primary">
          <img
            src={isAster ? '/aster.png' : '/hyperliquid.webp'}
            alt={isAster ? 'Aster' : 'Hyperliquid'}
            className="w-3.5 h-3.5 rounded-full object-cover shrink-0"
          />
          <span>{isAster ? 'Aster V3' : 'Hyperliquid'}</span>
        </div>

        <ChevronDown
          size={12}
          className={`text-muted transition-transform duration-200 ml-0.5 ${isOpen ? 'rotate-180 text-primary' : ''}`}
        />
      </button>

      {/* ── Portal-based Floating Popover (DEX Protocol Selection) ── */}
      {isOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={dropdownRef}
            style={{
              top: `${coords.top}px`,
              right: `${coords.right}px`,
            }}
            className="fixed z-[99999] w-[275px] bg-secondary/95 backdrop-blur-xl border border-color rounded-2xl shadow-2xl p-3 animate-in fade-in slide-in-from-top-2 duration-150 space-y-2.5"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-1 pb-1.5 border-b border-color">
              <span className="text-[10px] font-bold text-muted uppercase tracking-wider">
                Select DEX Protocol
              </span>
              <span className="text-[10px] text-secondary font-mono">Real-time Feed</span>
            </div>

            {/* Protocol Selection List */}
            <div className="space-y-1.5">
              {/* Aster V3 */}
              <button
                type="button"
                onClick={() => {
                  if (currentExchange !== 'aster') setExchange('aster');
                  setIsOpen(false);
                }}
                className={`w-full flex items-center justify-between p-2.5 rounded-xl text-left transition-all cursor-pointer ${
                  isAster
                    ? 'bg-amber-500/10 border border-amber-500/30 text-primary shadow-xs'
                    : 'hover:bg-hover border border-transparent text-secondary hover:text-primary'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <img
                    src="/aster.png"
                    alt="Aster V3"
                    className="w-7 h-7 rounded-lg object-cover shrink-0 shadow-sm"
                  />
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[12px] font-bold text-primary">Aster V3</span>
                      <span className="text-[9px] bg-tertiary px-1 py-0.2 rounded text-muted font-medium border border-color">
                        Multi-Asset
                      </span>
                    </div>
                    <p className="text-[10px] text-muted leading-tight mt-0.5">
                      Orderbook DEX with cross & isolated margin
                    </p>
                  </div>
                </div>
                {isAster && <Check size={15} className="text-amber-400 shrink-0 ml-1" />}
              </button>

              {/* Hyperliquid */}
              <button
                type="button"
                onClick={() => {
                  if (currentExchange !== 'hyperliquid') setExchange('hyperliquid');
                  setIsOpen(false);
                }}
                className={`w-full flex items-center justify-between p-2.5 rounded-xl text-left transition-all cursor-pointer ${
                  !isAster
                    ? 'bg-cyan-500/10 border border-cyan-500/30 text-primary shadow-xs'
                    : 'hover:bg-hover border border-transparent text-secondary hover:text-primary'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <img
                    src="/hyperliquid.webp"
                    alt="Hyperliquid"
                    className="w-7 h-7 rounded-lg object-cover shrink-0 shadow-sm"
                  />
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[12px] font-bold text-primary">Hyperliquid</span>
                      <span className="text-[9px] bg-cyan-500/10 text-cyan-400 px-1 py-0.2 rounded font-semibold border border-cyan-500/20">
                        L1 Appchain
                      </span>
                    </div>
                    <p className="text-[10px] text-muted leading-tight mt-0.5">
                      Sub-second finality with USDC collateral
                    </p>
                  </div>
                </div>
                {!isAster && <Check size={15} className="text-cyan-400 shrink-0 ml-1" />}
              </button>
            </div>
          </div>,
          document.body
        )}
    </>
  );
};
