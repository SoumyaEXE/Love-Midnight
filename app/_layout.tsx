import '@/polyfills';

import React, { useCallback, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { fontAssets } from '@/theme/typography';
import { palette } from '@/theme/tokens';
import { HaloProvider } from '@/state/store';
import { FirebaseProvider } from '@/state/firebase';
import { primeGravatars } from '@/data/gravatar';
import { ALL_EMAILS } from '@/data/people';

// Held until fonts and avatar digests are both ready. Geist Thin at 40pt is
// unmistakable when it swaps in late, so paying a few hundred ms here is
// cheaper than shipping a visible reflow on the first screen.
void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(fontAssets);

  useEffect(() => {
    // Warms the SHA-256 cache behind every Gravatar URL so list rows paint with
    // an image on first render rather than a skeleton. Fire-and-forget: a row
    // that misses the cache falls back to its own async lookup.
    void primeGravatars(ALL_EMAILS);
  }, []);

  const onReady = useCallback(() => {
    if (fontsLoaded || fontError) void SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);

  // A missing font should degrade to the system face, not hang on the splash.
  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <HaloProvider>
          {/* Inside HaloProvider, deliberately: the realtime session reads the
              wallet, the profile and the verification flag from it rather than
              keeping a second copy of any of them. */}
          <FirebaseProvider>
            <View style={styles.root} onLayout={onReady}>
              <StatusBar style="light" />
              <Stack
                screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: palette.void },
                  animation: 'fade_from_bottom',
                  animationDuration: 220,
                }}
              >
                <Stack.Screen name="index" />
                <Stack.Screen name="onboarding" />
                <Stack.Screen name="(tabs)" />
                <Stack.Screen
                  name="person/[id]"
                  options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
                />
                <Stack.Screen name="chat/[id]" options={{ animation: 'slide_from_right' }} />
                <Stack.Screen
                  name="proof/[id]"
                  options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
                />
                <Stack.Screen name="privacy" options={{ animation: 'slide_from_right' }} />
                <Stack.Screen name="profile-edit" options={{ animation: 'slide_from_right' }} />
              </Stack>
            </View>
          </FirebaseProvider>
        </HaloProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: palette.void,
  },
});
