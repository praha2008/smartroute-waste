import * as Location from 'expo-location';
import { useEffect, useRef } from 'react';

import { api } from './core/api';

const SEND_EVERY_MS = 15000;

/** While `active` is true, send the truck's GPS position to the server every ~15 s. */
export function useLiveTracking(active: boolean) {
  const lastSent = useRef(0);
  useEffect(() => {
    if (!active) return;
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted' || cancelled) return;
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 5000, distanceInterval: 20 },
        (pos) => {
          const now = Date.now();
          if (now - lastSent.current < SEND_EVERY_MS) return;
          lastSent.current = now;
          api.post('/collector/location', { lat: pos.coords.latitude, lng: pos.coords.longitude }).catch(() => {});
        },
      );
      if (cancelled) sub.remove();
    })();
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [active]);
}
