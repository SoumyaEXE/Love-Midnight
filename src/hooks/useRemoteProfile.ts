import { useEffect, useState } from 'react';
import { onValue, ref } from 'firebase/database';
import { database } from '@/firebase/config';
import { paths } from '@/firebase/paths';
import type { RemoteProfile } from '@/firebase/types';

/**
 * One person's published card.
 *
 * A subscription rather than a fetch, so a name or avatar edited on the other
 * device lands in an open conversation without anyone reloading anything.
 */
export function useRemoteProfile(wallet: string | null): {
  profile: RemoteProfile | null;
  loading: boolean;
} {
  const [profile, setProfile] = useState<RemoteProfile | null>(null);
  const [loading, setLoading] = useState(Boolean(wallet));

  useEffect(() => {
    if (!wallet) {
      setProfile(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    return onValue(
      ref(database, paths.profile(wallet)),
      (snapshot) => {
        setProfile((snapshot.val() as RemoteProfile | null) ?? null);
        setLoading(false);
      },
      () => setLoading(false),
    );
  }, [wallet]);

  return { profile, loading };
}
