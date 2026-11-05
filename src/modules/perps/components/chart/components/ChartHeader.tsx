import {
  BarChart3,
  CandlestickChart,
  Check,
  ChevronDown,
  Maximize2,
  Minimize2,
  Search,
  Settings,
  TrendingUp,
  X,
} from 'lucide-react';
import { memo, useMemo, useState } from 'react';

import { indicatorRegistry } from 'lightweight-charts-indicators';

import { TIMEFRAMES } from '../constants/toolCategories';
import type { ActiveIndicator, CandleResolution, ChartType } from '../types';

interface TimeframeSelectorProps {
  value: CandleResolution;
  onChange: (v: CandleResolution) => void;
}

const PRIMARY_DESKTOP: CandleResolution[] = ['5MINS', '15MINS', '1HOUR', '4HOURS', '1DAY', '1WEEK'];

const TF_SHORT: Record<string, string> = {
  '1MIN': '1m',
  '5MINS': '5m',
  '15MINS': '15m',
  '30MINS': '30m',
  '1HOUR': '1H',
  '4HOURS': '4H',
  '1DAY': '1D',
  '1WEEK': '1W',
};

const TimeframeSelector = memo(function TimeframeSelector({
  value,
  onChange,
}: TimeframeSelectorProps) {
  const [open, setOpen] = useState(false);
  const selectedLabel = TF_SHORT[value] || value;
  const isSelectedInMore = !PRIMARY_DESKTOP.includes(value);

  return (
    <div className="flex items-center shrink-0">
      {/* Mobile: Single Compact Dropdown Button */}
      <div className="relative flex sm:hidden">
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-primary bg-tertiary/40 rounded transition-colors cursor-pointer"
        >
          <span>{selectedLabel}</span>
          <ChevronDown
            className={`w-3 h-3 transition-transform duration-150 ${open ? 'rotate-180' : 'opacity-60'}`}
          />
        </button>

        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div className="absolute top-full left-0 mt-1 bg-secondary rounded-md shadow-lg border border-color py-1 min-w-[110px] z-50">
              {TIMEFRAMES.map(tf => (
                <button
                  key={tf.value}
                  onClick={() => {
                    onChange(tf.value);
                    setOpen(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 text-[11px] hover:bg-hover transition-colors flex items-center justify-between cursor-pointer ${
                    value === tf.value ? 'text-brand font-semibold' : 'text-primary'
                  }`}
                >
                  <span>{tf.label}</span>
                  {value === tf.value && <Check className="w-3 h-3 text-brand" />}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Desktop: Flat Quick-Switch Pills */}
      <div className="hidden sm:flex items-center gap-0.5">
        {PRIMARY_DESKTOP.map(tf => {
          const isSelected = value === tf;
          return (
            <button
              key={tf}
              onClick={() => onChange(tf)}
              className={`px-1.5 py-0.5 text-[11px] font-medium rounded transition-colors cursor-pointer ${
                isSelected
                  ? 'bg-brand/15 text-brand font-semibold'
                  : 'text-secondary hover:text-primary hover:bg-hover/60'
              }`}
            >
              {TF_SHORT[tf] || tf}
            </button>
          );
        })}

        {/* Desktop More dropdown */}
        <div className="relative">
          <button
            onClick={() => setOpen(!open)}
            className={`flex items-center gap-0.5 px-1 py-0.5 text-[11px] rounded transition-colors cursor-pointer ${
              isSelectedInMore
                ? 'bg-brand/15 text-brand font-semibold'
                : 'text-secondary hover:text-primary hover:bg-hover/60'
            }`}
            title="More Timeframes"
          >
            <span>{isSelectedInMore ? TF_SHORT[value] || value : ''}</span>
            <ChevronDown
              className={`w-3 h-3 transition-transform duration-150 ${open ? 'rotate-180' : 'opacity-60'}`}
            />
          </button>

          {open && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
              <div className="absolute top-full left-0 mt-1 bg-secondary rounded-md shadow-lg border border-color py-1 min-w-[110px] z-50">
                {TIMEFRAMES.map(tf => (
                  <button
                    key={tf.value}
                    onClick={() => {
                      onChange(tf.value);
                      setOpen(false);
                    }}
                    className={`w-full text-left px-2.5 py-1.5 text-[11px] hover:bg-hover transition-colors flex items-center justify-between cursor-pointer ${
                      value === tf.value ? 'text-brand font-semibold' : 'text-primary'
                    }`}
                  >
                    <span>{tf.label}</span>
                    {value === tf.value && <Check className="w-3 h-3 text-brand" />}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
});

// ============================================================================
// Clean Chart Type Dropdown
// ============================================================================
const CHART_TYPES: { value: ChartType; label: string; icon: React.ReactNode }[] = [
  { value: 'candlestick', label: 'Candles', icon: <CandlestickChart className="w-3.5 h-3.5" /> },
  { value: 'line', label: 'Line', icon: <TrendingUp className="w-3.5 h-3.5" /> },
  { value: 'area', label: 'Area', icon: <BarChart3 className="w-3.5 h-3.5" /> },
];

interface ChartTypeDropdownProps {
  value: ChartType;
  open: boolean;
  onToggle: () => void;
  onSelect: (v: ChartType) => void;
}

const ChartTypeDropdown = memo(function ChartTypeDropdown({
  value,
  open,
  onToggle,
  onSelect,
}: ChartTypeDropdownProps) {
  const current = CHART_TYPES.find(c => c.value === value) || CHART_TYPES[0];

  return (
    <div className="relative shrink-0">
      <button
        onClick={onToggle}
        className="flex items-center gap-0.5 px-1.5 py-1 text-[11px] text-secondary hover:text-primary hover:bg-hover/60 rounded transition-colors cursor-pointer"
        title={`Chart Type: ${current.label}`}
      >
        {current.icon}
        <ChevronDown
          className={`w-3 h-3 transition-transform duration-150 ${open ? 'rotate-180' : 'opacity-60'}`}
        />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={onToggle} />
          <div className="absolute top-full left-0 mt-1 bg-secondary rounded-md shadow-lg border border-color py-1 min-w-[120px] z-50">
            {CHART_TYPES.map(ct => (
              <button
                key={ct.value}
                onClick={() => onSelect(ct.value)}
                className={`w-full text-left px-2.5 py-1.5 text-[11px] hover:bg-hover transition-colors flex items-center justify-between cursor-pointer ${
                  value === ct.value ? 'text-brand font-semibold' : 'text-primary'
                }`}
              >
                <div className="flex items-center gap-2">
                  {ct.icon}
                  <span>{ct.label}</span>
                </div>
                {value === ct.value && <Check className="w-3 h-3 text-brand" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
});

// ============================================================================
// Clean Indicator Picker
// ============================================================================
interface IndicatorPickerProps {
  open: boolean;
  onToggle: () => void;
  searchQuery: string;
  onSearchChange: (v: string) => void;
  activeIndicators: ActiveIndicator[];
  onToggleIndicator: (registryId: string, instanceId: string | null) => void;
  isMobile: boolean;
}

const IndicatorPicker = memo(function IndicatorPicker({
  open,
  onToggle,
  searchQuery,
  onSearchChange,
  activeIndicators,
  onToggleIndicator,
  isMobile,
}: IndicatorPickerProps) {
  const sortedIndicators = useMemo(
    () => [...indicatorRegistry].sort((a, b) => a.name.localeCompare(b.name)),
    []
  );
  const filteredIndicators = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return sortedIndicators;
    return sortedIndicators.filter(
      ind =>
        ind.name.toLowerCase().includes(query) ||
        ind.shortName.toLowerCase().includes(query) ||
        (ind.description && ind.description.toLowerCase().includes(query))
    );
  }, [sortedIndicators, searchQuery]);

  return (
    <div className="relative shrink-0">
      <button
        onClick={onToggle}
        className="flex items-center gap-1 px-1.5 py-1 text-[11px] text-secondary hover:text-primary hover:bg-hover/60 rounded transition-colors cursor-pointer"
        title="Technical Indicators"
      >
        <span className="italic font-serif font-bold text-[13px] leading-none">fx</span>
        <span className="hidden 2xl:inline font-medium">Indicators</span>
        {activeIndicators.length > 0 && (
          <span className="px-1.5 py-0.2 rounded-full text-[9px] bg-brand text-white font-bold leading-tight">
            {activeIndicators.length}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40 sm:bg-transparent" onClick={onToggle} />
          <div
            className={`fixed sm:absolute z-50 bg-secondary border border-color shadow-xl overflow-hidden flex flex-col ${
              isMobile
                ? 'inset-x-0 bottom-0 rounded-t-2xl max-h-[70vh]'
                : 'top-full left-0 mt-1 rounded-lg w-[320px] max-h-[380px]'
            }`}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-color shrink-0">
              <span className="text-[11px] font-bold text-primary uppercase tracking-wide">
                Indicators ({filteredIndicators.length})
              </span>
              <button
                onClick={onToggle}
                className="p-1 hover:bg-hover rounded text-secondary hover:text-primary transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Search */}
            <div className="p-2 border-b border-color shrink-0">
              <div className="relative">
                <Search
                  size={14}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted"
                />
                <input
                  type="text"
                  placeholder="Search indicators..."
                  value={searchQuery}
                  onChange={e => onSearchChange(e.target.value)}
                  className="w-full bg-primary text-[11px] border border-color rounded px-2 pl-7 py-1 text-primary placeholder-muted focus:outline-none focus:border-brand"
                  autoFocus
                />
              </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-1 space-y-0.5">
              {filteredIndicators.map(ind => {
                const firstActive = activeIndicators.find(a => a.indicatorId === ind.id);
                const isActive = !!firstActive;
                return (
                  <button
                    key={ind.id}
                    onClick={() => onToggleIndicator(ind.id, firstActive?.instanceId ?? null)}
                    className={`w-full px-2.5 py-1.5 rounded text-left text-[11px] transition-colors flex items-center justify-between group cursor-pointer ${
                      isActive ? 'bg-brand/10 text-brand' : 'hover:bg-hover text-primary'
                    }`}
                  >
                    <div className="flex flex-col truncate pr-2">
                      <span className="truncate font-medium">{ind.name}</span>
                      {ind.description && (
                        <span className="text-[9px] text-muted truncate">{ind.description}</span>
                      )}
                    </div>
                    {isActive && <Check className="w-3 h-3 text-brand shrink-0" />}
                  </button>
                );
              })}

              {filteredIndicators.length === 0 && (
                <div className="text-center py-6 text-[11px] text-muted">No indicators found.</div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
});

// ============================================================================
// Clean Display Settings Dropdown
// ============================================================================
interface SettingsDropdownProps {
  open: boolean;
  onToggle: () => void;
  showVolume: boolean;
  onToggleVolume: () => void;
  showGrid: boolean;
  onToggleGrid: () => void;
  showCrosshair: boolean;
  onToggleCrosshair: () => void;
  priceSource?: 'last' | 'mark';
  onPriceSourceChange?: (v: 'last' | 'mark') => void;
}

const SettingsDropdown = memo(function SettingsDropdown({
  open,
  onToggle,
  showVolume,
  onToggleVolume,
  showGrid,
  onToggleGrid,
  showCrosshair,
  onToggleCrosshair,
  priceSource,
  onPriceSourceChange,
}: SettingsDropdownProps) {
  const renderRow = (label: string, value: boolean, toggleFn: () => void) => (
    <button
      onClick={toggleFn}
      className="w-full px-2.5 py-1.5 hover:bg-hover transition-colors flex items-center justify-between text-[11px] text-primary cursor-pointer"
    >
      <span>{label}</span>
      <div
        className={`w-6 h-3.5 rounded-full transition-colors relative ${value ? 'bg-brand' : 'bg-tertiary'}`}
      >
        <div
          className={`w-2.5 h-2.5 rounded-full bg-white absolute top-0.5 transition-transform ${
            value ? 'translate-x-3' : 'translate-x-0.5'
          }`}
        />
      </div>
    </button>
  );

  return (
    <div className="relative shrink-0">
      <button
        onClick={onToggle}
        className="p-1 text-secondary hover:text-primary hover:bg-hover/60 rounded transition-colors cursor-pointer"
        title="Chart Settings"
      >
        <Settings className="w-3.5 h-3.5" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={onToggle} />
          <div className="absolute top-full left-0 sm:left-auto sm:right-0 mt-1 bg-secondary rounded-md shadow-lg border border-color py-1 min-w-[140px] z-50">
            {onPriceSourceChange && (
              <div className="px-2.5 py-1.5 border-b border-color/40 flex items-center justify-between text-[11px]">
                <span className="text-secondary">Price Source:</span>
                <div className="flex items-center gap-0.5 bg-tertiary/40 rounded p-0.5">
                  <button
                    onClick={() => onPriceSourceChange('last')}
                    className={`px-1.5 py-0.5 text-[10px] font-medium rounded transition-colors cursor-pointer ${
                      priceSource === 'last'
                        ? 'bg-brand text-white font-bold'
                        : 'text-secondary hover:text-primary'
                    }`}
                  >
                    Last
                  </button>
                  <button
                    onClick={() => onPriceSourceChange('mark')}
                    className={`px-1.5 py-0.5 text-[10px] font-medium rounded transition-colors cursor-pointer ${
                      priceSource === 'mark'
                        ? 'bg-brand text-white font-bold'
                        : 'text-secondary hover:text-primary'
                    }`}
                  >
                    Mark
                  </button>
                </div>
              </div>
            )}
            {renderRow('Volume', showVolume, onToggleVolume)}
            {renderRow('Grid Lines', showGrid, onToggleGrid)}
            {renderRow('Crosshair', showCrosshair, onToggleCrosshair)}
          </div>
        </>
      )}
    </div>
  );
});

// ============================================================================
// Clean Price Source Dropdown (Last Price / Mark Price)
// ============================================================================
interface PriceSourceDropdownProps {
  value: 'last' | 'mark';
  onChange: (v: 'last' | 'mark') => void;
}

const PriceSourceDropdown = memo(function PriceSourceDropdown({
  value,
  onChange,
}: PriceSourceDropdownProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative shrink-0">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 px-1.5 py-1 text-[11px] font-medium text-secondary hover:text-primary hover:bg-hover/60 rounded transition-colors cursor-pointer"
        title="Price Reference"
      >
        <span>{value === 'mark' ? 'Mark Price' : 'Last Price'}</span>
        <ChevronDown
          className={`w-3 h-3 transition-transform duration-150 ${open ? 'rotate-180' : 'opacity-60'}`}
        />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1 bg-secondary rounded-md shadow-lg border border-color py-1 min-w-[110px] z-50">
            <button
              onClick={() => {
                onChange('last');
                setOpen(false);
              }}
              className={`w-full text-left px-2.5 py-1.5 text-[11px] hover:bg-hover transition-colors flex items-center justify-between cursor-pointer ${
                value === 'last' ? 'text-brand font-semibold' : 'text-primary'
              }`}
            >
              <span>Last Price</span>
              {value === 'last' && <Check className="w-3 h-3 text-brand" />}
            </button>
            <button
              onClick={() => {
                onChange('mark');
                setOpen(false);
              }}
              className={`w-full text-left px-2.5 py-1.5 text-[11px] hover:bg-hover transition-colors flex items-center justify-between cursor-pointer ${
                value === 'mark' ? 'text-brand font-semibold' : 'text-primary'
              }`}
            >
              <span>Mark Price</span>
              {value === 'mark' && <Check className="w-3 h-3 text-brand" />}
            </button>
          </div>
        </>
      )}
    </div>
  );
});

// ============================================================================
// Main ChartHeader Component
// ============================================================================
export interface ChartHeaderProps {
  timeframe: CandleResolution;
  onTimeframeChange: (v: CandleResolution) => void;
  chartType: ChartType;
  showChartTypeMenu: boolean;
  onToggleChartTypeMenu: () => void;
  onSelectChartType: (v: ChartType) => void;
  showIndicatorMenu: boolean;
  onToggleIndicatorMenu: () => void;
  searchQuery: string;
  onSearchChange: (v: string) => void;
  activeIndicators: ActiveIndicator[];
  onToggleIndicator: (registryId: string, instanceId: string | null) => void;
  showSettingsMenu: boolean;
  onToggleSettingsMenu: () => void;
  showVolume: boolean;
  onToggleVolume: () => void;
  showGrid: boolean;
  onToggleGrid: () => void;
  showCrosshair: boolean;
  onToggleCrosshair: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onDownload: () => void;
  isMobile: boolean;
  activeChartTab?: 'price' | 'depth' | 'details';
  onChartTabChange?: (tab: 'price' | 'depth' | 'details') => void;
  priceSource?: 'last' | 'mark';
  onPriceSourceChange?: (v: 'last' | 'mark') => void;
}

export const ChartHeader = memo(function ChartHeader(props: ChartHeaderProps) {
  const {
    timeframe,
    onTimeframeChange,
    chartType,
    showChartTypeMenu,
    onToggleChartTypeMenu,
    onSelectChartType,
    showIndicatorMenu,
    onToggleIndicatorMenu,
    searchQuery,
    onSearchChange,
    activeIndicators,
    onToggleIndicator,
    showSettingsMenu,
    onToggleSettingsMenu,
    showVolume,
    onToggleVolume,
    showGrid,
    onToggleGrid,
    showCrosshair,
    onToggleCrosshair,
    isFullscreen,
    onToggleFullscreen,
    isMobile,
    activeChartTab,
    onChartTabChange,
    priceSource = 'last',
    onPriceSourceChange,
  } = props;

  return (
    <div className="relative z-30 bg-secondary shrink-0 h-9 flex items-center justify-between px-2 select-none">
      <div className="flex items-center gap-1 min-w-0">
        <TimeframeSelector value={timeframe} onChange={onTimeframeChange} />

        <div className="w-px h-3 bg-color opacity-40 mx-0.5 shrink-0" />

        <ChartTypeDropdown
          value={chartType}
          open={showChartTypeMenu}
          onToggle={onToggleChartTypeMenu}
          onSelect={onSelectChartType}
        />

        <div className="w-px h-3 bg-color opacity-40 mx-0.5 shrink-0" />

        <IndicatorPicker
          open={showIndicatorMenu}
          onToggle={onToggleIndicatorMenu}
          searchQuery={searchQuery}
          onSearchChange={onSearchChange}
          activeIndicators={activeIndicators}
          onToggleIndicator={onToggleIndicator}
          isMobile={isMobile}
        />

        <div className="w-px h-3 bg-color opacity-40 mx-0.5 shrink-0" />

        <SettingsDropdown
          open={showSettingsMenu}
          onToggle={onToggleSettingsMenu}
          showVolume={showVolume}
          onToggleVolume={onToggleVolume}
          showGrid={showGrid}
          onToggleGrid={onToggleGrid}
          showCrosshair={showCrosshair}
          onToggleCrosshair={onToggleCrosshair}
          priceSource={priceSource}
          onPriceSourceChange={onPriceSourceChange}
        />

        {!isMobile && onPriceSourceChange && (
          <div className="hidden 2xl:flex items-center">
            <div className="w-px h-3 bg-color opacity-40 mx-0.5 shrink-0" />
            <PriceSourceDropdown value={priceSource} onChange={onPriceSourceChange} />
          </div>
        )}
      </div>
      <div className="flex items-center gap-1 sm:gap-1.5 shrink-0 ml-auto pl-2">
        {activeChartTab && onChartTabChange && (
          <div className="flex items-center gap-1.5 sm:gap-2 mr-1 sm:mr-2 text-[11px]">
            <button
              onClick={() => onChartTabChange('price')}
              className={`px-1 py-0.5 rounded transition-colors cursor-pointer ${
                activeChartTab === 'price'
                  ? 'text-brand font-semibold'
                  : 'text-secondary hover:text-primary'
              }`}
            >
              Chart
            </button>
            <button
              onClick={() => onChartTabChange('depth')}
              className={`px-1 py-0.5 rounded transition-colors cursor-pointer ${
                activeChartTab === 'depth'
                  ? 'text-brand font-semibold'
                  : 'text-secondary hover:text-primary'
              }`}
            >
              Depth
            </button>
            <button
              onClick={() => onChartTabChange('details')}
              className={`px-1 py-0.5 rounded transition-colors cursor-pointer ${
                activeChartTab === 'details'
                  ? 'text-brand font-semibold'
                  : 'text-secondary hover:text-primary'
              }`}
            >
              Details
            </button>
          </div>
        )}

        {activeChartTab && onChartTabChange && (
          <div className="w-px h-3 bg-color opacity-40 mx-0.5" />
        )}

        <button
          onClick={onToggleFullscreen}
          className="p-1 text-secondary hover:text-primary hover:bg-hover/60 rounded transition-colors flex cursor-pointer"
          title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
        >
          {isFullscreen ? (
            isMobile ? (
              <X className="w-3.5 h-3.5" />
            ) : (
              <Minimize2 className="w-3.5 h-3.5" />
            )
          ) : (
            <Maximize2 className="w-3.5 h-3.5" />
          )}
        </button>
      </div>
    </div>
  );
});
