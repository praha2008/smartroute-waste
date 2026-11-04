import { useCallback, useEffect, useRef, useState } from 'react';

import { api } from './api';
import { useIsFocused } from './nav';

/**
 * Load data from the API. Re-loads whenever the screen comes into focus and,
 * if `pollMs` is given, keeps polling while the screen is visible.
 */
export function useApi<T>(path: string | null, pollMs?: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const focused = useIsFocused();
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const load = useCallback(
    async (manual = false) => {
      if (!path) return;
      if (manual) setRefreshing(true);
      try {
        const d = await api.get<T>(path);
        if (alive.current) {
          setData(d);
          setError(null);
        }
      } catch (e: any) {
        if (alive.current) setError(e.message);
      } finally {
        if (alive.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [path],
  );

  // load on first show, whenever the screen comes back into focus, and when `path` changes
  useEffect(() => {
    if (focused) load();
  }, [focused, load]);

  useEffect(() => {
    if (!pollMs || !focused) return;
    const t = setInterval(() => load(), pollMs);
    return () => clearInterval(t);
  }, [pollMs, focused, load]);

  return { data, error, loading, refreshing, reload: () => load(true), setData };
}
