import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MonthSummary, PendingTransaction } from '../../types';
import { colors, spacing, fontSize, borderRadius } from '../../theme';
import { formatCurrency } from '../../services/insightService';

interface Alert {
  id: string;
  type: 'danger' | 'warning' | 'info' | 'success';
  icon: string;
  title: string;
  message: string;
}

interface SmartAlertBannerProps {
  summary: MonthSummary | null;
  pendingTxs: PendingTransaction[];
  onDismiss?: (id: string) => void;
}

function buildAlerts(summary: MonthSummary | null, pendingTxs: PendingTransaction[]): Alert[] {
  const alerts: Alert[] = [];

  if (!summary) return alerts;

  const pct = summary.percentualUsado;

  if (summary.totalGasto > summary.limite) {
    alerts.push({
      id: 'over_budget',
      type: 'danger',
      icon: 'alert-circle',
      title: 'Orçamento ultrapassado!',
      message: `Você estourou o limite em ${formatCurrency(summary.totalGasto - summary.limite)}. Controle os gastos!`,
    });
  } else if (pct >= 80) {
    alerts.push({
      id: 'near_budget',
      type: 'warning',
      icon: 'warning',
      title: `${pct.toFixed(0)}% do orçamento usado`,
      message: `Restam apenas ${formatCurrency(summary.saldoRestante)} de ${formatCurrency(summary.limite)}.`,
    });
  }

  if (pendingTxs.length > 0) {
    alerts.push({
      id: 'pending_txs',
      type: 'info',
      icon: 'cloud-download',
      title: `${pendingTxs.length} transaç${pendingTxs.length === 1 ? 'ão nova' : 'ões novas'} do banco`,
      message: `Toque para revisar e categorizar os lançamentos importados.`,
    });
  }

  if (summary.totalNegocio > summary.totalPessoal * 1.5 && summary.totalNegocio > 0) {
    alerts.push({
      id: 'high_business',
      type: 'warning',
      icon: 'business',
      title: 'Gastos da NR Brownies altos',
      message: `${formatCurrency(summary.totalNegocio)} em despesas de negócio este mês. Verifique!`,
    });
  }

  if (pct < 30 && summary.totalGasto > 0) {
    const diasNoMes = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
    if (new Date().getDate() > diasNoMes * 0.6) {
      alerts.push({
        id: 'good_pace',
        type: 'success',
        icon: 'trending-down',
        title: 'Ótimo ritmo de gastos!',
        message: `Você usou apenas ${pct.toFixed(0)}% do orçamento. Continue assim! 🎉`,
      });
    }
  }

  return alerts;
}

const alertColorMap = {
  danger: { bg: '#FF4D4D15', border: '#FF4D4D', text: '#FF4D4D' },
  warning: { bg: '#FF910015', border: '#FF9100', text: '#FF9100' },
  info: { bg: '#4D9FFF15', border: '#4D9FFF', text: '#4D9FFF' },
  success: { bg: '#00E67615', border: '#00E676', text: '#00E676' },
};

function SmartAlertCard({ alert, onDismiss }: { alert: Alert; onDismiss?: (id: string) => void }) {
  const c = alertColorMap[alert.type];
  const slideAnim = useRef(new Animated.Value(-20)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 80 }),
      Animated.timing(opacityAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start();
  }, []);

  const handleDismiss = () => {
    Animated.parallel([
      Animated.spring(slideAnim, { toValue: -20, useNativeDriver: true }),
      Animated.timing(opacityAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => onDismiss?.(alert.id));
  };

  return (
    <Animated.View
      style={[
        styles.card,
        { backgroundColor: c.bg, borderColor: c.border },
        { opacity: opacityAnim, transform: [{ translateY: slideAnim }] },
      ]}
    >
      <View style={[styles.iconBox, { backgroundColor: `${c.border}25` }]}>
        <Ionicons name={alert.icon as any} size={18} color={c.text} />
      </View>
      <View style={styles.cardContent}>
        <Text style={[styles.cardTitle, { color: c.text }]}>{alert.title}</Text>
        <Text style={styles.cardMessage}>{alert.message}</Text>
      </View>
      {onDismiss && (
        <TouchableOpacity onPress={handleDismiss} style={styles.dismissBtn}>
          <Ionicons name="close" size={16} color={colors.textMuted} />
        </TouchableOpacity>
      )}
    </Animated.View>
  );
}

export function SmartAlertBanner({ summary, pendingTxs, onDismiss }: SmartAlertBannerProps) {
  const [dismissed, setDismissed] = useState<string[]>([]);
  const allAlerts = buildAlerts(summary, pendingTxs);
  const visible = allAlerts.filter((a) => !dismissed.includes(a.id));

  if (visible.length === 0) return null;

  const handleDismiss = (id: string) => {
    setDismissed((prev) => [...prev, id]);
    onDismiss?.(id);
  };

  return (
    <View style={styles.container}>
      {visible.map((alert) => (
        <SmartAlertCard key={alert.id} alert={alert} onDismiss={handleDismiss} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs + 2,
    marginBottom: spacing.md,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    padding: spacing.sm + 2,
    gap: spacing.sm,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardContent: {
    flex: 1,
    gap: 2,
  },
  cardTitle: {
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  cardMessage: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  dismissBtn: {
    padding: 4,
  },
});
