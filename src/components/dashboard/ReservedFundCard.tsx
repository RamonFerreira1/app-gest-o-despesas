import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, borderRadius, shadows } from '../../theme';
import { MonthSummary } from '../../types';
import { formatCurrency } from '../../services/insightService';

interface Props {
  summary: MonthSummary;
}

export default function ReservedFundCard({ summary }: Props) {
  const animWidth = useRef(new Animated.Value(0)).current;

  const totalReservado = summary.valorReservado || 0;
  const totalGastoAcumulado = summary.totalGastoReservadoAcumulado || 0;
  const saldoRestante = Math.max(0, summary.saldoReservaRestante || 0);
  const totalGastoMes = summary.totalGastoReservado || 0;

  const pctUsado = totalReservado > 0
    ? Math.min(100, (totalGastoAcumulado / totalReservado) * 100)
    : 0;

  useEffect(() => {
    Animated.timing(animWidth, {
      toValue: pctUsado,
      duration: 1200,
      useNativeDriver: false,
    }).start();
  }, [pctUsado]);

  return (
    <View style={[styles.container, shadows.md]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.iconBox}>
            <Ionicons name="shield-checkmark" size={20} color="#E0AAFF" />
          </View>
          <View>
            <Text style={styles.title}>Valor Reservado</Text>
            <Text style={styles.subtitle}>Fundo de Reserva & Amortizações</Text>
          </View>
        </View>
        {totalGastoMes > 0 && (
          <View style={styles.monthBadge}>
            <Text style={styles.monthBadgeText}>-{formatCurrency(totalGastoMes)} este mês</Text>
          </View>
        )}
      </View>

      {/* Saldo Principal */}
      <View style={styles.mainValueBox}>
        <Text style={styles.mainLabel}>Saldo Disponível na Reserva</Text>
        <Text style={styles.mainValue}>{formatCurrency(saldoRestante)}</Text>
      </View>

      {/* Track progress */}
      {totalReservado > 0 && (
        <View style={styles.progressContainer}>
          <View style={styles.progressHeader}>
            <Text style={styles.progressLabel}>Utilização da Reserva</Text>
            <Text style={styles.progressPct}>{pctUsado.toFixed(0)}% utilizado</Text>
          </View>
          <View style={styles.track}>
            <Animated.View
              style={[
                styles.bar,
                {
                  width: animWidth.interpolate({
                    inputRange: [0, 100],
                    outputRange: ['0%', '100%'],
                  }),
                },
              ]}
            />
          </View>
        </View>
      )}

      {/* Grid de Métricas */}
      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>Valor Reservado Inicial</Text>
          <Text style={styles.statValue}>{formatCurrency(totalReservado)}</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>Total Gasto / Amortizado</Text>
          <Text style={[styles.statValue, { color: '#FF758F' }]}>
            {formatCurrency(totalGastoAcumulado)}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#18132A',
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: '#3C2A69',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(157, 78, 221, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: '#F3E8FF',
  },
  subtitle: {
    fontSize: fontSize.xs,
    color: '#9D4EDD',
  },
  monthBadge: {
    backgroundColor: 'rgba(239, 71, 111, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: 'rgba(239, 71, 111, 0.4)',
  },
  monthBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FF758F',
  },
  mainValueBox: {
    marginBottom: spacing.md,
  },
  mainLabel: {
    fontSize: fontSize.xs,
    color: '#C77DFF',
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  mainValue: {
    fontSize: fontSize.xxxl,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  progressContainer: {
    marginBottom: spacing.md,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  progressLabel: {
    fontSize: fontSize.xs,
    color: '#A29BFE',
  },
  progressPct: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: '#E0AAFF',
  },
  track: {
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    overflow: 'hidden',
  },
  bar: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: '#9D4EDD',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(157, 78, 221, 0.2)',
  },
  statBox: {
    flex: 1,
  },
  statLabel: {
    fontSize: fontSize.xs,
    color: '#A29BFE',
    marginBottom: 2,
  },
  statValue: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  statDivider: {
    width: 1,
    height: 28,
    backgroundColor: 'rgba(157, 78, 221, 0.2)',
    marginHorizontal: spacing.md,
  },
});
