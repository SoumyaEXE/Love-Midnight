import { useEffect, useRef, useState } from 'react';
import { haversineMeters } from '@/firebase/geo';
import { watchNearby } from '@/services/discoveryService';
import type { NearbyUser } from '@/firebase/types';
import { useFirebase } from '@/state/firebase';
import { useHalo } from '@/state/store';

/**
 * The people currently inside the user's chosen radius.
 *
 * The subscription is rebuilt when the radius changes, and when the user has
 * moved far enough that the geohash ranges no longer cover where they are. It
 * is deliberately *not* rebuilt on every fix: tearing down four to nine indexed
 * queries and opening four to nine more, every time the GPS twitches by six
 * metres, would cost more than the feature.
 *
 * `RECENTER_FRACTION` of the radius is the threshold. At 5 km that is 1 km of
 * movement before the query is re-cut, which is well inside the slack the
 * bounding box already carries over the circle.
 */

const RECENTER_FRACTION = 0.2;

export type NearbyState = {
  users: NearbyUser[];
  /** True until the first result set arrives, or while there is no fix yet. */
  loading: boolean;
  error: string | null;
  /** False when discovery cannot run: no wallet, no fix, sharing off. */
  active: boolean;
};

export function useNearbyUsers(): NearbyState {
  const { discovery, wallet: walletState, visibility } = useHalo();
  const { here, owned } = useFirebase();

  const [users, setUsers] = useState<NearbyUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const address = walletState.status === 'connected' ? walletState.address ?? null : null;
  const active = Boolean(address && owned && visibility.live && here);

  // The centre the current subscription was cut for, held in a ref so that a
  // fix which does not move it far enough does not re-render anything.
  const anchor = useRef<{ latitude: number; longitude: number } | null>(null);
  const [center, setCenter] = useState<{ latitude: number; longitude: number } | null>(null);

  useEffect(() => {
    if (!here) return;

    const moved = anchor.current ? haversineMeters(anchor.current, here) : Infinity;
    if (moved < discovery.radius * RECENTER_FRACTION) return;

    anchor.current = { latitude: here.latitude, longitude: here.longitude };
    setCenter(anchor.current);
  }, [here, discovery.radius]);

  useEffect(() => {
    if (!address || !owned || !visibility.live || !center) {
      setUsers([]);
      setLoading(!center);
      return;
    }

    setLoading(true);
    setError(null);

    const watch = watchNearby({
      self: address,
      center,
      radius: discovery.radius,
      handlers: {
        onResults: (results) => {
          setUsers(results);
          setLoading(false);
        },
        onError: (cause) => {
          setError(
            cause.message.includes('permission')
              ? 'Discovery is not permitted with the current database rules.'
              : 'Could not load people nearby.',
          );
          setLoading(false);
        },
      },
    });

    return () => watch.stop();
  }, [address, owned, visibility.live, center, discovery.radius]);

  return { users, loading, error, active };
}
