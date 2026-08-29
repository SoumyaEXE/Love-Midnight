/**
 * Halo design tokens.
 *
 * The palette is lifted from the reference comps: a near-black substrate lit
 * from below by a single vivid violet bloom. Everything else is either that
 * violet at a lower energy, or white at a low alpha. There are no other hues.
 */

export const palette = {
  /** Substrate. Not pure black - pure black kills the bloom's falloff. */
  void: '#07060A',
  voidLift: '#0C0A11',

  /** Card / surface stack, all sitting on `void`. */
  surface: '#131019',
  surfaceRaised: '#1A1620',
  surfaceSunken: '#0F0C14',

  /** The violet. `core` is the CTA fill, `bloom` is the light source. */
  violet: '#A855F7',
  violetDeep: '#7C22CE',
  violetCore: '#C026D3',
  bloom: '#B026FF',
  bloomSoft: '#8B1FD4',

  white: '#FFFFFF',

  /** Status. Used sparingly - accept/decline, presence dots. */
  positive: '#34D399',
  negative: '#FB6B6B',
} as const;

/** White at fixed alphas. Used for text, hairlines, and glass fills. */
export const alpha = {
  t04: 'rgba(255,255,255,0.04)',
  t06: 'rgba(255,255,255,0.06)',
  t08: 'rgba(255,255,255,0.08)',
  t10: 'rgba(255,255,255,0.10)',
  t14: 'rgba(255,255,255,0.14)',
  t20: 'rgba(255,255,255,0.20)',
  t28: 'rgba(255,255,255,0.28)',
  t38: 'rgba(255,255,255,0.38)',
  t56: 'rgba(255,255,255,0.56)',
  t72: 'rgba(255,255,255,0.72)',
  t90: 'rgba(255,255,255,0.90)',
} as const;

export const text = {
  primary: palette.white,
  secondary: alpha.t56,
  tertiary: alpha.t38,
  quaternary: alpha.t28,
  onViolet: palette.white,
  onLight: '#0B0910',
} as const;

export const border = {
  hairline: alpha.t08,
  hairlineStrong: alpha.t14,
  /** Top-edge specular used on metal + glass. */
  specular: 'rgba(255,255,255,0.22)',
} as const;

/** 4pt base. Screens breathe at 20 - matches the comps' gutter. */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 40,
  '5xl': 56,
} as const;

export const radius = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  '2xl': 30,
  card: 22,
  sheet: 34,
  /** Pills. Large enough that RN clamps it to a true capsule. */
  pill: 999,
} as const;

/**
 * Shadow recipes. iOS reads all four keys; Android only reads `elevation`,
 * so every recipe carries one that approximates the same visual weight.
 */
export const shadow = {
  /** Violet bloom under a primary CTA. */
  glow: {
    shadowColor: palette.bloom,
    shadowOpacity: 0.55,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 8 },
    elevation: 14,
  },
  glowSoft: {
    shadowColor: palette.bloom,
    shadowOpacity: 0.32,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  /** Contact shadow that separates metal from the substrate. */
  lift: {
    shadowColor: '#000000',
    shadowOpacity: 0.6,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  card: {
    shadowColor: '#000000',
    shadowOpacity: 0.45,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
  },
} as const;

/**
 * Gradient stops for the brushed-metal button faces.
 * Light enters from the top, so stop 0 is always the brightest.
 */
export const metal = {
  /** Default resting face. */
  face: ['#3A3442', '#241F2C', '#17131D'] as const,
  faceLocations: [0, 0.55, 1] as const,
  /** Pressed: the whole face darkens and the highlight retreats. */
  facePressed: ['#2B2633', '#1B1723', '#120F17'] as const,
  /** Violet CTA face. */
  violet: ['#D243E8', '#A62BE0', '#7B1FC7'] as const,
  violetPressed: ['#B735C7', '#8C22BC', '#661AA6'] as const,
  /** The rare white CTA ("Send report" in the comps). */
  light: ['#FFFFFF', '#F0ECF4', '#DAD3E2'] as const,
  lightPressed: ['#EDE9F1', '#DCD6E3', '#C4BCCE'] as const,
} as const;

/** Motion. Short, slightly overshooting - the Apple button feel. */
export const motion = {
  press: { damping: 26, stiffness: 420, mass: 0.7 },
  spring: { damping: 20, stiffness: 220, mass: 0.9 },
  gentle: { damping: 24, stiffness: 130, mass: 1 },
  pressScale: 0.965,
} as const;

export const layout = {
  gutter: space.xl,
  /** Height reserved for the floating tab bar + its bottom inset. */
  tabBarHeight: 68,
  tabBarInset: 14,
} as const;
