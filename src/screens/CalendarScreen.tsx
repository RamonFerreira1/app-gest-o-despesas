import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isSameDay, isToday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useExpenseStore } from '../store/useExpenseStore';
import { useAuthStore } from '../store/useAuthStore';
import { formatCurrency } from '../services/insightService';
import { Expense } from '../types';
import { colors, spacing, fontSize, borderRadius, shadows, categoryColors } from '../theme';

const { width } = Dimensions.get('window');
const DAY_SIZE = Math.floor((width - spacing.md * 2 - spacing.xs * 6) / 7);

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export default function CalendarScreen() {
  const { user } = useAuthStore();
  const { expenses, loadData, selectedMonth, setSelectedMonth } = useExpenseStore();
  const [selectedDay, setSelectedDay] = useState<Date | null>(new Date());

  useEffect(() => {
    if (user?.uid) loadData(user.uid, selectedMonth);
  }, [selectedMonth, user?.uid]);

  const firstDay = startOfMonth(selectedMonth);
  const lastDay = endOfMonth(selectedMonth);
  const days = eachDayOfInterval({ start: firstDay, end: lastDay });
  const startOffset = getDay(firstDay); // 0=Dom

  // Agrupa despesas por dia
  const expensesByDay: Record<string, Expense[]> = {};
  expenses.forEach((e) => {
    const key = format(new Date(e.data), 'yyyy-MM-dd');
    if (!expensesByDay[key]) expensesByDay[key] = [];
    expensesByDay[key].push(e);
  });

  const getDayTotal = (day: Date) => {
    const key = format(day, 'yyyy-MM-dd');
    return (expensesByDay[key] ?? []).reduce((s, e) => s + e.valor, 0);
  };

  const getDayExpenses = (day: Date) => {
    const key = format(day, 'yyyy-MM-dd');
    return expensesByDay[key] ?? [];
  };

  const dayExpenses = selectedDay ? getDayExpenses(selectedDay) : [];
  const dayTotal = dayExpenses.reduce((s, e) => s + e.valor, 0);

  // Máximo gasto do mês para normalização
  const maxDayTotal = Math.max(...days.map(getDayTotal), 1);

  const goToPrevMonth = () => {
    const d = new Date(selectedMonth);
    d.setMonth(d.getMonth() - 1);
    setSelectedMonth(d);
    setSelectedDay(null);
  };

  const goToNextMonth = () => {
    const d = new Date(selectedMonth);
    d.setMonth(d.getMonth() + 1);
    setSelectedMonth(d);
    setSelectedDay(null);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {/* ── Header ── */}
        <View style={styles.header}>
          <Text style={styles.title}>📅 Calendário</Text>
          <Text style={styles.subtitle}>Gastos por dia do mês</Text>
        </View>

        {/* ── Navegação de Mês ── */}
        <View style={[styles.monthNav, shadows.sm]}>
          <TouchableOpacity onPress={goToPrevMonth} style={styles.monthArrow}>
            <Text style={styles.monthArrowText}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.monthLabel}>
            {format(selectedMonth, "MMMM 'de' yyyy", { locale: ptBR })}
          </Text>
          <TouchableOpacity onPress={goToNextMonth} style={styles.monthArrow}>
            <Text style={styles.monthArrowText}>›</Text>
          </TouchableOpacity>
        </View>

        {/* ── Dias da Semana ── */}
        <View style={styles.weekRow}>
          {WEEKDAYS.map((d) => (
            <View key={d} style={styles.weekDayCell}>
              <Text style={styles.weekDayText}>{d}</Text>
            </View>
          ))}
        </View>

        {/* ── Grade do Calendário ── */}
        <View style={styles.calGrid}>
          {/* células vazias antes do primeiro dia */}
          {Array.from({ length: startOffset }).map((_, i) => (
            <View key={`empty-${i}`} style={styles.dayCell} />
          ))}

          {days.map((day) => {
            const total = getDayTotal(day);
            const hasExpenses = total > 0;
            const isSelected = selectedDay ? isSameDay(day, selectedDay) : false;
            const isToday_ = isToday(day);
            const intensity = hasExpenses ? Math.min(total / maxDayTotal, 1) : 0;

            return (
              <TouchableOpacity
                key={day.toISOString()}
                style={[
                  styles.dayCell,
                  isSelected && styles.dayCellSelected,
                  isToday_ && !isSelected && styles.dayCellToday,
                ]}
                onPress={() => setSelectedDay(day)}
                activeOpacity={0.7}
              >
                <Text style={[
                  styles.dayNumber,
                  isSelected && styles.dayNumberSelected,
                  isToday_ && !isSelected && { color: colors.primary },
                ]}>
                  {format(day, 'd')}
                </Text>

                {hasExpenses && (
                  <View style={styles.dayIndicator}>
                    <View
                      style={[
                        styles.dayDot,
                        {
                          backgroundColor: colors.danger,
                          opacity: 0.4 + intensity * 0.6,
                          width: 6 + intensity * 6,
                          height: 6 + intensity * 6,
                          borderRadius: (6 + intensity * 6) / 2,
                        },
                      ]}
                    />
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── Painel do Dia Selecionado ── */}
        {selectedDay && (
          <View style={[styles.dayPanel, shadows.md]}>
            <View style={styles.dayPanelHeader}>
              <Text style={styles.dayPanelDate}>
                {format(selectedDay, "EEEE, dd 'de' MMMM", { locale: ptBR })}
              </Text>
              {dayTotal > 0 && (
                <Text style={[styles.dayPanelTotal, { color: colors.danger }]}>
                  {formatCurrency(dayTotal)}
                </Text>
              )}
            </View>

            {dayExpenses.length === 0 ? (
              <View style={styles.noDayExpenses}>
                <Text style={styles.noDayText}>✅ Nenhum gasto neste dia</Text>
              </View>
            ) : (
              dayExpenses.map((e) => {
                const catColor = categoryColors[e.categoria] ?? colors.outros;
                return (
                  <View key={e.id} style={styles.expenseRow}>
                    <View style={[styles.expenseDot, { backgroundColor: catColor }]} />
                    <View style={styles.expenseInfo}>
                      <Text style={styles.expenseName}>{e.nome}</Text>
                      <Text style={styles.expenseMeta}>{e.categoria} · {e.origem === 'negocio' ? 'PJ' : 'PF'}</Text>
                    </View>
                    <Text style={[styles.expenseValue, { color: catColor }]}>
                      {formatCurrency(e.valor)}
                    </Text>
                  </View>
                );
              })
            )}
          </View>
        )}

        {/* ── Legenda ── */}
        <View style={styles.legendCard}>
          <Text style={styles.legendTitle}>Intensidade dos gastos</Text>
          <View style={styles.legendRow}>
            {[0.2, 0.4, 0.6, 0.8, 1].map((opacity) => (
              <View key={opacity} style={[styles.legendDot, { backgroundColor: colors.danger, opacity }]} />
            ))}
            <Text style={styles.legendText}> Maior gasto</Text>
          </View>
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { paddingHorizontal: spacing.md, paddingBottom: spacing.xl },
  header: { marginTop: spacing.md, marginBottom: spacing.md },
  title: { fontSize: fontSize.xxl, fontWeight: '800', color: colors.textPrimary },
  subtitle: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  monthArrow: { padding: spacing.sm },
  monthArrowText: { fontSize: 28, color: colors.primary, fontWeight: '300', lineHeight: 30 },
  monthLabel: { fontSize: fontSize.md, fontWeight: '700', color: colors.textPrimary, textTransform: 'capitalize' },
  weekRow: {
    flexDirection: 'row',
    marginBottom: spacing.xs,
  },
  weekDayCell: { width: DAY_SIZE, alignItems: 'center' },
  weekDayText: { fontSize: fontSize.xs, color: colors.textMuted, fontWeight: '600' },
  calGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  dayCell: {
    width: DAY_SIZE,
    height: DAY_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dayCellSelected: {
    backgroundColor: colors.primaryDim,
    borderColor: colors.primary,
  },
  dayCellToday: {
    borderColor: colors.primary,
  },
  dayNumber: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  dayNumberSelected: { color: colors.primary },
  dayIndicator: { position: 'absolute', bottom: 4 },
  dayDot: { borderRadius: 4 },
  dayPanel: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  dayPanelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dayPanelDate: { fontSize: fontSize.md, fontWeight: '700', color: colors.textPrimary, textTransform: 'capitalize', flex: 1 },
  dayPanelTotal: { fontSize: fontSize.lg, fontWeight: '800' },
  noDayExpenses: { paddingVertical: spacing.md, alignItems: 'center' },
  noDayText: { fontSize: fontSize.sm, color: colors.textSecondary },
  expenseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  expenseDot: { width: 10, height: 10, borderRadius: 5 },
  expenseInfo: { flex: 1 },
  expenseName: { fontSize: fontSize.sm, fontWeight: '600', color: colors.textPrimary },
  expenseMeta: { fontSize: fontSize.xs, color: colors.textMuted },
  expenseValue: { fontSize: fontSize.sm, fontWeight: '700' },
  legendCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.sm + 4,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  legendTitle: { fontSize: fontSize.xs, color: colors.textSecondary, fontWeight: '600', marginBottom: spacing.xs },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: fontSize.xs, color: colors.textMuted },
});
