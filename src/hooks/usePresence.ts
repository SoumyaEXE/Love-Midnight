import { useEffect, useState } from 'react';
import type { RemotePresence } from '@/firebase/types';
import { formatLastSeen, watchPresence } from '@/services/presenceService';

/**
 * One person's online state.
 *
 * The user's *own* presence is published by `FirebaseProvider`, not here - this
 * is the read side, used by any screen that wants to draw somebody else's dot.
 */
export function usePresence(wallet: string | null): {
  presence: RemotePresence;
  label: string;
} {
  const [presence, setPresence] = useState<RemotePresence>({ online: false, lastSeen: 0 });

  useEffect(() => {
    if (!wallet) {
      setPresence({ online: false, lastSeen: 0 });
      return;
    }
    return watchPresence(wallet, setPresence);
  }, [wallet]);

  return { presence, label: formatLastSeen(presence) };
}
