import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Segmented, TextField, ToggleRow } from '@/components/ui/Field';
import { Divider } from '@/components/ui/primitives';
import { Icon } from '@/components/icons/Icon';
import { alpha, palette, radius as radii, space } from '@/theme/tokens';
import { fontFamily, type } from '@/theme/typography';
import { DIMENSIONS, SENSITIVE_BY_DEFAULT, type Dimension } from '@/ai/matching';
import {
  GENDER_LABEL,
  GENDERS,
  SHOWABLE,
  SHOWABLE_COPY,
  problems,
  type HaloProfile,
} from '@/state/profile';

/**
 * The profile form, in three sections.
 *
 * Split rather than one long page because they are three different questions:
 * who you are, what you like, and who gets to see it. Onboarding walks them in
 * order; the editor shows all three at once. Both use these same components, so
 * there is one implementation of "what a Halo profile is" rather than two that
 * drift.
 */

// -----------------------------------------------------------------------------
// About
// -----------------------------------------------------------------------------

export function AboutSection({
  profile,
  onChange,
  showErrors = false,
}: {
  profile: HaloProfile;
  onChange: (next: Partial<HaloProfile>) => void;
  showErrors?: boolean;
}) {
  const found = showErrors ? problems(profile) : {};

  return (
    <View>
      <TextField
        label="Name"
        value={profile.name}
        onChangeText={(name) => onChange({ name })}
        placeholder="What people call you"
        autoCapitalize="words"
        autoComplete="name"
        maxLength={32}
        returnKeyType="next"
        error={found.name}
      />

      <TextField
        label="Age"
        value={profile.age === null ? '' : String(profile.age)}
        onChangeText={(text) => {
          const digits = text.replace(/[^0-9]/g, '').slice(0, 3);
          onChange({ age: digits.length ? Number(digits) : null });
        }}
        placeholder="18"
        keyboardType="number-pad"
        maxLength={3}
        error={found.age}
        // Said here rather than in a policy: the number is entered, but the
        // number is not what gets published.
        hint="Committed on device. Peers see the 18+ proof, not the figure — unless you show it below."
      />

      <Segmented
        label="Gender"
        options={GENDERS.map((g) => ({ value: g, label: GENDER_LABEL[g] }))}
        value={profile.gender}
        onChange={(gender) => onChange({ gender })}
      />

      <TextField
        label="Bio"
        value={profile.bio}
        onChangeText={(bio) => onChange({ bio })}
        placeholder="What you are into, in a sentence or two."
        maxLength={280}
        tall
        hint={`${profile.bio.length}/280 · your words are what the matcher reads`}
      />
    </View>
  );
}

// -----------------------------------------------------------------------------
// Interests
// -----------------------------------------------------------------------------

/**
 * Suggested tags.
 *
 * Every one of these is a literal keyword the vectoriser recognises, grouped
 * under the dimension it feeds. That is not a coincidence to be tidied up
 * later - a suggestion chip that the model cannot read would be a decoration
 * that silently does nothing to your matches.
 */
const SUGGESTED: { dimension: Dimension; tags: string[] }[] = [
  { dimension: 'outdoors', tags: ['hiking', 'camping', 'climbing', 'walks'] },
  { dimension: 'food', tags: ['coffee', 'cooking', 'restaurants', 'baking', 'wine'] },
  { dimension: 'music', tags: ['music', 'concerts', 'vinyl', 'festival', 'guitar'] },
  { dimension: 'film', tags: ['films', 'cinema', 'documentary'] },
  { dimension: 'reading', tags: ['reading', 'books', 'poetry'] },
  { dimension: 'travel', tags: ['travel', 'backpacking', 'countries'] },
  { dimension: 'fitness', tags: ['gym', 'running', 'yoga', 'cycling', 'swimming'] },
  { dimension: 'art', tags: ['art', 'galleries', 'photography', 'design'] },
  { dimension: 'gaming', tags: ['gaming', 'board games', 'chess'] },
  { dimension: 'tech', tags: ['tech', 'coding', 'startup', 'ai'] },
  { dimension: 'nightlife', tags: ['bars', 'dancing', 'nightlife'] },
  { dimension: 'family', tags: ['family', 'dog', 'cat', 'home'] },
  { dimension: 'politics', tags: ['politics', 'activism', 'organising'] },
  { dimension: 'spirituality', tags: ['meditation', 'mindfulness', 'faith'] },
  { dimension: 'health', tags: ['vegetarian', 'vegan', 'sober', 'wellness'] },
  { dimension: 'career', tags: ['career', 'founder', 'ambitious'] },
];

const MAX_TAGS = 12;

