export interface AlertAssetSnapshot {
  asset: string;
  crossWalletBalance: string;
  price: string;
  discount: string;
}

export interface AlertPositionSnapshot {
  symbol: string;
  positionAmt: string;
  entryPrice: string;
  markPrice: string;
  maintMargin: string;
  marginType: 'cross' | 'isolated';
  isolatedWallet?: string;
}

export interface AlertAccountSnapshot {
  assets: AlertAssetSnapshot[];
  positions: AlertPositionSnapshot[];
  muted?: string[];
}

export interface SnapshotPayload {
  fcmToken: string;
  wallet: string;
  platform?: 'web';
  snapshotAt: number;
  account: AlertAccountSnapshot;
}

export interface SnapshotSuccessResponse {
  ok: boolean;
}

export interface SnapshotErrorResponse {
  error: string;
}

export interface DeleteDevicePayload {
  fcmToken: string;
}

export interface HealthResponse {
  ok: boolean;
  priceAgeMs?: number;
  symbols?: number;
  devices?: number;
  tickAgeMs?: number;
  lastTickMs?: number;
  pushesSent?: number;
  pushesSuppressed?: number;
  reconnects?: number;
  error?: string;
}

export interface AlertSettings {
  enabled: boolean;
  mutedKeys: string[];
}
