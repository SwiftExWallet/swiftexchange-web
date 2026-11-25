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
      <button
        ref={triggerRef}
        type="button"
        onClick={handleToggle}
        className={`flex items-center gap-1.5 h-7.5 px-2.5 rounded-lg border transition-all cursor-pointer select-none text-[12px] font-medium shadow-xs ${
          isOpen
            ? 'bg-bg-hover border-brand/50 ring-2 ring-brand/10'
            : 'bg-bg-tertiary hover:bg-bg-hover border-border-color'
        }`}
        title={`Exchange: ${isAster ? 'Aster' : 'Hyperliquid'}`}
      >
        <div className="flex items-center gap-1.5 font-semibold text-text-primary">
          <img
            src={isAster ? '/aster.png' : '/hyperliquid.webp'}
            alt={isAster ? 'Aster' : 'Hyperliquid'}
            className="w-3.5 h-3.5 rounded-full object-cover shrink-0"
          />
          <span>{isAster ? 'Aster' : 'Hyperliquid'}</span>
        </div>

        <ChevronDown
          size={12}
          className={`text-text-muted transition-transform duration-200 ml-0.5 ${isOpen ? 'rotate-180 text-text-primary' : ''}`}
        />
      </button>

      {isOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-[99998] bg-black/20 backdrop-blur-[1px]"
              onClick={() => setIsOpen(false)}
            />
            <div
              ref={dropdownRef}
              style={{
                top: `${coords.top}px`,
                right: `${coords.right}px`,
              }}
              className="fixed z-[99999] w-[260px] max-w-[calc(100vw-24px)] bg-bg-secondary/95 backdrop-blur-xl border border-border-color rounded-2xl shadow-2xl p-3 animate-in fade-in slide-in-from-top-2 duration-150 space-y-2.5"
            >
              <div className="flex items-center justify-between px-1 pb-1.5 border-b border-border-color">
                <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">
                  Select Exchange
                </span>
              </div>

              <div className="space-y-1.5">
                <button
                  type="button"
                  onClick={() => {
                    if (currentExchange !== 'aster') setExchange('aster');
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-center justify-between p-2.5 rounded-xl text-left transition-all cursor-pointer ${
                    isAster
                      ? 'bg-amber-500/10 border border-amber-500/30 text-text-primary shadow-xs'
                      : 'hover:bg-bg-hover border border-transparent text-text-secondary hover:text-text-primary'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <img
                      src="/aster.png"
                      alt="Aster"
                      className="w-7 h-7 rounded-lg object-cover shrink-0 shadow-sm"
                    />
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[12px] font-bold text-text-primary">Aster</span>
                      </div>
                      <p className="text-[10px] text-text-muted leading-tight mt-0.5">
                        Perpetuals Trading
                      </p>
                    </div>
                  </div>
                  {isAster && <Check size={15} className="text-amber-400 shrink-0 ml-1" />}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (currentExchange !== 'hyperliquid') setExchange('hyperliquid');
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-center justify-between p-2.5 rounded-xl text-left transition-all cursor-pointer ${
                    !isAster
                      ? 'bg-cyan-500/10 border border-cyan-500/30 text-text-primary shadow-xs'
                      : 'hover:bg-bg-hover border border-transparent text-text-secondary hover:text-text-primary'
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
                        <span className="text-[12px] font-bold text-text-primary">Hyperliquid</span>
                      </div>
                      <p className="text-[10px] text-text-muted leading-tight mt-0.5">
                        Perpetuals Trading
                      </p>
                    </div>
                  </div>
                  {!isAster && <Check size={15} className="text-cyan-400 shrink-0 ml-1" />}
                </button>
              </div>
            </div>
          </>,
          document.body
        )}
    </>
  );
};
