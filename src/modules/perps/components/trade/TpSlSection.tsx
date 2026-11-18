import { Check, ChevronDown, Info } from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';

import type { WorkingType } from '../../core/stores/orderEntryStore';
import { formatPriceToTick } from '../../utils/precision';

export type TpSlMode = 'PRICE' | 'PNL' | 'ROI';

export interface TpSlSectionProps {
  entryPrice: number;
  currentPrice: number;
  markPrice: number;
  size: string;
  sizeAsset: 'base' | 'quote';
  leverage: number;
  side: 'BUY' | 'SELL';
  onSideChange?: (side: 'BUY' | 'SELL') => void;
  quoteAsset: string;
  baseAsset?: string;
  priceDecimals: number;
  tickSize?: string | number;
  attachedTpEnabled: boolean;
  attachedTpPrice: string;
  attachedTpTrigger: WorkingType;
  attachedSlEnabled: boolean;
  attachedSlPrice: string;
  attachedSlTrigger: WorkingType;
  onTpPriceChange: (val: string) => void;
  onSlPriceChange: (val: string) => void;
  onTpTriggerChange: (val: WorkingType) => void;
  onSlTriggerChange: (val: WorkingType) => void;
}

const MODE_OPTIONS: { key: TpSlMode; label: (q: string) => string; desc: string }[] = [
  { key: 'PRICE', label: q => `Price (${q})`, desc: 'Execute based on crypto price' },
  { key: 'PNL', label: q => `PnL (${q})`, desc: 'Set based on estimated PnL' },
  { key: 'ROI', label: () => 'ROI (%)', desc: 'Set based on estimated ROI%' },
];

