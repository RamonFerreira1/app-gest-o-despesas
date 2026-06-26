import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { colors, spacing, fontSize, borderRadius } from '../../theme';
import { formatCurrency } from '../../services/insightService';

interface Props {
  totalPessoal: number;
  totalNegocio: number;
}

export default function PersonalVsBusinessBar({ totalPessoal, totalNegocio }: Props) {
  const total = totalPessoal + totalNegocio;
  const pessoalPct = total > 0 ? (totalPessoal / total) * 100 : 50;
  const negocioPct = 100 - pessoalPct;

  const animPessoal = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(animPessoal, {
      toValue: pessoalPct,
      duration: 1000,
      useNativeDriver: false,
    }).start();
  }, [pessoalPct]);

  return (
    <View style={styles.container}>
      <View style={styles.labelsRow}>
        <View style={styles.labelGroup}>
          <View style={[styles.dot, { backgroundColor: colors.pessoal }]} />
          <Text style={styles.labelText}>Pessoal</Text>
          <Text style={[styles.labelValue, { color: colors.pessoal }]}>{formatCurrency(totalPessoal)}</Text>
        </View>
        <View style={[styles.labelGroup, { alignItems: 'flex-end' }]}>
          <View style={[styles.dot, { backgroundColor: colors.negocio }]} />
          <Text style={styles.labelText}>NR Brownies</Text>
          <Text style={[styles.labelValue, { color: colors.negocio }]}>{formatCurrency(totalNegocio)}</Text>
        </View>
      </View>

      <View style={styles.track}>
        <Animated.View
          style={[
            styles.barPessoal,
            {
              width: animPessoal.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }),
            },
          ]}
        />
        <View style={[styles.barNegocio, { flex: 1 }]} />
      </View>

      <View style={styles.pctRow}>
        <Text style={[styles.pctText, { color: colors.pessoal }]}>{pessoalPct.toFixed(0)}%</Text>
        <Text style={[styles.pctText, { color: colors.negocio }]}>{negocioPct.toFixed(0)}%</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  labelsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.md },
  labelGroup: { gap: 2 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  labelText: { fontSize: fontSize.xs, color: colors.textMuted },
  labelValue: { fontSize: fontSize.md, fontWeight: '700' },
  track: {
    height: 20,
    borderRadius: 10,
    flexDirection: 'row',
    overflow: 'hidden',
    backgroundColor: colors.negocio,
  },
  barPessoal: { height: '100%', backgroundColor: colors.pessoal },
  barNegocio: { height: '100%' },
  pctRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm },
  pctText: { fontSize: fontSize.sm, fontWeight: '700' },
});
