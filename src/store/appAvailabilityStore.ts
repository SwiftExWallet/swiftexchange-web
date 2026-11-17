import { create } from 'zustand';

import { fetchAppAvailability } from '../service/apiService';
import type {
  AppAvailabilityResponse,
  ServiceStatusItem,
  ServiceStatusType,
} from '../types/availability';

interface AppAvailabilityState {
  availability: AppAvailabilityResponse | null;
  isLoading: boolean;
  isError: boolean;
  error: string | null;
  lastChecked: number | null;

  // Actions
  fetchAvailability: (force?: boolean) => Promise<AppAvailabilityResponse | null>;
  reset: () => void;

  // Helpers
  getOverallStatus: () => ServiceStatusType;
  getService: (serviceId: string) => ServiceStatusItem | undefined;
  isServiceAvailable: (serviceId: string) => boolean;
}

const CACHE_TTL_MS = 60 * 1000; // 1 minute cache

export const useAppAvailabilityStore = create<AppAvailabilityState>((set, get) => ({
  availability: null,
  isLoading: false,
  isError: false,
  error: null,
  lastChecked: null,

  fetchAvailability: async (force = false) => {
    const { isLoading, lastChecked, availability } = get();

    if (isLoading) return availability;
    if (!force && availability && lastChecked && Date.now() - lastChecked < CACHE_TTL_MS) {
      return availability;
    }

    set({ isLoading: true, isError: false, error: null });

    try {
      const data = await fetchAppAvailability();
      set({
        availability: data,
        isLoading: false,
        isError: false,
        error: null,
        lastChecked: Date.now(),
      });
      return data;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to fetch service availability';
      console.warn('[appAvailabilityStore] Error fetching availability:', errorMsg);
      set({
        isLoading: false,
        isError: true,
        error: errorMsg,
        lastChecked: Date.now(),
      });
      return null;
    }
  },

  reset: () =>
    set({
      availability: null,
      isLoading: false,
      isError: false,
      error: null,
      lastChecked: null,
    }),

  getOverallStatus: (): ServiceStatusType => {
    const services = get().availability?.services;
    if (!services || services.length === 0) return 'operational';

    const statuses = services.map(s => (s.status || '').toLowerCase());

    if (statuses.some(s => s === 'down')) return 'down';
    if (statuses.some(s => s === 'degraded')) return 'degraded';
    if (statuses.some(s => s === 'maintenance')) return 'maintenance';

    return 'operational';
  },

  getService: (serviceId: string) => {
    return get().availability?.services?.find(s => s.id?.toLowerCase() === serviceId.toLowerCase());
  },

  isServiceAvailable: (serviceId: string) => {
    const service = get().getService(serviceId);
    if (!service) return true; // default to available if not explicitly flagged
    const status = (service.status || '').toLowerCase();
    return status !== 'down' && status !== 'maintenance';
  },
}));