export const TpSlSection: React.FC<TpSlSectionProps> = ({
  entryPrice,
  currentPrice,
  markPrice,
  size,
  sizeAsset,
  leverage,
  side,
  quoteAsset,
  priceDecimals,
  tickSize = '0.1',
  attachedTpPrice,
  attachedTpTrigger,
  attachedSlPrice,
  attachedSlTrigger,
  onTpPriceChange,
  onSlPriceChange,
  onTpTriggerChange,
  onSlTriggerChange,
}) => {
  const [tpMode, setTpMode] = useState<TpSlMode>('PRICE');
  const [slMode, setSlMode] = useState<TpSlMode>('PNL');
  const [showTpDropdown, setShowTpDropdown] = useState(false);
  const [showSlDropdown, setShowSlDropdown] = useState(false);
  const [tpPnlInput, setTpPnlInput] = useState('');
  const [tpRoiInput, setTpRoiInput] = useState('');
  const [slPnlInput, setSlPnlInput] = useState('');
  const [slRoiInput, setSlRoiInput] = useState('');

  const tpDropdownRef = useRef<HTMLDivElement>(null);
  const slDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (tpDropdownRef.current && !tpDropdownRef.current.contains(e.target as Node)) {
        setShowTpDropdown(false);
      }
      if (slDropdownRef.current && !slDropdownRef.current.contains(e.target as Node)) {
        setShowSlDropdown(false);
      }
    };
    if (showTpDropdown || showSlDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showTpDropdown, showSlDropdown]);

  const effectiveEntry = useMemo(() => {
    if (entryPrice > 0) return entryPrice;
    if (currentPrice > 0) return currentPrice;
    if (markPrice > 0) return markPrice;
    return 0;
  }, [entryPrice, currentPrice, markPrice]);

  const baseQty = useMemo(() => {
    const s = parseFloat(size);
    if (isNaN(s) || s <= 0) return 0;
    if (sizeAsset === 'base') return s;
    return effectiveEntry > 0 ? s / effectiveEntry : 0;
  }, [size, sizeAsset, effectiveEntry]);

  const initialMargin = useMemo(() => {
    const lev = leverage > 0 ? leverage : 20;
    return effectiveEntry > 0 && baseQty > 0 ? (baseQty * effectiveEntry) / lev : 0;
  }, [baseQty, effectiveEntry, leverage]);

  const isLong = side === 'BUY';

  useEffect(() => {
    if (tpMode === 'PNL') {
      const pnlNum = parseFloat(tpPnlInput);
      if (!isNaN(pnlNum) && pnlNum > 0 && baseQty > 0 && effectiveEntry > 0) {
        const delta = pnlNum / baseQty;
        const targetPx = isLong ? effectiveEntry + delta : effectiveEntry - delta;
        if (targetPx > 0) {
          const formatted = tickSize
            ? formatPriceToTick(targetPx, tickSize)
            : targetPx.toFixed(priceDecimals);
          onTpPriceChange(formatted);
        }
      } else if (tpPnlInput === '') {
        onTpPriceChange('');
      }
    } else if (tpMode === 'ROI') {
      const lev = leverage > 0 ? leverage : 20;
      const roiNum = parseFloat(tpRoiInput);
      if (!isNaN(roiNum) && roiNum > 0 && effectiveEntry > 0) {
        const delta = (effectiveEntry * (roiNum / 100)) / lev;
        const targetPx = isLong ? effectiveEntry + delta : effectiveEntry - delta;
        if (targetPx > 0) {
          const formatted = tickSize
            ? formatPriceToTick(targetPx, tickSize)
            : targetPx.toFixed(priceDecimals);
          onTpPriceChange(formatted);
        }
      } else if (tpRoiInput === '') {
        onTpPriceChange('');
      }
    }
  }, [
    tpMode,
    tpPnlInput,
    tpRoiInput,
    baseQty,
    effectiveEntry,
    isLong,
    leverage,
    tickSize,
    priceDecimals,
    onTpPriceChange,
  ]);

  useEffect(() => {
    if (slMode === 'PNL') {
      const rawVal = slPnlInput.replace(/[^0-9.]/g, '');
      const pnlNum = parseFloat(rawVal);
      if (!isNaN(pnlNum) && pnlNum > 0 && baseQty > 0 && effectiveEntry > 0) {
        const delta = pnlNum / baseQty;
        const targetPx = isLong ? effectiveEntry - delta : effectiveEntry + delta;
        if (targetPx > 0) {
          const formatted = tickSize
            ? formatPriceToTick(targetPx, tickSize)
            : targetPx.toFixed(priceDecimals);
          onSlPriceChange(formatted);
        }
      } else if (slPnlInput === '') {
        onSlPriceChange('');
      }
    } else if (slMode === 'ROI') {
      const lev = leverage > 0 ? leverage : 20;
      const rawVal = slRoiInput.replace(/[^0-9.]/g, '');
      const roiNum = parseFloat(rawVal);
      if (!isNaN(roiNum) && roiNum > 0 && effectiveEntry > 0) {
        const delta = (effectiveEntry * (roiNum / 100)) / lev;
        const targetPx = isLong ? effectiveEntry - delta : effectiveEntry + delta;
        if (targetPx > 0) {
          const formatted = tickSize
            ? formatPriceToTick(targetPx, tickSize)
            : targetPx.toFixed(priceDecimals);
          onSlPriceChange(formatted);
        }
      } else if (slRoiInput === '') {
        onSlPriceChange('');
      }
    }
  }, [
    slMode,
    slPnlInput,
    slRoiInput,
    baseQty,
    effectiveEntry,
    isLong,
    leverage,
    tickSize,
    priceDecimals,
    onSlPriceChange,
  ]);

  const tpStats = useMemo(() => {
    const tpPx = parseFloat(attachedTpPrice);
    if (isNaN(tpPx) || tpPx <= 0 || effectiveEntry <= 0) return null;
    const priceDiff = isLong ? tpPx - effectiveEntry : effectiveEntry - tpPx;
    const pnl = baseQty > 0 ? priceDiff * baseQty : null;
    const lev = leverage > 0 ? leverage : 20;
    const roi =
      initialMargin > 0 && pnl != null
        ? (pnl / initialMargin) * 100
        : (priceDiff / effectiveEntry) * lev * 100;
    return { pnl, roi, tpPx };
  }, [attachedTpPrice, effectiveEntry, isLong, baseQty, initialMargin, leverage]);

  const slStats = useMemo(() => {
    const slPx = parseFloat(attachedSlPrice);
    if (isNaN(slPx) || slPx <= 0 || effectiveEntry <= 0) return null;
    const priceDiff = isLong ? slPx - effectiveEntry : effectiveEntry - slPx;
    const pnl = baseQty > 0 ? priceDiff * baseQty : null;
    const lev = leverage > 0 ? leverage : 20;
    const roi =
      initialMargin > 0 && pnl != null
        ? (pnl / initialMargin) * 100
        : (priceDiff / effectiveEntry) * lev * 100;
    return { pnl, roi, slPx };
  }, [attachedSlPrice, effectiveEntry, isLong, baseQty, initialMargin, leverage]);

  const handleSelectTpMode = (nextMode: TpSlMode) => {
    if (nextMode === tpMode) {
      setShowTpDropdown(false);
      return;
    }
    if (nextMode === 'PRICE') {
      if (attachedTpPrice) {
        onTpPriceChange(attachedTpPrice);
      }
    } else if (nextMode === 'PNL') {
      if (tpStats?.pnl != null && tpStats.pnl > 0) {
        setTpPnlInput(tpStats.pnl.toFixed(2));
      }
    } else if (nextMode === 'ROI') {
      if (tpStats?.roi != null && tpStats.roi > 0) {
        setTpRoiInput(tpStats.roi.toFixed(1));
      }
    }
    setTpMode(nextMode);
    setShowTpDropdown(false);
  };

  const handleSelectSlMode = (nextMode: TpSlMode) => {
    if (nextMode === slMode) {
      setShowSlDropdown(false);
      return;
    }
    if (nextMode === 'PRICE') {
      if (attachedSlPrice) {
        onSlPriceChange(attachedSlPrice);
      }
    } else if (nextMode === 'PNL') {
      if (slStats?.pnl != null && slStats.pnl !== 0) {
        setSlPnlInput((-Math.abs(slStats.pnl)).toFixed(2));
      }
    } else if (nextMode === 'ROI') {
      if (slStats?.roi != null && slStats.roi !== 0) {
        setSlRoiInput((-Math.abs(slStats.roi)).toFixed(1));
      }
    }
    setSlMode(nextMode);
    setShowSlDropdown(false);
  };

  const renderDropdown = (
    currentMode: TpSlMode,
    isOpen: boolean,
    setIsOpen: (val: boolean) => void,
    onSelect: (m: TpSlMode) => void,
    containerRef: React.RefObject<HTMLDivElement | null>
  ) => {
    const selectedItem = MODE_OPTIONS.find(m => m.key === currentMode) || MODE_OPTIONS[0];

    return (
      <div className="relative shrink-0 pr-1.5" ref={containerRef}>
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-1 px-2 py-1 rounded-md bg-secondary hover:bg-hover border border-color text-[11px] font-medium text-primary transition-colors cursor-pointer select-none"
        >
          <span>{selectedItem.label(quoteAsset)}</span>
          <ChevronDown
            size={11}
            className={`text-secondary transition-transform ${isOpen ? 'rotate-180' : ''}`}
          />
        </button>

        {isOpen && (
          <div className="absolute right-0 top-8 z-50 w-52 bg-secondary border border-color rounded-lg shadow-2xl p-1 space-y-0.5 animate-scale-in">
            {MODE_OPTIONS.map(opt => (
              <button
                key={opt.key}
                type="button"
                onClick={() => onSelect(opt.key)}
                className={`w-full text-left px-2.5 py-2 rounded-md text-[11px] transition-colors flex items-center justify-between cursor-pointer ${
                  currentMode === opt.key
                    ? 'bg-brand/10 text-brand font-semibold'
                    : 'text-primary hover:bg-tertiary'
                }`}
              >
                <div>
                  <div className="font-semibold leading-tight">{opt.label(quoteAsset)}</div>
                  <div className="text-[10px] text-secondary leading-tight mt-0.5">{opt.desc}</div>
                </div>
                {currentMode === opt.key && (
                  <Check size={13} className="text-brand shrink-0 ml-1.5" />
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-3 pt-2 text-xs">
      <div className="space-y-1.5">
        <div className="flex justify-between items-center text-[11px]">
          <span className="font-medium text-success">Take Profit</span>
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-secondary">Trigger:</span>
            <select
              value={attachedTpTrigger}
              onChange={e => onTpTriggerChange(e.target.value as WorkingType)}
              className="bg-tertiary border border-color rounded px-1.5 py-0.5 text-primary text-[10px] outline-none cursor-pointer"
            >
              <option value="MARK_PRICE" className="bg-secondary">
                Mark
              </option>
              <option value="CONTRACT_PRICE" className="bg-secondary">
                Last
              </option>
            </select>
          </div>
        </div>

        <div className="relative flex items-center h-9 bg-tertiary border border-color rounded-lg focus-within:border-brand transition-colors">
          <span className="text-[11px] font-semibold text-secondary pl-3 pr-2 select-none shrink-0">
            {tpMode === 'PRICE' ? 'Trigger' : 'TP'}
          </span>
          <input
            type="text"
            inputMode="decimal"
            placeholder={
              tpMode === 'PRICE'
                ? currentPrice > 0
                  ? (currentPrice * (isLong ? 1.01 : 0.99)).toFixed(priceDecimals)
                  : '0.00'
                : tpMode === 'PNL'
                  ? '4.00'
                  : '5'
            }
            value={
              tpMode === 'PRICE' ? attachedTpPrice : tpMode === 'PNL' ? tpPnlInput : tpRoiInput
            }
            onChange={e => {
              const val = e.target.value;
              if (val === '' || /^\d*\.?\d*$/.test(val)) {
                if (tpMode === 'PRICE') {
                  onTpPriceChange(val);
                } else if (tpMode === 'PNL') {
                  setTpPnlInput(val);
                } else {
                  setTpRoiInput(val);
                }
              }
            }}
            className="w-full bg-transparent text-primary text-xs font-mono outline-none placeholder:text-muted"
          />

          {renderDropdown(
            tpMode,
            showTpDropdown,
            setShowTpDropdown,
            handleSelectTpMode,
            tpDropdownRef
          )}
        </div>

        <div className="text-[10.5px] flex items-center justify-between text-secondary px-1">
          {tpMode === 'PRICE' && tpStats && (
            <>
              <span>
                Est. PnL:{' '}
                <strong
                  className={tpStats.pnl && tpStats.pnl > 0 ? 'text-success' : 'text-secondary'}
                >
                  {tpStats.pnl != null
                    ? `${tpStats.pnl > 0 ? '+' : ''}${tpStats.pnl.toFixed(2)} ${quoteAsset}`
                    : '--'}
                </strong>
              </span>
              <span className={tpStats.roi > 0 ? 'text-success font-medium' : 'text-secondary'}>
                {tpStats.roi > 0 ? '+' : ''}
                {tpStats.roi.toFixed(2)}% ROI
              </span>
            </>
          )}

          {tpMode === 'PNL' &&
            (baseQty > 0 ? (
              <>
                <span>
                  Trigger Price:{' '}
                  <strong className="text-primary font-mono">${attachedTpPrice || '--'}</strong>
                </span>
                {tpStats?.roi != null && (
                  <span className="text-success font-medium">+{tpStats.roi.toFixed(2)}% ROI</span>
                )}
              </>
            ) : (
              <span className="text-amber-500/90 flex items-center gap-1">
                <Info size={11} /> Enter order size to compute trigger price
              </span>
            ))}

          {tpMode === 'ROI' && (
            <>
              <span>
                Trigger Price:{' '}
                <strong className="text-primary font-mono">${attachedTpPrice || '--'}</strong>
              </span>
              {tpStats?.pnl != null && (
                <span className="text-success font-medium">
                  +{tpStats.pnl.toFixed(2)} {quoteAsset}
                </span>
              )}
            </>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex justify-between items-center text-[11px]">
          <span className="font-medium text-danger">Stop Loss</span>
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-secondary">Trigger:</span>
            <select
              value={attachedSlTrigger}
              onChange={e => onSlTriggerChange(e.target.value as WorkingType)}
              className="bg-tertiary border border-color rounded px-1.5 py-0.5 text-primary text-[10px] outline-none cursor-pointer"
            >
              <option value="MARK_PRICE" className="bg-secondary">
                Mark
              </option>
              <option value="CONTRACT_PRICE" className="bg-secondary">
                Last
              </option>
            </select>
          </div>
        </div>

        <div className="relative flex items-center h-9 bg-tertiary border border-color rounded-lg focus-within:border-brand transition-colors">
          <span className="text-[11px] font-semibold text-secondary pl-3 pr-2 select-none shrink-0">
            {slMode === 'PRICE' ? 'Trigger' : 'SL'}
          </span>
          <input
            type="text"
            inputMode="decimal"
            placeholder={
              slMode === 'PRICE'
                ? currentPrice > 0
                  ? (currentPrice * (isLong ? 0.99 : 1.01)).toFixed(priceDecimals)
                  : '0.00'
                : slMode === 'PNL'
                  ? '-4.00'
                  : '-5'
            }
            value={
              slMode === 'PRICE' ? attachedSlPrice : slMode === 'PNL' ? slPnlInput : slRoiInput
            }
            onChange={e => {
              const val = e.target.value;
              if (val === '' || /^-?\d*\.?\d*$/.test(val)) {
                if (slMode === 'PRICE') {
                  onSlPriceChange(val);
                } else if (slMode === 'PNL') {
                  setSlPnlInput(val);
                } else {
                  setSlRoiInput(val);
                }
              }
            }}
            className="w-full bg-transparent text-primary text-xs font-mono outline-none placeholder:text-muted"
          />

          {renderDropdown(
            slMode,
            showSlDropdown,
            setShowSlDropdown,
            handleSelectSlMode,
            slDropdownRef
          )}
        </div>

        <div className="text-[10.5px] flex items-center justify-between text-secondary px-1">
          {slMode === 'PRICE' && slStats && (
            <>
              <span>
                Est. Loss:{' '}
                <strong
                  className={slStats.pnl && slStats.pnl < 0 ? 'text-danger' : 'text-secondary'}
                >
                  {slStats.pnl != null ? `${slStats.pnl.toFixed(2)} ${quoteAsset}` : '--'}
                </strong>
              </span>
              <span className={slStats.roi < 0 ? 'text-danger font-medium' : 'text-secondary'}>
                {slStats.roi.toFixed(2)}% ROI
              </span>
            </>
          )}

          {slMode === 'PNL' &&
            (baseQty > 0 ? (
              <>
                <span>
                  Trigger Price:{' '}
                  <strong className="text-primary font-mono">${attachedSlPrice || '--'}</strong>
                </span>
                {slStats?.roi != null && (
                  <span className="text-danger font-medium">{slStats.roi.toFixed(2)}% ROI</span>
                )}
              </>
            ) : (
              <span className="text-amber-500/90 flex items-center gap-1">
                <Info size={11} /> Enter order size to compute trigger price
              </span>
            ))}

          {slMode === 'ROI' && (
            <>
              <span>
                Trigger Price:{' '}
                <strong className="text-primary font-mono">${attachedSlPrice || '--'}</strong>
              </span>
              {slStats?.pnl != null && (
                <span className="text-danger font-medium">
                  {slStats.pnl.toFixed(2)} {quoteAsset}
                </span>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
