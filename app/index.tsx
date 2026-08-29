import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Redirect } from 'expo-router';
import { palette } from '@/theme/tokens';
import { hasOnboarded } from '@/state/onboarding';

/**
 * Entry gate. Renders a flat substrate while the flag is read, so the first
 * painted frame is the destination rather than a flash of onboarding.
 */
export default function Index() {
  const [onboarded, setOnboarded] = useState<boolean | null>(null);

  useEffect(() => {
    hasOnboarded().then(setOnboarded);
  }, []);

  if (onboarded === null) return <View style={styles.root} />;
  return <Redirect href={onboarded ? '/(tabs)' : '/onboarding'} />;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.void },
});
