import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Segmented, TextField, ToggleRow } from '@/components/ui/Field';
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
 * The profile form, in five small sections.
 *
 * Deliberately five rather than three. The earlier split - about / interests /
 * disclosure - matched how the data is *organised*, not how it is answered: the
 * "about" card carried four controls and the disclosure card carried
 * twenty-two, so a step could run past two screen-heights and the button that
 * ends it sat somewhere below the fold. A form you have to scroll to submit
 * reads as a chore no matter how good the controls are.
 *
 * So each section is now one decision, sized to fit above the fold with its
 * button:
 *
 *   IdentitySection   name, age, gender
 *   BioSection        one paragraph
 *   InterestsSection  one category at a time, not all sixteen stacked
 *   CardSection       what appears on your card
 *   ScoringSection    what the matcher may score
 *
 * Copy is kept to labels. The explanation of *why* Halo asks belongs on the
 * step around the form, once, not repeated as a hint under every field.
 */

// -----------------------------------------------------------------------------
// Identity
// -----------------------------------------------------------------------------

export function IdentitySection({
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
      {/* Paired on one row because they are both short answers, and stacking
          two 48px wells with their labels costs a third of the card for no
          gain in legibility. */}
      <View style={styles.row}>
        <TextField
          label="Name"
          value={profile.name}
          onChangeText={(name) => onChange({ name })}
          placeholder="Your name"
          autoCapitalize="words"
          autoComplete="name"
          maxLength={32}
          returnKeyType="next"
          error={found.name}
          style={styles.rowGrow}
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
          style={styles.rowAge}
        />
      </View>

      <Segmented
        label="Gender"
        options={GENDERS.map((g) => ({ value: g, label: GENDER_LABEL[g] }))}
        value={profile.gender}
        onChange={(gender) => onChange({ gender })}
        style={styles.last}
      />
    </View>
  );
}

// -----------------------------------------------------------------------------
// Bio
// -----------------------------------------------------------------------------

