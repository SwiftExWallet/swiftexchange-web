import { Check, ChevronDown } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';

import { useExchangeManager } from '../../core/ExchangeManager';
import type { OrderType } from '../../core/stores/orderEntryStore';

interface OrderTypeSelectorProps {
  activeType: OrderType;
  onChange: (type: OrderType) => void;
}

const ASTER_ADVANCED_TYPES: { label: string; value: OrderType }[] = [
  { label: 'Stop Limit', value: 'STOP' },
  { label: 'Stop Market', value: 'STOP_MARKET' },
  { label: 'Trailing Stop', value: 'TRAILING_STOP_MARKET' },
  { label: 'Post Only', value: 'POST_ONLY' },
  { label: 'Scaled Order', value: 'SCALED' },
  { label: 'Chase Order', value: 'CHASE' },
];

const HYPERLIQUID_ADVANCED_TYPES: { label: string; value: OrderType }[] = [
  { label: 'Stop Limit', value: 'STOP' },
  { label: 'Stop Market', value: 'STOP_MARKET' },
  { label: 'Post Only', value: 'POST_ONLY' },
];

export const OrderTypeSelector: React.FC<OrderTypeSelectorProps> = ({ activeType, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const currentExchange = useExchangeManager(s => s.currentExchange);

  const advancedTypes =
    currentExchange === 'hyperliquid' ? HYPERLIQUID_ADVANCED_TYPES : ASTER_ADVANCED_TYPES;

  useEffect(() => {
    if (currentExchange === 'hyperliquid') {
      const allowed = ['MARKET', 'LIMIT', ...HYPERLIQUID_ADVANCED_TYPES.map(t => t.value)];
      if (!allowed.includes(activeType)) {
        onChange('LIMIT');
      }
    }
  }, [currentExchange, activeType, onChange]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isAdvancedActive = advancedTypes.some(t => t.value === activeType);
  const activeAdvancedObj = advancedTypes.find(t => t.value === activeType);
  const dropdownDisplayLabel = activeAdvancedObj ? activeAdvancedObj.label : 'Stop Limit';

  return (
    <div className="flex border-b border-color text-[11px] font-medium shrink-0">
      <button
        type="button"
        onClick={() => onChange('MARKET')}
        className={`flex-1 py-2.5 text-center transition-colors ${
          activeType === 'MARKET'
            ? 'text-primary border-b-2 border-brand font-semibold'
            : 'text-secondary hover:text-primary'
        }`}
      >
        Market
      </button>

      <button
        type="button"
        onClick={() => onChange('LIMIT')}
        className={`flex-1 py-2.5 text-center transition-colors ${
          activeType === 'LIMIT'
            ? 'text-primary border-b-2 border-brand font-semibold'
            : 'text-secondary hover:text-primary'
        }`}
      >
        Limit
      </button>

      <div className="flex-1 relative" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={`w-full py-2.5 text-center transition-colors flex items-center justify-center gap-1 ${
            isAdvancedActive
              ? 'text-primary border-b-2 border-brand font-semibold'
              : 'text-secondary hover:text-primary'
          }`}
        >
          <span>{dropdownDisplayLabel}</span>
          <ChevronDown size={12} className="text-secondary" />
        </button>

        {isOpen && (
          <div className="absolute right-0 top-full mt-1 w-[150px] bg-secondary border border-color rounded-md shadow-2xl overflow-hidden z-50 py-1">
            {advancedTypes.map(type => {
              const isSelected = activeType === type.value;
              return (
                <button
                  key={type.value}
                  type="button"
                  className={`flex items-center justify-between w-full px-3 py-2 text-[11px] text-left hover:bg-hover transition-colors ${
                    isSelected ? 'text-brand font-semibold' : 'text-primary'
                  }`}
                  onClick={() => {
                    onChange(type.value);
                    setIsOpen(false);
                  }}
                >
                  <span>{type.label}</span>
                  {isSelected && <Check size={13} className="text-brand" />}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
