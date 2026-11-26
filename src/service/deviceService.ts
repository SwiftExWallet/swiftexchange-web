import { API_CONFIG, getValidDeviceToken, setDeviceToken } from './apiConfig';
import { ensureWalletLinkedToDevice } from './apiService';

export interface DeviceRegistrationPayload {
  brand: string;
  model: string;
  type: string;
  uniqueId: string;
  macAddress: string;
  fcmToken: string;
}

export interface DeviceRegistrationResponse {
  deviceToken: any;
  success: boolean;
  message?: string;
  token?: string;
  data?: {
    token?: string;
    deviceToken?: string;
    [key: string]: any;
  };
}

let inflightDeviceRegistration: Promise<string | null> | null = null;

/** Checks whether WalletConnect peer metadata belongs to SwiftEx. */
export function isSwiftExPeer(peerMeta?: { name?: string; url?: string } | null): boolean {
  if (!peerMeta) return false;
  const name = typeof peerMeta.name === 'string' ? peerMeta.name.toLowerCase() : '';
  const url = typeof peerMeta.url === 'string' ? peerMeta.url.toLowerCase() : '';
  return name.includes('swiftex') || url.includes('swiftexchange.io');
}

/** Validates that a peer metadata `userDevice` payload has the required device identifiers. */
export function isValidDevicePayload(payload: unknown): payload is DeviceRegistrationPayload {
  if (!payload || typeof payload !== 'object') return false;
  const p = payload as Record<string, unknown>;
  return (
    typeof p.uniqueId === 'string' &&
    p.uniqueId.trim() !== '' &&
    typeof p.fcmToken === 'string' &&
    p.fcmToken.trim() !== ''
  );
}

export async function registerDevice(
  payload: DeviceRegistrationPayload
): Promise<DeviceRegistrationResponse> {
  const url = `${API_CONFIG.serverUrl}/device`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Device registration failed: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Resolves a valid device token for SwiftEx sessions (reusing a cached token or
 * registering the device once) and links the connected wallet address to it.
 * Returns `null` when SwiftEx device metadata is absent or registration fails so
 * callers can fall back to standard SIWE/Stellar signature auth.
 */
export async function ensureSwiftExDeviceAuth(
  peerMeta?: { name?: string; url?: string; userDevice?: unknown } | null,
  walletAddress?: string
): Promise<string | null> {
  const storedToken = getValidDeviceToken();
  if (storedToken) {
    ensureWalletLinkedToDevice(walletAddress, storedToken).catch(() => {});
    return storedToken;
  }

  if (!isSwiftExPeer(peerMeta)) {
    return null;
  }

  const rawUserDevice = peerMeta?.userDevice as Record<string, unknown> | undefined;
  const hasUniqueId =
    rawUserDevice &&
    typeof rawUserDevice === 'object' &&
    typeof rawUserDevice.uniqueId === 'string' &&
    rawUserDevice.uniqueId.trim() !== '';

  if (!isValidDevicePayload(rawUserDevice) && !hasUniqueId) {
    console.warn(
      '[deviceService] SwiftEx peer connected without valid userDevice metadata; falling back to signature auth.',
      {
        hasUserDevice: Boolean(rawUserDevice),
      }
    );
    return null;
  }

  if (!inflightDeviceRegistration) {
    const devicePayload = rawUserDevice as unknown as DeviceRegistrationPayload;
    inflightDeviceRegistration = registerDevice(devicePayload)
      .then(res => {
        const token = res.token || res.data?.token || res.deviceToken || res.data?.deviceToken;
        if (typeof token === 'string' && token.trim() !== '') {
          setDeviceToken(token);
          return token;
        }
        console.warn(
          '[deviceService] /device response did not include a deviceToken; falling back to signature auth.'
        );
        return null;
      })
      .catch(err => {
        console.warn(
          '[deviceService] /device registration failed; falling back to signature auth:',
          err
        );
        return null;
      })
      .finally(() => {
        inflightDeviceRegistration = null;
      });
  }

  const token = await inflightDeviceRegistration;
  if (token) {
    ensureWalletLinkedToDevice(walletAddress, token).catch(() => {});
  }
  return token;
}