export function InterestsSection({
  profile,
  onChange,
  showErrors = false,
}: {
  profile: HaloProfile;
  onChange: (next: Partial<HaloProfile>) => void;
  showErrors?: boolean;
}) {
  const [draft, setDraft] = useState('');
  const chosen = useMemo(() => new Set(profile.interests), [profile.interests]);
  const found = showErrors ? problems(profile) : {};

  const toggle = useCallback(
    (tag: string) => {
      void Haptics.selectionAsync();
      const next = chosen.has(tag)
        ? profile.interests.filter((t) => t !== tag)
        : profile.interests.length >= MAX_TAGS
          ? profile.interests
          : [...profile.interests, tag];
      onChange({ interests: next });
    },
    [chosen, profile.interests, onChange],
  );

  const addDraft = useCallback(() => {
    const tag = draft.trim().toLowerCase();
    if (!tag || chosen.has(tag) || profile.interests.length >= MAX_TAGS) {
      setDraft('');
      return;
    }
    void Haptics.selectionAsync();
    onChange({ interests: [...profile.interests, tag] });
    setDraft('');
  }, [draft, chosen, profile.interests, onChange]);

  return (
    <View>
      <View style={styles.tagHead}>
        <Text style={[type.caption, styles.tagCount]}>
          {profile.interests.length} of {MAX_TAGS} chosen
        </Text>
        {found.interests ? (
          <Text style={[type.caption, styles.tagError]}>{found.interests}</Text>
        ) : null}
      </View>

      {SUGGESTED.map((group) => (
        <View key={group.dimension} style={styles.group}>
          <Text style={[type.micro, styles.groupLabel]}>{group.dimension.toUpperCase()}</Text>
          <View style={styles.tags}>
            {group.tags.map((tag) => {
              const on = chosen.has(tag);
              return (
                <Pressable
                  key={tag}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={tag}
                  onPress={() => toggle(tag)}
                  style={[styles.tag, on && styles.tagOn]}
                >
                  <Text style={[type.caption, styles.tagLabel, on && styles.tagLabelOn]}>
                    {tag}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}

      {/* Anything the suggestions missed. Free text still runs through the
          vectoriser, so an unrecognised word is stored and shown but scores
          nothing - which is honest, and better than pretending otherwise. */}
      <View style={styles.custom}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={addDraft}
          placeholder="Add your own"
          placeholderTextColor={alpha.t28}
          autoCapitalize="none"
          maxLength={24}
          returnKeyType="done"
          style={styles.customInput}
          accessibilityLabel="Add a custom interest"
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add interest"
          onPress={addDraft}
          style={styles.customAdd}
        >
          <Icon name="plus" size={18} color={palette.white} />
        </Pressable>
      </View>

      {profile.interests.length ? (
        <View style={styles.chosen}>
          {profile.interests.map((tag) => (
            <Pressable
              key={tag}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${tag}`}
              onPress={() => toggle(tag)}
              style={[styles.tag, styles.tagOn]}
            >
              <Text style={[type.caption, styles.tagLabelOn]}>{tag}</Text>
              <Icon name="close" size={12} color={alpha.t72} style={styles.tagClose} />
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

// -----------------------------------------------------------------------------
// What you show
// -----------------------------------------------------------------------------

export function DisclosureSection({
  profile,
  onChange,
  mask,
  onToggleDimension,
}: {
  profile: HaloProfile;
  onChange: (next: Partial<HaloProfile>) => void;
  /** Per-dimension consent, index-aligned with DIMENSIONS. */
  mask: number[];
  onToggleDimension: (dimension: Dimension) => void;
}) {
  return (
    <View>
      <Text style={[type.micro, styles.groupLabel]}>ON YOUR CARD</Text>
      <View style={styles.rows}>
        <View style={styles.always}>
          <Text style={type.body}>Name</Text>
          <Text style={[type.caption, styles.alwaysNote]}>Always shown</Text>
        </View>
        {SHOWABLE.map((field) => (
          <ToggleRow
            key={field}
            title={SHOWABLE_COPY[field].title}
            on={profile.show[field]}
            onLabel={SHOWABLE_COPY[field].on}
            offLabel={SHOWABLE_COPY[field].off}
            onChange={(next) => onChange({ show: { ...profile.show, [field]: next } })}
          />
        ))}
      </View>

      <Divider style={styles.divider} />

      <Text style={[type.micro, styles.groupLabel]}>WHAT THE MATCHER MAY SCORE</Text>
      <Text style={[type.caption, styles.dimBlurb]}>
        A closed dimension is not hidden from the card — it is removed from the arithmetic on
        both sides, so it cannot influence a score anyone proves. The sensitive three are closed
        until you open them.
      </Text>
      <View style={styles.rows}>
        {DIMENSIONS.map((dimension, index) => {
          const sensitive = SENSITIVE_BY_DEFAULT.includes(dimension);
          return (
            <ToggleRow
              key={dimension}
              title={dimension[0].toUpperCase() + dimension.slice(1)}
              on={!!mask[index]}
              onLabel={sensitive ? 'Open — you chose to include this' : 'Scored'}
              offLabel={sensitive ? 'Closed by default' : 'Closed — scored as zero'}
              onChange={() => onToggleDimension(dimension)}
            />
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tagHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.lg,
  },
  tagCount: { color: alpha.t56 },
  tagError: { color: palette.negative },

  group: { marginBottom: space.lg },
  groupLabel: { letterSpacing: 1.3, color: alpha.t38, marginBottom: space.sm },

  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 32,
    paddingHorizontal: 13,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: alpha.t10,
  },
  tagOn: {
    backgroundColor: 'rgba(168,85,247,0.20)',
    borderColor: 'rgba(216,180,254,0.45)',
  },
  tagLabel: { color: alpha.t56 },
  tagLabelOn: { color: palette.white },
  tagClose: { marginLeft: 6 },

  custom: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.sm },
  customInput: {
    flex: 1,
    height: 44,
    paddingHorizontal: space.lg,
    borderRadius: radii.md,
    backgroundColor: 'rgba(0,0,0,0.32)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: alpha.t10,
    color: palette.white,
    fontFamily: fontFamily.light,
    fontSize: 15,
  },
  customAdd: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(168,85,247,0.22)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(216,180,254,0.4)',
  },
  chosen: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: space.lg },

  rows: { marginTop: space.xs },
  always: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  alwaysNote: { color: alpha.t38 },
  divider: { marginVertical: space.xl },
  dimBlurb: { marginBottom: space.sm, lineHeight: 18 },
});
