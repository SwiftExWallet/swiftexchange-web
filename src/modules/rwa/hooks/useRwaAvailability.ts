import { useEffect, useMemo } from 'react';

import { useAppAvailabilityStore } from '@/store/appAvailabilityStore';
import { useGeolocationStore } from '@/store/geolocationStore';

import { RWA_ENABLED } from '../config/rwaConfig';
import { RWA_ASSETS } from '../data/assets';
import { normalizeCountry, visibleAssets } from '../utils/regions';

export const useRwaAvailability = () => {
  const {
    location,
    isLoading: isGeoLoading,
    isError: isGeoError,
    fetchLocation,
  } = useGeolocationStore();
  const {
    availability,
    isLoading: isAppLoading,
    isError: isAppError,
    fetchAvailability,
  } = useAppAvailabilityStore();

  useEffect(() => {
    if (!RWA_ENABLED) return;
    if (!location && !isGeoLoading && !isGeoError) {
      fetchLocation();
    }
    if (!availability && !isAppLoading && !isAppError) {
      fetchAvailability();
    }
  }, [
    location,
    isGeoLoading,
    isGeoError,
    fetchLocation,
    availability,
    isAppLoading,
    isAppError,
    fetchAvailability,
  ]);

  const country = useMemo(() => {
    const cc = (availability as any)?.countryCode || location?.countryCode || '';
    return normalizeCountry(cc);
  }, [availability, location]);

  const checked =
    !RWA_ENABLED ||
    (!isGeoLoading && !isAppLoading && (Boolean(country) || isGeoError || isAppError));

  const assets = useMemo(() => (RWA_ENABLED ? visibleAssets(RWA_ASSETS, country) : []), [country]);

  const rwaVisible = RWA_ENABLED && Boolean(country) && assets.length > 0;

  return {
    rwaVisible,
    checked,
    country,
    assets,
  };
};
