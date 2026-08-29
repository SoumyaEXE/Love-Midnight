import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Onboarding completion flag.
 *
 * Lives outside the route tree because expo-router treats every named export
 * from a route file as route metadata; a stray helper there produces confusing
 * warnings at build time.
 */

const KEY = 'halo.onboarded';

export async function hasOnboarded(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(KEY)) === 'true';
  } catch {
    return false;
  }
}

export async function markOnboarded(): Promise<void> {
  await AsyncStorage.setItem(KEY, 'true');
}
