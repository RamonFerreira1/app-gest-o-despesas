import React from 'react';
import { View, Platform, StyleSheet } from 'react-native';
import { format } from 'date-fns';
import { colors, borderRadius, fontSize, spacing } from '../../theme';

interface Props {
  value: Date;
  onChange: (date: Date) => void;
  maximumDate?: Date;
}

// ── Web: usa o input nativo do browser ────────────────────────────────────────
function WebDatePicker({ value, onChange, maximumDate }: Props) {
  const dateStr = format(value, 'yyyy-MM-dd');
  const maxStr = maximumDate ? format(maximumDate, 'yyyy-MM-dd') : undefined;

  return (
    <View style={styles.webWrapper}>
      {/* @ts-ignore — elemento HTML nativo via react-native-web */}
      <input
        type="date"
        value={dateStr}
        max={maxStr}
        onChange={(e) => {
          const [year, month, day] = e.target.value.split('-').map(Number);
          if (year && month && day) {
            onChange(new Date(year, month - 1, day));
          }
        }}
        style={{
          backgroundColor: 'transparent',
          border: 'none',
          color: colors.textPrimary,
          fontSize: fontSize.md,
          flex: 1,
          width: '100%',
          outline: 'none',
          colorScheme: 'dark',
          cursor: 'pointer',
        }}
      />
    </View>
  );
}

// ── Native: usa @react-native-community/datetimepicker ───────────────────────
function NativeDatePicker({ value, onChange, maximumDate }: Props) {
  const DateTimePicker = require('@react-native-community/datetimepicker').default;
  return (
    <DateTimePicker
      value={value}
      mode="date"
      display={Platform.OS === 'ios' ? 'inline' : 'default'}
      onChange={(_: any, selectedDate?: Date) => {
        if (selectedDate) onChange(selectedDate);
      }}
      maximumDate={maximumDate}
    />
  );
}

export default function CrossPlatformDatePicker(props: Props) {
  if (Platform.OS === 'web') {
    return <WebDatePicker {...props} />;
  }
  return <NativeDatePicker {...props} />;
}

const styles = StyleSheet.create({
  webWrapper: {
    flex: 1,
  },
});
