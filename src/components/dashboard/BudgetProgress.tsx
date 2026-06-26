import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { colors, spacing, fontSize, borderRadius } from '../../theme';
import { MonthSummary } from '../../types';
import { formatCurrency } from '../../services/insightService';

interface Props {
  summary: MonthSummary;
}

export default function BudgetProgress({ summary }: Props) {
  const animWidth = useRef(new Animated.Value(0)).current;
  const pct = Math.min(summary.percentualUsado, 100);

  useEffect(() => {
    Animated.timing(animWidth, {
      toValue: pct,
      duration: 1200,
      useNativeDriver: false,
    }).start();
  }, [pct]);

  const barColor =
    pct >= 100 ? colors.danger : pct >= 80 ? colors.warning : colors.primary;

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Text style={styles.label}>Consumo do Limite</Text>
        <Text style={[styles.pct, { color: barColor }]}>{pct.toFixed(0)}%</Text>
      </View>

      <View style={styles.track}>
        <Animated.View
          style={[
            styles.bar,
            {
              backgroundColor: barColor,
              width: animWidth.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }),
              shadowColor: barColor,
            },
          ]}
        />
      </View>

      <View style={styles.legendRow}>
        <View>
          <Text style={styles.legendLabel}>Gasto</Text>
          <Text style={[styles.legendValue, { color: barColor }]}>
            {formatCurrency(summary.totalGasto)}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.legendLabel}>Restante</Text>
          <Text style={[styles.legendValue, { color: summary.saldoRestante >= 0 ? colors.primary : colors.danger }]}>
            {formatCurrency(Math.abs(summary.saldoRestante))}
            {summary.saldoRestante < 0 ? ' (excedido)' : ''}
          </Text>
        </View>
      </View>

      <Text style={styles.limiteLabel}>Teto: {formatCurrency(summary.limite)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  label: { fontSize: fontSize.sm, fontWeight: '600', color: colors.textSecondary },
  pct: { fontSize: fontSize.xl, fontWeight: '800' },
  track: {
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  bar: {
    height: '100%',
    borderRadius: 6,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
    elevation: 4,
  },
  legendRow: { flexDirection: 'row', justifyContent: 'space-between' },
  legendLabel: { fontSize: fontSize.xs, color: colors.textMuted, marginBottom: 2 },
  legendValue: { fontSize: fontSize.md, fontWeight: '700' },
  limiteLabel: { fontSize: fontSize.xs, color: colors.textMuted, textAlign: 'center', marginTop: spacing.sm },
});
