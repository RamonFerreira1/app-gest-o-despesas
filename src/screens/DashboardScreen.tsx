import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Animated,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useExpenseStore } from '../store/useExpenseStore';
import { useAuthStore } from '../store/useAuthStore';
import { colors, spacing, fontSize, borderRadius, shadows } from '../theme';
import { formatCurrency } from '../services/insightService';
import BudgetProgress from '../components/dashboard/BudgetProgress';
import CategoryPieChart from '../components/dashboard/CategoryPieChart';
import PersonalVsBusinessBar from '../components/dashboard/PersonalVsBusinessBar';
import InsightCard from '../components/dashboard/InsightCard';
import ExpenseListItem from '../components/expenses/ExpenseListItem';

export default function DashboardScreen() {
  const { user } = useAuthStore();
  const { expenses, summary, insights, loading, loadData } = useExpenseStore();
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (user) loadData(user.uid);
  }, [user]);

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
  }, []);

  const onRefresh = () => {
    if (user) loadData(user.uid);
  };

  const hora = new Date().getHours();
  const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
  const mesAtual = format(new Date(), "MMMM 'de' yyyy", { locale: ptBR });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        <Animated.View style={{ opacity: fadeAnim }}>
          {/* ── Header ── */}
          <View style={styles.header}>
            <View>
              <Text style={styles.greeting}>{saudacao} 👋</Text>
              <Text style={styles.monthLabel}>{mesAtual}</Text>
            </View>
            <View style={styles.avatar}>
              <Ionicons name="person" size={18} color={colors.primary} />
            </View>
          </View>

          {/* ── Saldo Hero Card ── */}
          <View style={[styles.heroCard, shadows.md]}>
            <Text style={styles.heroLabel}>Total Gasto no Mês</Text>
            <Text style={styles.heroValue}>
              {formatCurrency(summary?.totalGasto ?? 0)}
            </Text>
            <View style={styles.heroRow}>
              <View style={styles.heroStat}>
                <View style={[styles.dot, { backgroundColor: colors.pessoal }]} />
                <Text style={styles.heroStatLabel}>Pessoal</Text>
                <Text style={styles.heroStatValue}>
                  {formatCurrency(summary?.totalPessoal ?? 0)}
                </Text>
              </View>
              <View style={styles.heroDivider} />
              <View style={styles.heroStat}>
                <View style={[styles.dot, { backgroundColor: colors.negocio }]} />
                <Text style={styles.heroStatLabel}>NR Brownies</Text>
                <Text style={styles.heroStatValue}>
                  {formatCurrency(summary?.totalNegocio ?? 0)}
                </Text>
              </View>
            </View>
          </View>

          {/* ── Budget Progress ── */}
          {summary && <BudgetProgress summary={summary} />}

          {/* ── Insights ── */}
          {insights.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>🧠 Inteligência Financeira</Text>
              {insights.map((insight, i) => (
                <InsightCard key={i} insight={insight} />
              ))}
            </View>
          )}

          {/* ── Gráficos ── */}
          {summary && Object.keys(summary.byCategory).length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>📊 Gastos por Categoria</Text>
              <CategoryPieChart byCategory={summary.byCategory} />
            </View>
          )}

          {summary && (summary.totalPessoal > 0 || summary.totalNegocio > 0) && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>⚖️ Pessoal vs. Negócio</Text>
              <PersonalVsBusinessBar
                totalPessoal={summary.totalPessoal}
                totalNegocio={summary.totalNegocio}
              />
            </View>
          )}

          {/* ── Últimas Despesas ── */}
          {expenses.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>🕒 Últimas Despesas</Text>
              {expenses.slice(0, 5).map((expense) => (
                <ExpenseListItem key={expense.id} expense={expense} compact />
              ))}
            </View>
          )}

          {expenses.length === 0 && !loading && (
            <View style={styles.emptyState}>
              <Ionicons name="receipt-outline" size={64} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>Nenhuma despesa este mês</Text>
              <Text style={styles.emptySubtitle}>Toque no + para adicionar sua primeira despesa</Text>
            </View>
          )}

          <View style={{ height: 24 }} />
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { paddingHorizontal: spacing.md, paddingBottom: spacing.xl },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  greeting: { fontSize: fontSize.xxl, fontWeight: '700', color: colors.textPrimary },
  monthLabel: { fontSize: fontSize.md, color: colors.textSecondary, marginTop: 2, textTransform: 'capitalize' },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.primaryDim,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  heroCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  heroLabel: { fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.xs },
  heroValue: { fontSize: fontSize.xxxl, fontWeight: '800', color: colors.textPrimary, marginBottom: spacing.md },
  heroRow: { flexDirection: 'row', alignItems: 'center' },
  heroStat: { flex: 1, alignItems: 'center', gap: 4 },
  heroStatLabel: { fontSize: fontSize.xs, color: colors.textSecondary },
  heroStatValue: { fontSize: fontSize.md, fontWeight: '600', color: colors.textPrimary },
  heroDivider: { width: 1, height: 32, backgroundColor: colors.border, marginHorizontal: spacing.md },
  dot: { width: 8, height: 8, borderRadius: 4 },
  section: { marginBottom: spacing.lg },
  sectionTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.sm },
  emptyState: { alignItems: 'center', paddingVertical: spacing.xxl, gap: spacing.sm },
  emptyTitle: { fontSize: fontSize.lg, fontWeight: '600', color: colors.textSecondary },
  emptySubtitle: { fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center' },
});
