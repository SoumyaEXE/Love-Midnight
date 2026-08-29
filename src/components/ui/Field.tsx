import React from 'react';
import {
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { alpha, palette, radius as radii, space } from '@/theme/tokens';
import { fontFamily, type } from '@/theme/typography';

/**
 * Form controls.
 *
 * The app had none until now: every screen before this one displayed state
 * rather than collecting it. These follow the same rule as the rest of the
 * surfaces - a sunken well for anything the user types into, a raised face for
 * anything they press - so an input reads as a hole in the panel rather than
 * as another card sitting on it.
 *
 * Errors are shown under the field they belong to and never as an alert. A
 * form that pops a dialog to say "name is required" has thrown away the one
 * piece of information the user needs: which field.
 */

export type FieldProps = {
  label: string;
  error?: string;
  hint?: string;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function Field({ label, error, hint, children, style }: FieldProps) {
  return (
    <View style={[styles.field, style]}>
      <Text style={[type.caption, styles.label]}>{label}</Text>
      {children}
      {error ? (
        <Text style={[type.caption, styles.error]}>{error}</Text>
      ) : hint ? (
        <Text style={[type.caption, styles.hint]}>{hint}</Text>
      ) : null}
    </View>
  );
}

export type TextFieldProps = FieldProps & TextInputProps & { tall?: boolean };

export function TextField({
  label,
  error,
  hint,
  tall = false,
  style,
  ...input
}: TextFieldProps) {
  return (
    <Field label={label} error={error} hint={hint} style={style}>
      <TextInput
        placeholderTextColor={alpha.t28}
        {...input}
        style={[styles.input, tall && styles.inputTall, !!error && styles.inputError]}
        multiline={tall}
        textAlignVertical={tall ? 'top' : 'center'}
      />
    </Field>
  );
}

/**
 * Segmented picker. Used where the options are few, mutually exclusive, and
 * worth reading at a glance - gender, in practice. A dropdown for four options
 * hides three of them behind a tap for no benefit.
 */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  error,
  hint,
  style,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (next: T) => void;
  error?: string;
  hint?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Field label={label} error={error} hint={hint} style={style}>
      <View style={styles.segments}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={option.label}
              onPress={() => {
                void Haptics.selectionAsync();
                onChange(option.value);
              }}
              style={[styles.segment, selected && styles.segmentOn]}
            >
              <Text
                style={[
                  type.caption,
                  styles.segmentLabel,
                  selected && styles.segmentLabelOn,
                ]}
                numberOfLines={1}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </Field>
  );
}

/**
 * A single disclosure decision.
 *
 * The subtitle is optional and, when given, changes with the switch rather than
 * describing the setting in the abstract - so the row states what is true right
 * now instead of what the toggle is called. Omit both labels where the title
 * already says it: six rows each carrying a line of explanation is a wall of
 * text, and the reader stops at the third one.
 */
export function ToggleRow({
  title,
  on,
  onLabel,
  offLabel,
  onChange,
  style,
}: {
  title: string;
  on: boolean;
  onLabel?: string;
  offLabel?: string;
  onChange: (next: boolean) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const sub = on ? onLabel : offLabel;
  return (
    <View style={[styles.toggle, style]}>
      <View style={styles.toggleText}>
        <Text style={type.body}>{title}</Text>
        {sub ? <Text style={[type.caption, styles.toggleSub]}>{sub}</Text> : null}
      </View>
      <Switch
        value={on}
        onValueChange={(next) => {
          void Haptics.selectionAsync();
          onChange(next);
        }}
        trackColor={{ false: 'rgba(255,255,255,0.12)', true: palette.violetDeep }}
        thumbColor={on ? palette.violet : '#8A8296'}
        ios_backgroundColor="rgba(255,255,255,0.12)"
        accessibilityLabel={title}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: space.lg },
  label: { marginBottom: space.sm, color: alpha.t56 },
  hint: { marginTop: 6, color: alpha.t38 },
  error: { marginTop: 6, color: palette.negative },

  input: {
    minHeight: 48,
    paddingHorizontal: space.lg,
    paddingVertical: 12,
    borderRadius: radii.md,
    // Sunken: darker than the panel it sits in, so it reads as a well.
    backgroundColor: 'rgba(0,0,0,0.32)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: alpha.t10,
    color: palette.white,
    fontFamily: fontFamily.light,
    fontSize: 15.5,
  },
  inputTall: { minHeight: 104, paddingTop: 14 },
  inputError: { borderColor: 'rgba(251,107,107,0.5)' },

  segments: { flexDirection: 'row', gap: 6 },
  segment: {
    flex: 1,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderRadius: radii.sm,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: alpha.t10,
  },
  segmentOn: {
    backgroundColor: 'rgba(168,85,247,0.20)',
    borderColor: 'rgba(216,180,254,0.45)',
  },
  segmentLabel: { color: alpha.t56 },
  segmentLabelOn: { color: palette.white },

  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  toggleText: { flex: 1, marginRight: space.md },
  toggleSub: { marginTop: 2 },
});
