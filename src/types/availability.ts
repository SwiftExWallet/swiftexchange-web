export type ServiceStatusType = 'operational' | 'degraded' | 'maintenance' | 'down';

export interface ServiceStatusItem {
  id: string;
  name: string;
  status: ServiceStatusType | string;
  message: string;
  updatedAt: string;
}

export interface PlatformAppVersion {
  latestVersion: string;
  minimumSupportedVersion: string;
}

export interface AppVersionData {
  android?: PlatformAppVersion;
  ios?: PlatformAppVersion;
}

export interface AppAvailabilityResponse {
  countryCode: string | null;
  countryName: string | null;
  isRestricted: boolean;
  services: ServiceStatusItem[];
  appVersion: AppVersionData;
}
