import { create } from 'zustand';

import { type GeolocationData, fetchGeolocation } from '../utils/geolocationUtils';

interface GeolocationState {
  location: GeolocationData | null;
  isLoading: boolean;
  isError: boolean;
  fetchedAt: number | null;
  fetchLocation: () => Promise<void>;
  reset: () => void;
}

const TTL_MS = 15 * 60 * 1000;

export const useGeolocationStore = create<GeolocationState>((set, get) => ({
  location: null,
  isLoading: false,
  isError: false,
  fetchedAt: null,
  fetchLocation: async () => {
    const { isLoading, fetchedAt, location } = get();
    if (isLoading) return;
    // 15 min cache on success, 60s cooldown on failure so error states never loop
    const cooldownMs = location ? TTL_MS : 60 * 1000;
    if (fetchedAt && Date.now() - fetchedAt < cooldownMs) return;

    set({ isLoading: true, isError: false });
    try {
      const data = await fetchGeolocation();
      set({ location: data, isLoading: false, isError: false, fetchedAt: Date.now() });
    } catch (err) {
      console.warn('[geolocationStore] Failed to fetch geolocation:', err);
      // Set fetchedAt to Date.now() to ensure failure cooldown is strictly enforced
      set({ location: null, isLoading: false, isError: true, fetchedAt: Date.now() });
    }
  },
  reset: () => set({ location: null, isLoading: false, isError: false, fetchedAt: null }),
}));
