import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlowBackdrop } from '@/components/ui/GlowBackdrop';
import { ScrollScrim } from '@/components/ui/ScrollScrim';
import { Avatar } from '@/components/ui/Avatar';
import { MetalButton } from '@/components/ui/MetalButton';
import { Badge, Card, IconButton, ScreenHeader } from '@/components/ui/primitives';
import { FilterSheet, type FilterGroup, type FilterSelection } from '@/components/ui/FilterSheet';
import { ProfileSheet } from '@/components/sheets/ProfileSheet';
import { RequestsSheet, type ContactRequest } from '@/components/sheets/RequestsSheet';
import { alpha, layout, palette, radius as radii, space } from '@/theme/tokens';
import { type } from '@/theme/typography';
import { PEOPLE_BY_ID, WINKS, type Wink } from '@/data/people';
import { useHalo } from '@/state/store';
import { useRequestCards, useRequests } from '@/hooks/useRequests';

/*
 * No entering animation on these rows.
 *
 * Tab screens are detached when inactive, so every return to this tab is a
 * fresh mount and a staggered entrance replays in full. Once you have seen it
 * twice it stops reading as polish and starts reading as the screen rebuilding
 * itself on every switch - which is exactly what it is. Entrances are kept for
 * screens you arrive at once (person, proof) and for on-demand surfaces like
 * the radar's detail card.
 */

/**
 * Winkers - the two-column grid from the comps.
 *
 * Filtering lives in a bottom sheet rather than an inline chip row. With three
 * independent axes an inline row would need eleven chips across the top of the
 * screen, which is more chrome than content on a phone.
 */

const KIND_LABEL: Record<Wink['kind'], string> = {
  'sent-wink': 'Sent a wink',
  'winked-back': 'Winked back',
  'wants-chat': 'Wants to chat',
};

const KIND_ACTION: Record<Wink['kind'], string> = {
  'sent-wink': 'Send wink',
  'winked-back': 'Respond',
  'wants-chat': 'Reply',
};

const FILTER_GROUPS: FilterGroup[] = [
  {
    key: 'time',
    label: 'By time',
    options: [
      { value: 'all', label: 'All' },
      { value: 'today', label: 'Today' },
      { value: 'yesterday', label: 'Yesterday' },
      { value: 'older', label: 'Older' },
    ],
  },
  {
    key: 'interaction',
    label: 'By interaction',
    options: [
      { value: 'all', label: 'All' },
      { value: 'sent-wink', label: 'Sent a wink' },
      { value: 'winked-back', label: 'Winked back' },
      { value: 'wants-chat', label: 'Wants to chat' },
    ],
  },
  {
    key: 'status',
    label: 'By status',
    options: [
      { value: 'all', label: 'All' },
      { value: 'new', label: 'New' },
      { value: 'read', label: 'Read' },
      { value: 'active', label: 'Active now' },
    ],
  },
];

const DEFAULT_FILTERS: FilterSelection = { time: 'all', interaction: 'all', status: 'all' };

/**
 * The roster's stand-in requests.
 *
 * Kept because the roster personas have no session and can never send a real
 * one, so without these the sheet is empty until a second real account exists -
 * which on a fresh install is every time. Real requests are appended to these,
 * not substituted for them, and the two are distinguishable: a roster entry
 * resolves through `PEOPLE_BY_ID`, a real one carries its own name and avatar.
 */
const DEMO_REQUESTS: ContactRequest[] = [
  { personId: 'tom', at: '10.03.2025' },
  { personId: 'anna', at: '03.03.2025' },
  { personId: 'michael', at: '12.03.2025' },
  { personId: 'emma', at: '10.03.2025' },
  { personId: 'nataly', at: '03.03.2025' },
];

/** Buckets a relative timestamp onto the sheet's time axis. */
function timeBucket(at: string): 'today' | 'yesterday' | 'older' {
  if (/m ago|now|h ago/.test(at)) return 'today';
  if (/yesterday/i.test(at)) return 'yesterday';
  return 'older';
}

