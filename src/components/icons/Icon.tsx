import React from 'react';
import Svg, { Circle, G, Line, Path, Rect, type SvgProps } from 'react-native-svg';
import { text as textColor } from '@/theme/tokens';

/**
 * Nucleo-shaped icon set.
 *
 * Nucleo's UI library is commercially licensed, so its SVGs cannot be vendored
 * here. These are drawn to the same construction rules so the set is visually
 * interchangeable and can be swapped one-for-one once a licence is in hand:
 *
 *   - 24x24 viewBox, 2px live-area margin
 *   - 1.5 stroke, round cap, round join, no fills
 *   - strokes on the half-pixel grid so they stay crisp at 1x
 *   - geometry built from circles and 90/45-degree runs; no loose curves
 *
 * To adopt the real set, replace a `case` body with the licensed path data and
 * leave the wrapper alone - it already supplies stroke, colour, and sizing.
 */

export type IconName =
  | 'radar'
  | 'wink'
  | 'chat'
  | 'chat-dots'
  | 'person'
  | 'search'
  | 'sliders'
  | 'phone'
  | 'eye-off'
  | 'block'
  | 'flag'
  | 'chevron-right'
  | 'chevron-left'
  | 'chevron-down'
  | 'arrow-right'
  | 'arrow-left'
  | 'close'
  | 'check'
  | 'plus'
  | 'pin'
  | 'broadcast'
  | 'shield'
  | 'shield-check'
  | 'lock'
  | 'key'
  | 'wallet'
  | 'link'
  | 'bolt'
  | 'clock'
  | 'user-x'
  | 'sad'
  | 'percent'
  | 'eighteen'
  | 'dots'
  | 'paperclip'
  | 'smiley'
  | 'copy'
  | 'external'
  | 'refresh'
  | 'fingerprint'
  | 'verified'
  | 'cube';

export type IconProps = {
  name: IconName;
  size?: number;
  color?: string;
  /** Nucleo UI ships at 1.5. Drop to 1.25 for icons above ~32px. */
  strokeWidth?: number;
} & Omit<SvgProps, 'width' | 'height' | 'color'>;

export function Icon({
  name,
  size = 22,
  color = textColor.secondary,
  strokeWidth = 1.5,
  ...rest
}: IconProps) {
  const s = {
    stroke: color,
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" {...rest}>
      <G {...s}>{glyph(name, color, strokeWidth)}</G>
    </Svg>
  );
}

