import { useEffect } from 'react';

import { useAppAvailabilityStore } from '../../../store/appAvailabilityStore';
import { useGeolocationStore } from '../../../store/geolocationStore';
import { isLocationRestricted } from '../../../utils/geolocationUtils';

export const useGeolocationGuard = (restrictedLocations: string[]) => {
  const { location, isLoading: isGeoLoading, isError, fetchLocation } = useGeolocationStore();
  const { availability, isLoading: isAppLoading, fetchAvailability } = useAppAvailabilityStore();

  useEffect(() => {
    if (!location && !isGeoLoading) {
      fetchLocation();
    }
    if (!availability && !isAppLoading) {
      fetchAvailability();
    }
  }, [location, isGeoLoading, fetchLocation, availability, isAppLoading, fetchAvailability]);

  // Backend /app-available isRestricted flag takes precedence if true
  const isBackendRestricted = availability?.isRestricted === true;
  const isClientRestricted = isLocationRestricted(location, restrictedLocations);

  const isRestricted = isBackendRestricted || isClientRestricted;

  return {
    isRestricted,
    location,
    isLoading: isGeoLoading || isAppLoading,
    error: isError,
    availability,
  };
};