export default function WinkersScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const { mask, selfVector } = useHalo();
  const [filters, setFilters] = useState<FilterSelection>(DEFAULT_FILTERS);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [requestsOpen, setRequestsOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const person = selected ? PEOPLE_BY_ID.get(selected) ?? null : null;

  const requests = useRequests();
  const { cards } = useRequestCards();

  /** Real requests first - those are the ones that can actually be answered. */
  const allRequests = useMemo<ContactRequest[]>(
    () => [...cards, ...DEMO_REQUESTS],
    [cards],
  );

  /**
   * Answering a request.
   *
   * Only the real ones reach the database. A roster entry has no wallet and no
   * row to update, so accepting one is a local dismissal - which is what the
   * sheet already does on its own.
   */
  const onResolveRequest = useCallback(
    (personId: string, accepted: boolean) => {
      if (PEOPLE_BY_ID.has(personId)) return;
      const action = accepted ? requests.accept(personId) : requests.decline(personId);
      void action.catch(() => {});
    },
    [requests],
  );

  const columnWidth = (width - space.xl * 2 - space.md) / 2;

  const activeCount = Object.entries(filters).filter(([, v]) => v !== 'all').length;

  const visible = useMemo(
    () =>
      WINKS.filter((wink) => {
        if (filters.interaction !== 'all' && wink.kind !== filters.interaction) return false;
        if (filters.time !== 'all' && timeBucket(wink.at) !== filters.time) return false;

        if (filters.status === 'new' && !wink.unread) return false;
        if (filters.status === 'read' && wink.unread) return false;
        if (filters.status === 'active' && !PEOPLE_BY_ID.get(wink.personId)?.online) return false;

        return true;
      }),
    [filters],
  );

  return (
    <View style={styles.root}>
      <GlowBackdrop intensity={0.75} origin={1.12} />

      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + space.sm,
          paddingBottom: layout.tabBarHeight + insets.bottom + space['4xl'],
        }}
        showsVerticalScrollIndicator={false}
      >
        <ScreenHeader
          title="Winkers"
          subtitle="People who winked or reached out"
          right={
            <View style={styles.headerActions}>
              <View>
                <IconButton
                  name="person"
                  accessibilityLabel={`Incoming requests, ${allRequests.length} waiting`}
                  onPress={() => setRequestsOpen(true)}
                />
                {allRequests.length > 0 ? <View style={styles.filterDot} /> : null}
              </View>
              <View>
                <IconButton
                  name="sliders"
                  accessibilityLabel={
                    activeCount > 0 ? `Filters, ${activeCount} active` : 'Filters'
                  }
                  onPress={() => setSheetOpen(true)}
                />
                {activeCount > 0 ? <View style={styles.filterDot} /> : null}
              </View>
            </View>
          }
        />

        {activeCount > 0 ? (
          <View style={styles.summary}>
            <Badge
              label={`${visible.length} of ${WINKS.length} shown`}
              tone="violet"
              icon="sliders"
            />
            <MetalButton
              label="Clear"
              variant="ghost"
              size="sm"
              onPress={() => setFilters(DEFAULT_FILTERS)}
            />
          </View>
        ) : null}

        <View style={styles.grid}>
          {visible.map((wink) => {
            const person = PEOPLE_BY_ID.get(wink.personId);
            if (!person) return null;

            return (
              <Pressable
                key={wink.personId}
                accessibilityRole="button"
                accessibilityLabel={`Open ${person.name}'s profile`}
                onPress={() => setSelected(person.id)}
                style={{ width: columnWidth }}
              >
                <Card radius={radii.card} style={styles.tile} active={wink.unread}>
                  <View style={styles.tileHead}>
                    <Avatar
                      email={person.email}
                      size={42}
                      online={person.online}
                      highlighted={wink.unread}
                    />
                    <Text style={[type.micro, styles.tileTime]} numberOfLines={1}>
                      {wink.at}
                    </Text>
                  </View>

                  <Text style={[type.body, styles.tileName]} numberOfLines={1}>
                    {person.name}
                  </Text>
                  <Text style={[type.caption, styles.tileKind]} numberOfLines={1}>
                    {KIND_LABEL[wink.kind]}
                  </Text>

                  <MetalButton
                    label={KIND_ACTION[wink.kind]}
                    size="sm"
                    variant={wink.unread ? 'violet' : 'metal'}
                    fullWidth
                    onPress={() => router.push(`/chat/${person.id}`)}
                    style={styles.tileAction}
                  />
                </Card>
              </Pressable>
            );
          })}
        </View>

        {visible.length === 0 ? (
          <View style={styles.empty}>
            <Text style={[type.callout, styles.emptyLabel]}>
              Nothing matches those filters.
            </Text>
            <MetalButton
              label="Clear filters"
              variant="metal"
              size="md"
              onPress={() => setFilters(DEFAULT_FILTERS)}
              style={styles.emptyAction}
            />
          </View>
        ) : null}
      </ScrollView>

      <ScrollScrim />

      <ProfileSheet
        person={person}
        visible={person !== null}
        onClose={() => setSelected(null)}
        mask={mask}
        selfVector={selfVector}
      />

      <RequestsSheet
        visible={requestsOpen}
        onClose={() => setRequestsOpen(false)}
        requests={allRequests}
        onResolve={onResolveRequest}
      />

      <FilterSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        groups={FILTER_GROUPS}
        value={filters}
        onApply={setFilters}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.void },

  headerActions: { flexDirection: 'row', gap: space.sm },
  filterDot: {
    position: 'absolute',
    top: -1,
    right: -1,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: palette.violet,
    borderWidth: 1.5,
    borderColor: palette.void,
  },

  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.xl,
    paddingBottom: space.lg,
  },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: space.xl,
    gap: space.md,
  },
  tile: { padding: space.lg, paddingTop: space.md },
  tileHead: {
    flexDirection: 'row',
    // Centred rather than top-aligned: the timestamp reads as belonging to the
    // person when it sits on the avatar's axis, and as floating when it does not.
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  // `flexShrink` lets a long relative time ("Yesterday") give way to the avatar
  // instead of forcing the row wider than the column.
  tileTime: { color: alpha.t38, marginLeft: space.sm, flexShrink: 1, textAlign: 'right' },
  tileName: { marginTop: space.lg },
  tileKind: { marginTop: 3 },
  tileAction: { marginTop: space.lg },

  empty: { alignItems: 'center', paddingTop: space['4xl'], paddingHorizontal: space.xl },
  emptyLabel: { color: alpha.t38 },
  emptyAction: { marginTop: space.xl },
});