export function BioSection({
  profile,
  onChange,
}: {
  profile: HaloProfile;
  onChange: (next: Partial<HaloProfile>) => void;
}) {
  return (
    <TextField
      label="Bio"
      value={profile.bio}
      onChangeText={(bio) => onChange({ bio })}
      placeholder="A sentence or two."
      maxLength={280}
      tall
      hint={profile.bio.length + '/280'}
      style={styles.last}
    />
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

/**
 * One category at a time.
 *
 * Sixteen groups stacked was roughly 1,400px of chips - the user scrolled past
 * fourteen categories they did not care about to reach the two they did. A rail
 * turns that into a horizontal flick, and a dot on each category that has picks
 * means nothing chosen ever becomes invisible just because the rail moved on.
 */
export function InterestsSection({
  profile,
  onChange,
  showErrors = false,
}: {
  profile: HaloProfile;
  onChange: (next: Partial<HaloProfile>) => void;
  showErrors?: boolean;
}) {
  const [active, setActive] = useState<Dimension>(SUGGESTED[0].dimension);
  const [draft, setDraft] = useState('');
  const chosen = useMemo(() => new Set(profile.interests), [profile.interests]);
  const found = showErrors ? problems(profile) : {};
  const full = profile.interests.length >= MAX_TAGS;

  const counts = useMemo(() => {
    const map: Partial<Record<Dimension, number>> = {};
    for (const group of SUGGESTED) {
      map[group.dimension] = group.tags.filter((t) => chosen.has(t)).length;
    }
    return map;
  }, [chosen]);

  const group = SUGGESTED.find((g) => g.dimension === active) ?? SUGGESTED[0];

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
          {profile.interests.length} / {MAX_TAGS}
        </Text>
        {found.interests ? (
          <Text style={[type.caption, styles.tagError]}>{found.interests}</Text>
        ) : full ? (
          <Text style={[type.caption, styles.tagCount]}>Full</Text>
        ) : null}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.rail}
        style={styles.railClip}
      >
        {SUGGESTED.map((g) => {
          const on = g.dimension === active;
          const count = counts[g.dimension] ?? 0;
          return (
            <Pressable
              key={g.dimension}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={g.dimension}
              onPress={() => {
                void Haptics.selectionAsync();
                setActive(g.dimension);
              }}
              style={[styles.railItem, on && styles.railItemOn]}
            >
              <Text style={[type.caption, styles.railLabel, on && styles.railLabelOn]}>
                {g.dimension}
              </Text>
              {count ? <View style={styles.railDot} /> : null}
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.tags}>
        {group.tags.map((tag) => {
          const on = chosen.has(tag);
          return (
            <Pressable
              key={tag}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on, disabled: !on && full }}
              accessibilityLabel={tag}
              onPress={() => toggle(tag)}
              style={[styles.tag, on && styles.tagOn, !on && full && styles.tagMuted]}
            >
              <Text style={[type.caption, styles.tagLabel, on && styles.tagLabelOn]}>{tag}</Text>
            </Pressable>
          );
        })}
      </View>

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
              accessibilityLabel={'Remove ' + tag}
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
// What appears on your card
// -----------------------------------------------------------------------------

export function CardSection({
  profile,
  onChange,
}: {
  profile: HaloProfile;
  onChange: (next: Partial<HaloProfile>) => void;
}) {
  return (
    <View>
      <View style={styles.always}>
        <Text style={type.body}>Name</Text>
        <Text style={[type.caption, styles.alwaysNote]}>Always</Text>
      </View>
      {SHOWABLE.map((field) => (
        <ToggleRow
          key={field}
          title={SHOWABLE_COPY[field].title}
          on={profile.show[field]}
          onChange={(next) => onChange({ show: { ...profile.show, [field]: next } })}
        />
      ))}
    </View>
  );
}

// -----------------------------------------------------------------------------
// What the matcher may score
// -----------------------------------------------------------------------------

/**
 * Chips rather than sixteen switches.
 *
 * A switch row is the right control for the six card fields, where each one has
 * a consequence worth naming. It is the wrong control for sixteen dimensions
 * that all mean the same thing - in or out - because the answer is a *set*, and
 * a set is read faster as filled versus outlined than as sixteen switch
 * positions the eye has to walk down.
 */
export function ScoringSection({
  mask,
  onToggleDimension,
}: {
  /** Per-dimension consent, index-aligned with DIMENSIONS. */
  mask: number[];
  onToggleDimension: (dimension: Dimension) => void;
}) {
  const open = mask.filter(Boolean).length;

  return (
    <View>
      <View style={styles.tagHead}>
        <Text style={[type.caption, styles.tagCount]}>
          {open} / {DIMENSIONS.length} open
        </Text>
        <Text style={[type.caption, styles.tagCount]}>Closed scores zero</Text>
      </View>

      <View style={styles.tags}>
        {DIMENSIONS.map((dimension, index) => {
          const on = !!mask[index];
          const sensitive = SENSITIVE_BY_DEFAULT.includes(dimension);
          return (
            <Pressable
              key={dimension}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              accessibilityLabel={dimension}
              onPress={() => {
                void Haptics.selectionAsync();
                onToggleDimension(dimension);
              }}
              style={[styles.tag, on && styles.tagOn]}
            >
              {/* The lock marks the three that start closed, and only while
                  they are closed - once opened it would be describing a state
                  that is no longer the case. */}
              {sensitive && !on ? (
                <Icon name="lock" size={11} color={alpha.t38} style={styles.tagLock} />
              ) : null}
              <Text style={[type.caption, styles.tagLabel, on && styles.tagLabelOn]}>
                {dimension}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.md },
  rowGrow: { flex: 1 },
  rowAge: { width: 88 },
  /** Kills the trailing margin a Field carries, so the card ends on the control. */
  last: { marginBottom: 0 },

  tagHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.md,
  },
  tagCount: { color: alpha.t56 },
  tagError: { color: palette.negative },

  railClip: { marginBottom: space.md },
  rail: { flexDirection: 'row', gap: 6, paddingRight: space.xl },
  railItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 30,
    paddingHorizontal: 12,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
  },
  railItemOn: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderColor: alpha.t10,
  },
  railLabel: { color: alpha.t38, textTransform: 'capitalize' },
  railLabelOn: { color: palette.white },
  railDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: palette.violet },

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
  /** At the cap, unpicked tags stop inviting a tap that would do nothing. */
  tagMuted: { opacity: 0.4 },
  tagLabel: { color: alpha.t56, textTransform: 'capitalize' },
  tagLabelOn: { color: palette.white },
  tagClose: { marginLeft: 6 },
  tagLock: { marginRight: 5 },

  custom: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.md },
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
  chosen: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginTop: space.md,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: alpha.t08,
  },

  always: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 11,
  },
  alwaysNote: { color: alpha.t38 },
});
