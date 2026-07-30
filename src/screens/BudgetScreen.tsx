import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../store/useAuthStore';
import { useExpenseStore } from '../store/useExpenseStore';
import { setBudget } from '../services/budgetService';
import { colors, spacing, fontSize, borderRadius, shadows } from '../theme';
import { formatCurrency } from '../services/insightService';

export default function BudgetScreen() {
  const { user } = useAuthStore();
  const { budget, summary, loadData } = useExpenseStore();

  const [limite, setLimite] = useState('');
  const [renda, setRenda] = useState('');
  const [valorReservado, setValorReservado] = useState('');
  const [metaEconomia, setMetaEconomia] = useState('');
  const [saving, setSaving] = useState(false);

  const barAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (budget) {
      setLimite(budget.limite.toString());
      setRenda(budget.rendaMensal.toString());
      setValorReservado((budget.valorReservado ?? 0).toString());
    }
  }, [budget]);

  useEffect(() => {
    if (summary) {
      Animated.timing(barAnim, {
        toValue: Math.min(summary.percentualUsado / 100, 1),
        duration: 800,
        useNativeDriver: false,
      }).start();
    }
  }, [summary]);

  const handleSave = async () => {
    const limiteNum = parseFloat(limite.replace(',', '.'));
    const rendaNum = parseFloat(renda.replace(',', '.')) || 0;
    const reservadoNum = parseFloat(valorReservado.replace(',', '.')) || 0;
    if (!limiteNum || limiteNum <= 0) {
      return Alert.alert('Atenção', 'Informe um teto de gastos válido.');
    }
    if (!user) return;
    setSaving(true);
    try {
      await setBudget(user.uid, new Date(), limiteNum, rendaNum, reservadoNum);
      await loadData(user.uid);
      Alert.alert('✅ Salvo', 'Orçamento atualizado com sucesso!');
    } catch {
      Alert.alert('Erro', 'Não foi possível salvar o orçamento.');
    } finally {
      setSaving(false);
    }
  };

  const pct = summary?.percentualUsado ?? 0;
  const gasto = summary?.totalGasto ?? 0;
  const limiteVal = budget?.limite ?? 0;
  const saldo = summary?.saldoRestante ?? 0;
  const reservadoVal = budget?.valorReservado ?? 0;
  const rendaMensal = budget?.rendaMensal ?? 0;
  const metaNum = parseFloat(metaEconomia.replace(',', '.')) || 0;
  const economizado = Math.max(0, rendaMensal - gasto);
  const pctMeta = metaNum > 0 ? Math.min((economizado / metaNum) * 100, 100) : 0;

  const barColor =
    pct >= 100 ? colors.danger : pct >= 80 ? colors.warning : colors.primary;

  const diasNoMes = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
  const diaAtual = new Date().getDate();
  const diasRestantes = Math.max(0, diasNoMes - diaAtual);
  const mediaDiaria = saldo > 0 ? saldo / Math.max(diasRestantes, 1) : 0;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {/* ── Header ── */}
        <View style={styles.header}>
          <Text style={styles.title}>🎯 Orçamento</Text>
          <Text style={styles.subtitle}>Gerencie seus limites mensais</Text>
        </View>

        {/* ── Hero Progress Card ── */}
        <View style={[styles.heroCard, shadows.md]}>
          <Text style={styles.heroLabel}>Utilizado este mês</Text>

          <View style={styles.heroValues}>
            <Text style={[styles.heroGasto, { color: barColor }]}>{formatCurrency(gasto)}</Text>
            <Text style={styles.heroLimite}>de {formatCurrency(limiteVal)}</Text>
          </View>

          {/* Barra animada */}
          <View style={styles.barTrack}>
            <Animated.View
              style={[
                styles.barFill,
                {
                  backgroundColor: barColor,
                  width: barAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0%', '100%'],
                  }),
                },
              ]}
            />
          </View>

          <View style={styles.heroFooter}>
            <Text style={styles.heroPct}>{pct.toFixed(0)}% utilizado</Text>
            <Text style={[styles.heroSaldo, { color: saldo >= 0 ? colors.primary : colors.danger }]}>
              {saldo >= 0 ? `Livre: ${formatCurrency(saldo)}` : `Excedido: ${formatCurrency(Math.abs(saldo))}`}
            </Text>
          </View>
        </View>

        {/* ── Métricas ── */}
        <View style={styles.metricsRow}>
          <View style={[styles.metricCard, { borderColor: colors.info }]}>
            <Ionicons name="calendar" size={20} color={colors.info} />
            <Text style={styles.metricLabel}>Dias restantes</Text>
            <Text style={[styles.metricValue, { color: colors.info }]}>{diasRestantes}d</Text>
          </View>
          <View style={[styles.metricCard, { borderColor: colors.warning }]}>
            <Ionicons name="trending-down" size={20} color={colors.warning} />
            <Text style={styles.metricLabel}>Média/dia disponível</Text>
            <Text style={[styles.metricValue, { color: colors.warning }]}>{formatCurrency(mediaDiaria, true)}</Text>
          </View>
          <View style={[styles.metricCard, { borderColor: colors.primary }]}>
            <Ionicons name="wallet" size={20} color={colors.primary} />
            <Text style={styles.metricLabel}>Fundo de Reserva</Text>
            <Text style={[styles.metricValue, { color: colors.primary }]}>{formatCurrency(reservadoVal, true)}</Text>
          </View>
        </View>

        {/* ── Meta de Economia ── */}
        {rendaMensal > 0 && (
          <View style={[styles.card, shadows.sm]}>
            <Text style={styles.cardTitle}>💚 Meta de Economia</Text>
            <View style={styles.inputRow}>
              <Text style={styles.inputLabel}>Meta mensal (R$)</Text>
              <TextInput
                style={styles.inputSmall}
                value={metaEconomia}
                onChangeText={setMetaEconomia}
                keyboardType="numeric"
                placeholder="Ex: 500"
                placeholderTextColor={colors.textMuted}
              />
            </View>
            {metaNum > 0 && (
              <>
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { backgroundColor: colors.primary, width: `${pctMeta}%` as any }]} />
                </View>
                <Text style={styles.metaMsg}>
                  {economizado >= metaNum
                    ? `🎉 Meta atingida! Você economizou ${formatCurrency(economizado)}`
                    : `Economizado até agora: ${formatCurrency(economizado)} de ${formatCurrency(metaNum)} (${pctMeta.toFixed(0)}%)`}
                </Text>
              </>
            )}
          </View>
        )}

        {/* ── Configurações ── */}
        <View style={[styles.card, shadows.sm]}>
          <Text style={styles.cardTitle}>⚙️ Configurar Orçamento</Text>

          <Text style={styles.inputLabel}>Teto de Gastos Mensal (R$)</Text>
          <TextInput
            style={styles.input}
            value={limite}
            onChangeText={setLimite}
            keyboardType="numeric"
            placeholder="Ex: 3000"
            placeholderTextColor={colors.textMuted}
          />

          <Text style={styles.inputLabel}>Renda Mensal (R$)</Text>
          <TextInput
            style={styles.input}
            value={renda}
            onChangeText={setRenda}
            keyboardType="numeric"
            placeholder="Ex: 5000"
            placeholderTextColor={colors.textMuted}
          />

          <Text style={styles.inputLabel}>Fundo de Reserva / Emergência (R$)</Text>
          <TextInput
            style={styles.input}
            value={valorReservado}
            onChangeText={setValorReservado}
            keyboardType="numeric"
            placeholder="Ex: 10000"
            placeholderTextColor={colors.textMuted}
          />

          <TouchableOpacity
            style={[styles.saveBtn, saving && { opacity: 0.7 }]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#000" />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={20} color="#000" />
                <Text style={styles.saveBtnText}>Salvar Orçamento</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { paddingHorizontal: spacing.md, paddingBottom: spacing.xl },
  header: {
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: fontSize.xxl,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  heroCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  heroLabel: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  heroValues: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  heroGasto: {
    fontSize: fontSize.xxxl,
    fontWeight: '800',
  },
  heroLimite: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
  },
  barTrack: {
    height: 10,
    backgroundColor: colors.surfaceAlt,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
    marginBottom: spacing.sm,
  },
  barFill: {
    height: '100%',
    borderRadius: borderRadius.full,
  },
  heroFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heroPct: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  heroSaldo: {
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  metricsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  metricCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.sm,
    borderWidth: 1,
    alignItems: 'center',
    gap: 4,
  },
  metricLabel: {
    fontSize: 9,
    color: colors.textSecondary,
    textAlign: 'center',
    fontWeight: '500',
  },
  metricValue: {
    fontSize: fontSize.sm,
    fontWeight: '800',
    textAlign: 'center',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  cardTitle: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  inputRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  inputLabel: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  input: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: borderRadius.md,
    padding: spacing.sm + 4,
    fontSize: fontSize.md,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  inputSmall: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: borderRadius.md,
    padding: spacing.xs + 4,
    fontSize: fontSize.sm,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
    minWidth: 100,
    textAlign: 'right',
  },
  metaMsg: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  saveBtn: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  saveBtnText: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: '#000',
  },
});
