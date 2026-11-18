import type { ReactNode } from 'react';

export type CandleResolution =
  | '1MIN'
  | '3MINS'
  | '5MINS'
  | '15MINS'
  | '30MINS'
  | '1HOUR'
  | '2HOURS'
  | '4HOURS'
  | '8HOURS'
  | '12HOURS'
  | '1DAY'
  | '3DAYS'
  | '1WEEK'
  | '1MONTH'
  | string;

export type ChartType = 'candlestick' | 'line' | 'area';

export interface CandleBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface LegendData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  change: number;
  changePct: number;
  [key: string]: any;
}

export interface ActiveIndicator {
  instanceId: string;
  indicatorId: string;
  inputs: Record<string, any>;
  color: string;
  visible?: boolean;
}

export interface ThemeColors {
  background: string;
  textColor: string;
  gridColor: string;
  borderColor: string;
  upColor: string;
  downColor: string;
  volumeColor: string;
  crosshairColor: string;
}

export interface DrawingToolItem {
  id: string;
  label: string;
  icon: ReactNode;
}

export interface ToolSection {
  header: string;
  tools: DrawingToolItem[];
}

export interface ToolCategory {
  id: string;
  label: string;
  icon: ReactNode;
  sections: ToolSection[];
}

export interface ChartSettings {
  timeframe: CandleResolution;
  chartType: ChartType;
  showVolume: boolean;
  showGrid: boolean;
  showCrosshair: boolean;
  isLogScale: boolean;
  activeIndicators: ActiveIndicator[];
}
