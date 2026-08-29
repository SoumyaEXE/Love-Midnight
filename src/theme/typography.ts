import { StyleSheet, type TextStyle } from 'react-native';
import { text } from './tokens';

/**
 * Geist, the Vercel typeface. The comps live in the thin end of the ramp -
 * display copy sits at 200/300 and only badges and CTAs reach 500. Nothing
 * here is monospaced; numerals get `tabular-nums` via fontVariant instead so
 * counters and timestamps stop jittering without switching family.
 */
export const fontFamily = {
  thin: 'Geist_100Thin',
  extraLight: 'Geist_200ExtraLight',
  light: 'Geist_300Light',
  regular: 'Geist_400Regular',
  medium: 'Geist_500Medium',
  semiBold: 'Geist_600SemiBold',
} as const;

export type FontWeightName = keyof typeof fontFamily;

const tabular: TextStyle = { fontVariant: ['tabular-nums'] };

/**
 * Negative tracking on the large sizes is what makes Geist read as Vercel
 * rather than as generic grotesque. It scales with size, so it is baked per
 * step rather than applied globally.
 */
export const type = StyleSheet.create({
  /** 40/44 - onboarding hero only. */
  display: {
    fontFamily: fontFamily.thin,
    fontSize: 40,
    lineHeight: 44,
    letterSpacing: -1.4,
    color: text.primary,
  },
  /** 30/34 - profile names, sheet heroes. */
  title1: {
    fontFamily: fontFamily.extraLight,
    fontSize: 30,
    lineHeight: 34,
    letterSpacing: -0.9,
    color: text.primary,
  },
  /** 24/28 - screen headers ("Winkers", "Chat"). */
  title2: {
    fontFamily: fontFamily.light,
    fontSize: 24,
    lineHeight: 28,
    letterSpacing: -0.6,
    color: text.primary,
  },
  /** 19/24 - sheet titles, section heroes. */
  title3: {
    fontFamily: fontFamily.regular,
    fontSize: 19,
    lineHeight: 24,
    letterSpacing: -0.4,
    color: text.primary,
  },
  /** 16/21 - list row primary. */
  body: {
    fontFamily: fontFamily.regular,
    fontSize: 16,
    lineHeight: 21,
    letterSpacing: -0.2,
    color: text.primary,
  },
  bodyLight: {
    fontFamily: fontFamily.light,
    fontSize: 16,
    lineHeight: 22,
    letterSpacing: -0.2,
    color: text.secondary,
  },
  /** 14/19 - list row secondary, most supporting copy. */
  callout: {
    fontFamily: fontFamily.light,
    fontSize: 14,
    lineHeight: 19,
    letterSpacing: -0.1,
    color: text.secondary,
  },
  calloutStrong: {
    fontFamily: fontFamily.medium,
    fontSize: 14,
    lineHeight: 19,
    letterSpacing: -0.1,
    color: text.primary,
  },
  /** 13/17 - captions, timestamps, chip labels. */
  caption: {
    fontFamily: fontFamily.light,
    fontSize: 13,
    lineHeight: 17,
    color: text.tertiary,
  },
  captionStrong: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    lineHeight: 17,
    color: text.primary,
  },
  /** 11/14 - badge counters, proof hashes, meta labels. */
  micro: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.1,
    color: text.tertiary,
  },
  /** All-caps section eyebrow. Tracking opens up to stay legible. */
  eyebrow: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    color: text.tertiary,
  },
  /** Button label. Never lighter than 500 - thin text on a lit face smears. */
  button: {
    fontFamily: fontFamily.medium,
    fontSize: 15,
    lineHeight: 20,
    letterSpacing: -0.1,
    color: text.primary,
  },
  buttonSmall: {
    fontFamily: fontFamily.medium,
    fontSize: 14,
    lineHeight: 18,
    letterSpacing: -0.1,
    color: text.primary,
  },
  /**
   * Proof digests, wallet addresses, tx signatures. Geist Regular with open
   * tracking and tabular figures - reads as machine output without pulling a
   * mono family into the bundle.
   */
  digest: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.6,
    color: text.secondary,
    ...tabular,
  },
  numeric: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 18,
    letterSpacing: -0.1,
    color: text.primary,
    ...tabular,
  },
  /**
   * The figure in a stat cell. Light rather than medium: at 22px a medium
   * weight competes with the card title above it, and the number should read as
   * a reading taken off an instrument, not as a heading.
   */
  statValue: {
    fontFamily: fontFamily.light,
    fontSize: 22,
    lineHeight: 26,
    letterSpacing: -0.6,
    color: text.primary,
    ...tabular,
  },
});

/** Font map handed to `useFonts` in the root layout. */
export const fontAssets = {
  Geist_100Thin: require('@expo-google-fonts/geist/100Thin/Geist_100Thin.ttf'),
  Geist_200ExtraLight: require('@expo-google-fonts/geist/200ExtraLight/Geist_200ExtraLight.ttf'),
  Geist_300Light: require('@expo-google-fonts/geist/300Light/Geist_300Light.ttf'),
  Geist_400Regular: require('@expo-google-fonts/geist/400Regular/Geist_400Regular.ttf'),
  Geist_500Medium: require('@expo-google-fonts/geist/500Medium/Geist_500Medium.ttf'),
  Geist_600SemiBold: require('@expo-google-fonts/geist/600SemiBold/Geist_600SemiBold.ttf'),
};