function glyph(name: IconName, color: string, sw: number): React.ReactNode {
  switch (name) {
    case 'radar':
      return (
        <>
          <Circle cx={12} cy={12} r={8.25} />
          <Circle cx={12} cy={12} r={2.75} fill={color} stroke="none" />
          <Line x1={12} y1={1.5} x2={12} y2={4.5} />
          <Line x1={12} y1={19.5} x2={12} y2={22.5} />
          <Line x1={1.5} y1={12} x2={4.5} y2={12} />
          <Line x1={19.5} y1={12} x2={22.5} y2={12} />
        </>
      );

    case 'wink':
      // The raised hand from the comps' second tab.
      return (
        <>
          <Path d="M8.5 11V4.75a1.5 1.5 0 013 0V10" />
          <Path d="M11.5 10V3.75a1.5 1.5 0 013 0V10" />
          <Path d="M14.5 10.5V5.75a1.5 1.5 0 013 0v7.5" />
          <Path d="M8.5 11l-2.1 2.1a2 2 0 000 2.83l2.9 2.9A5.5 5.5 0 0013.2 21h.8a3.5 3.5 0 003.5-3.5v-4.25" />
        </>
      );

    case 'chat':
      return <Path d="M12 3.75c-4.83 0-8.75 3.19-8.75 7.13 0 2.2 1.22 4.16 3.14 5.47l-.9 3.66a.4.4 0 00.6.44l3.6-2.1c.75.17 1.53.26 2.31.26 4.83 0 8.75-3.19 8.75-7.73S16.83 3.75 12 3.75z" />;

    case 'chat-dots':
      return (
        <>
          <Path d="M12 3.75c-4.83 0-8.75 3.19-8.75 7.13 0 2.2 1.22 4.16 3.14 5.47l-.9 3.66a.4.4 0 00.6.44l3.6-2.1c.75.17 1.53.26 2.31.26 4.83 0 8.75-3.19 8.75-7.73S16.83 3.75 12 3.75z" />
          <Circle cx={8.5} cy={11} r={0.85} fill={color} stroke="none" />
          <Circle cx={12} cy={11} r={0.85} fill={color} stroke="none" />
          <Circle cx={15.5} cy={11} r={0.85} fill={color} stroke="none" />
        </>
      );

    case 'person':
      return (
        <>
          <Circle cx={12} cy={7.75} r={3.75} />
          <Path d="M4.25 20.25c0-3.73 3.47-6.25 7.75-6.25s7.75 2.52 7.75 6.25" />
        </>
      );

    case 'user-x':
      return (
        <>
          <Circle cx={10} cy={7.75} r={3.75} />
          <Path d="M2.75 20.25c0-3.73 3.25-6.25 7.25-6.25 1.1 0 2.15.19 3.09.54" />
          <Line x1={16.5} y1={15.5} x2={21.5} y2={20.5} />
          <Line x1={21.5} y1={15.5} x2={16.5} y2={20.5} />
        </>
      );

    case 'search':
      return (
        <>
          <Circle cx={10.75} cy={10.75} r={7} />
          <Line x1={15.75} y1={15.75} x2={20.75} y2={20.75} />
        </>
      );

    case 'sliders':
      return (
        <>
          <Line x1={3.5} y1={7.5} x2={20.5} y2={7.5} />
          <Line x1={3.5} y1={16.5} x2={20.5} y2={16.5} />
          <Circle cx={9} cy={7.5} r={2.5} fill="none" />
          <Circle cx={15} cy={16.5} r={2.5} fill="none" />
        </>
      );

    case 'phone':
      return <Path d="M8.1 4.25H5.6A2.1 2.1 0 003.5 6.4c0 7.79 6.31 14.1 14.1 14.1a2.1 2.1 0 002.1-2.1v-2.5a.9.9 0 00-.72-.88l-3.5-.7a.9.9 0 00-.94.44l-.86 1.5a12.2 12.2 0 01-5.04-5.04l1.5-.86a.9.9 0 00.44-.94l-.7-3.5a.9.9 0 00-.88-.72z" />;

    case 'eye-off':
      return (
        <>
          <Path d="M9.4 5.1A9.6 9.6 0 0112 4.75c4.6 0 7.9 3.36 9.05 6.11a.4.4 0 010 .28 12.4 12.4 0 01-2.4 3.5" />
          <Path d="M15.9 15.9A9.6 9.6 0 0112 16.75c-4.6 0-7.9-3.36-9.05-6.11a.4.4 0 010-.28A12.4 12.4 0 016.1 6.1" />
          <Path d="M9.88 9.88a3 3 0 004.24 4.24" />
          <Line x1={3.5} y1={3.5} x2={20.5} y2={20.5} />
        </>
      );

    case 'block':
      return (
        <>
          <Circle cx={12} cy={12} r={8.25} />
          <Line x1={9} y1={9} x2={15} y2={15} />
          <Line x1={15} y1={9} x2={9} y2={15} />
        </>
      );

    case 'flag':
      return (
        <>
          <Line x1={5.25} y1={3.5} x2={5.25} y2={20.5} />
          <Path d="M5.25 4.75h11.4a.4.4 0 01.32.65l-2.42 3.1a.4.4 0 000 .5l2.42 3.1a.4.4 0 01-.32.65H5.25" />
        </>
      );

    case 'chevron-right':
      return <Path d="M9.5 5.5l6 6.5-6 6.5" />;
    case 'chevron-left':
      return <Path d="M14.5 5.5l-6 6.5 6 6.5" />;
    case 'chevron-down':
      return <Path d="M5.5 9.5l6.5 6 6.5-6" />;

    case 'arrow-right':
      return (
        <>
          <Line x1={3.75} y1={12} x2={19.5} y2={12} />
          <Path d="M13.5 6l6 6-6 6" />
        </>
      );
    case 'arrow-left':
      return (
        <>
          <Line x1={20.25} y1={12} x2={4.5} y2={12} />
          <Path d="M10.5 6l-6 6 6 6" />
        </>
      );

    case 'close':
      return (
        <>
          <Line x1={5.5} y1={5.5} x2={18.5} y2={18.5} />
          <Line x1={18.5} y1={5.5} x2={5.5} y2={18.5} />
        </>
      );

    case 'check':
      return <Path d="M4.75 12.5l4.5 4.5 10-10.5" />;

    case 'plus':
      return (
        <>
          <Line x1={12} y1={4.75} x2={12} y2={19.25} />
          <Line x1={4.75} y1={12} x2={19.25} y2={12} />
        </>
      );

    case 'pin':
      return (
        <>
          <Path d="M12 21.25s7-5.9 7-11.25a7 7 0 10-14 0c0 5.35 7 11.25 7 11.25z" />
          <Circle cx={12} cy={10} r={2.5} />
        </>
      );

    case 'broadcast':
      return (
        <>
          <Circle cx={12} cy={12} r={2.25} fill={color} stroke="none" />
          <Path d="M8.2 8.2a5.4 5.4 0 000 7.6" />
          <Path d="M15.8 8.2a5.4 5.4 0 010 7.6" />
          <Path d="M5.4 5.4a9.3 9.3 0 000 13.2" />
          <Path d="M18.6 5.4a9.3 9.3 0 010 13.2" />
        </>
      );

    case 'shield':
      return <Path d="M12 3.25l7 2.6v5.9c0 4.2-2.9 7.9-7 9-4.1-1.1-7-4.8-7-9v-5.9z" />;

    case 'shield-check':
      return (
        <>
          <Path d="M12 3.25l7 2.6v5.9c0 4.2-2.9 7.9-7 9-4.1-1.1-7-4.8-7-9v-5.9z" />
          <Path d="M8.75 11.75l2.25 2.25 4.25-4.75" />
        </>
      );

    case 'lock':
      return (
        <>
          <Rect x={4.75} y={10.25} width={14.5} height={10} rx={2.5} />
          <Path d="M8.25 10.25V7.5a3.75 3.75 0 017.5 0v2.75" />
          <Circle cx={12} cy={15.25} r={1.15} fill={color} stroke="none" />
        </>
      );

    case 'key':
      return (
        <>
          <Circle cx={8.25} cy={15.75} r={4} />
          <Path d="M11.1 12.9l8.15-8.15" />
          <Path d="M16.5 7.5l2 2" />
          <Path d="M14.2 9.8l2 2" />
        </>
      );

    case 'wallet':
      return (
        <>
          <Rect x={3.25} y={5.75} width={17.5} height={13} rx={3} />
          <Path d="M3.25 9.75h17.5" />
          <Circle cx={16.5} cy={14.25} r={1.15} fill={color} stroke="none" />
        </>
      );

    case 'link':
      return (
        <>
          <Path d="M10 14a4 4 0 015.66 0l2.84-2.84a4 4 0 10-5.66-5.66L10.5 8.2" />
          <Path d="M14 10a4 4 0 01-5.66 0L5.5 12.84a4 4 0 105.66 5.66L13.5 15.8" />
        </>
      );

    case 'bolt':
      return <Path d="M13.25 2.75L5.5 13.25h5.25l-.5 8 7.75-10.5H12.75z" />;

    case 'clock':
      return (
        <>
          <Circle cx={12} cy={12} r={8.25} />
          <Path d="M12 7.25V12l3.25 2" />
        </>
      );

    case 'sad':
      return (
        <>
          <Circle cx={12} cy={12} r={8.25} />
          <Path d="M8.5 16a4.5 4.5 0 017 0" />
          <Circle cx={9.25} cy={9.75} r={0.9} fill={color} stroke="none" />
          <Circle cx={14.75} cy={9.75} r={0.9} fill={color} stroke="none" />
        </>
      );

    case 'percent':
      return (
        <>
          <Circle cx={12} cy={12} r={8.25} />
          <Line x1={9} y1={15} x2={15} y2={9} />
          <Circle cx={9.5} cy={9.5} r={1.1} />
          <Circle cx={14.5} cy={14.5} r={1.1} />
        </>
      );

    case 'eighteen':
      return (
        <>
          <Circle cx={12} cy={12} r={8.25} />
          <Path d="M9.5 9.25l-1.25.9V15" />
          <Path d="M8.25 15h2.5" />
          <Circle cx={14.75} cy={10.6} r={1.55} />
          <Circle cx={14.75} cy={13.9} r={1.9} />
        </>
      );

    case 'dots':
      return (
        <>
          <Circle cx={5.5} cy={12} r={1.35} fill={color} stroke="none" />
          <Circle cx={12} cy={12} r={1.35} fill={color} stroke="none" />
          <Circle cx={18.5} cy={12} r={1.35} fill={color} stroke="none" />
        </>
      );

    case 'paperclip':
      return <Path d="M19 11.5l-7.6 7.6a4.6 4.6 0 01-6.5-6.5l8.1-8.1a3.1 3.1 0 014.38 4.38l-8.1 8.1a1.6 1.6 0 01-2.26-2.26l7.2-7.2" />;

    case 'smiley':
      return (
        <>
          <Circle cx={12} cy={12} r={8.25} />
          <Path d="M8.5 14a4.5 4.5 0 007 0" />
          <Circle cx={9.25} cy={9.75} r={0.9} fill={color} stroke="none" />
          <Circle cx={14.75} cy={9.75} r={0.9} fill={color} stroke="none" />
        </>
      );

    case 'copy':
      return (
        <>
          <Rect x={8.75} y={8.75} width={11.5} height={11.5} rx={2.5} />
          <Path d="M15.25 5.75a2 2 0 00-2-2H6.25a2.5 2.5 0 00-2.5 2.5v7a2 2 0 002 2" />
        </>
      );

    case 'external':
      return (
        <>
          <Path d="M14 4.75h5.25V10" />
          <Line x1={19.25} y1={4.75} x2={11.5} y2={12.5} />
          <Path d="M18.25 14v4.25a2 2 0 01-2 2H5.75a2 2 0 01-2-2V7.75a2 2 0 012-2H10" />
        </>
      );

    case 'refresh':
      return (
        <>
          <Path d="M20 12a8 8 0 11-2.5-5.8" />
          <Path d="M20.25 4v4.25H16" />
        </>
      );

    case 'fingerprint':
      return (
        <>
          <Path d="M5.5 10a7 7 0 0113 0" />
          <Path d="M8.25 10.5a3.75 3.75 0 017.5 0c0 3.2-.6 6.2-1.75 8.75" />
          <Path d="M11.25 10.5a.75.75 0 011.5 0c0 3.6-.8 7-2.25 10" />
          <Path d="M6.5 13.5a19 19 0 01-.5 4.25" />
        </>
      );

    /**
     * The verification seal.
     *
     * The only solid glyph in an otherwise stroked set, and deliberately so: a
     * seal is a stamp, not a diagram, and the scalloped rosette is the shape
     * people already read as *verified* without being told. Drawn as one path
     * with the tick as a second, closed subpath knocked out under evenodd, so
     * it stays crisp at 12px where a stroked rosette turns to mush.
     */
    case 'verified':
      return (
        <Path
          d="M12 3.45 Q15.04.65 16.27 4.6 Q20.31 3.69 19.4 7.72 Q23.35 8.96 20.55 12 Q23.35 15.04 19.4 16.27 Q20.31 20.31 16.27 19.4 Q15.04 23.35 12 20.55 Q8.96 23.35 7.73 19.4 Q3.69 20.31 4.6 16.28 Q.65 15.04 3.45 12 Q.65 8.96 4.6 7.72 Q3.69 3.69 7.72 4.6 Q8.96.65 12 3.45Z M10.85 15.44 L7.82 12.41 L9.21 11.02 L10.85 12.66 L14.79 8.72 L16.18 10.11 Z"
          fill={color}
          fillRule="evenodd"
          clipRule="evenodd"
          stroke="none"
        />
      );

    case 'cube':
      return (
        <>
          <Path d="M12 3.25l7.5 4.25v9L12 20.75 4.5 16.5v-9z" />
          <Path d="M4.5 7.5L12 11.75 19.5 7.5" />
          <Line x1={12} y1={11.75} x2={12} y2={20.75} />
        </>
      );

    default:
      return <Circle cx={12} cy={12} r={8.25} strokeWidth={sw} />;
  }
}
