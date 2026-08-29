import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Chip } from '@/components/ui/primitives';
import { MetalButton } from '@/components/ui/MetalButton';
import { space } from '@/theme/tokens';
import { type } from '@/theme/typography';

/**
 * The Filters sheet from the comps.
 *
 * Selections are held locally and only handed back on Apply, so Cancel is a
 * real cancel rather than a close button that leaves your changes applied. That
 * distinction is the whole reason the sheet has two buttons instead of one, and
 * getting it wrong is one of the most common bugs in filter UIs.
 */

export type FilterGroup<T extends string = string> = {
  key: string;
  label: string;
  options: { value: T; label: string }[];
};

export type FilterSelection = Record<string, string>;

export type FilterSheetProps = {
  visible: boolean;
  onClose: () => void;
  groups: FilterGroup[];
  value: FilterSelection;
  onApply: (next: FilterSelection) => void;
  title?: string;
};

export function FilterSheet({
  visible,
  onClose,
  groups,
  value,
  onApply,
  title = 'Filters',
}: FilterSheetProps) {
  const [draft, setDraft] = useState<FilterSelection>(value);

  // Re-seed each time the sheet opens, so a cancelled edit does not persist
  // into the next opening.
  useEffect(() => {
    if (visible) setDraft(value);
  }, [visible, value]);

  const select = useCallback((groupKey: string, optionValue: string) => {
    setDraft((prev) => ({ ...prev, [groupKey]: optionValue }));
  }, []);

  const apply = useCallback(() => {
    onApply(draft);
    onClose();
  }, [draft, onApply, onClose]);

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={title}
      footer={
        <>
          <MetalButton
            label="Cancel"
            variant="metal"
            size="lg"
            onPress={onClose}
            style={styles.action}
          />
          <MetalButton
            label="Apply"
            variant="violet"
            size="lg"
            haptic="success"
            onPress={apply}
            style={styles.action}
          />
        </>
      }
    >
      {groups.map((group, index) => (
        <View key={group.key} style={index > 0 && styles.group}>
          <Text style={[type.calloutStrong, styles.groupLabel]}>{group.label}</Text>
          <View style={styles.options}>
            {group.options.map((option) => (
              <Chip
                key={option.value}
                label={option.label}
                selected={draft[group.key] === option.value}
                onPress={() => select(group.key, option.value)}
              />
            ))}
          </View>
        </View>
      ))}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  group: { marginTop: space.xl },
  groupLabel: { marginBottom: space.md },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  action: { flex: 1 },
});
