import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../store/useAuthStore';
import { useExpenseStore } from '../store/useExpenseStore';
import { getMonthlyReports, MonthlyReport } from '../services/reportsService';
import { formatCurrency } from '../services/insightService';
import { exportReportToPDF } from '../services/exportService';
import { colors, spacing, fontSize, borderRadius, shadows, categoryColors, categoryIcons } from '../theme';

const { width } = Dimensions.get('window');
const BAR_MAX_HEIGHT = 120;

type Period = 3 | 6 | 12;

export default function ReportsScreen() {
  const { user } = useAuthStore();
  const { summary, budget } = useExpenseStore();

  const [reports, setReports] = useState<MonthlyReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [period, setPeriod] = useState<Period>(6);
  const [activeTab, setActiveTab] = useState<'evolucao' | 'categorias' | 'pf_pj'>('evolucao');

  useEffect(() => {
    if (user?.uid) loadReports(period);
  }, [user?.uid, period]);

  const loadReports = async (p: Period) => {
    if (!user?.uid) return;
    setLoading(true);
    try {
      const data = await getMonthlyReports(user.uid, p);
      setReports(data);
    } catch (err) {
      console.error('Erro ao carregar relatórios:', err);
    } finally {
      setLoading(false);
    }
  };

  const maxTotal = Math.max(...reports.map((r) => r.total), 1);

  // Dados de categoria agregados do período
  const categoryTotals: Record<string, number> = {};
  reports.forEach((r) => {
    Object.entries(r.byCategory).forEach(([cat, val]) => {
      categoryTotals[cat] = (categoryTotals[cat] ?? 0) + val;
    });
  });
  const totalAll = Object.values(categoryTotals).reduce((a, b) => a + b, 0);
  const sortedCats = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]);

  const totalPFAll = reports.reduce((sum, r) => sum + r.totalPessoal, 0);
  const totalPJAll = reports.reduce((sum, r) => sum + r.totalNegocio, 0);
  const pctPF = totalAll > 0 ? (totalPFAll / (totalPFAll + totalPJAll)) * 100 : 50;

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportReportToPDF(reports, summary, budget);
    } catch {
      Alert.alert('Erro', 'Não foi possível gerar o relatório PDF.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

        {/* ── Header ── */}
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>📈 Relatórios</Text>
            <Text style={styles.subtitle}>Análise financeira inteligente</Text>
          </View>
          <TouchableOpacity
            style={[styles.exportBtn, exporting && { opacity: 0.6 }]}
            onPress={handleExport}
            disabled={exporting || reports.length === 0}
          >
            {exporting ? (
              <ActivityIndicator size="small" color="#000" />
            ) : (
              <Ionicons name="share-outline" size={18} color="#000" />
            )}
            <Text style={styles.exportBtnText}>{exporting ? 'Gerando...' : 'PDF'}</Text>
          </TouchableOpacity>
        </View>

        {/* ── Cards de Resumo do Mês ── */}
        {summary && (
          <View style={styles.summaryRow}>
            <View style={[styles.summaryCard, { borderColor: colors.primary }]}>
              <Text style={styles.summaryLabel}>Gasto Mensal</Text>
              <Text style={[styles.summaryValue, { color: colors.primary }]}>
                {formatCurrency(summary.totalGasto)}
              </Text>
            </View>
            <View style={[styles.summaryCard, { borderColor: colors.pessoal }]}>
              <Text style={styles.summaryLabel}>Pessoal (PF)</Text>
              <Text style={[styles.summaryValue, { color: colors.pessoal }]}>
                {formatCurrency(summary.totalPessoal)}
              </Text>
            </View>
            <View style={[styles.summaryCard, { borderColor: colors.negocio }]}>
              <Text style={styles.summaryLabel}>Negócio (PJ)</Text>
              <Text style={[styles.summaryValue, { color: colors.negocio }]}>
                {formatCurrency(summary.totalNegocio)}
              </Text>
            </View>
          </View>
        )}

        {/* ── Seletor de Período ── */}
        <View style={styles.periodRow}>
          {([3, 6, 12] as Period[]).map((p) => (
            <TouchableOpacity
              key={p}
              style={[styles.periodBtn, period === p && styles.periodBtnActive]}
              onPress={() => setPeriod(p)}
            >
              <Text style={[styles.periodBtnText, period === p && styles.periodBtnTextActive]}>
                {p} meses
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Tabs ── */}
        <View style={styles.tabsRow}>
          {(['evolucao', 'categorias', 'pf_pj'] as const).map((tab) => {
            const labels = { evolucao: '📊 Evolução', categorias: '🏷️ Categorias', pf_pj: '⚖️ PF vs PJ' };
            return (
              <TouchableOpacity
                key={tab}
                style={[styles.tabBtn, activeTab === tab && styles.tabBtnActive]}
                onPress={() => setActiveTab(tab)}
              >
                <Text style={[styles.tabBtnText, activeTab === tab && styles.tabBtnTextActive]}>
                  {labels[tab]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Analisando histórico...</Text>
          </View>
        ) : (
          <>
            {/* ── TAB: Evolução ── */}
            {activeTab === 'evolucao' && (
              <View style={[styles.card, shadows.md]}>
                <Text style={styles.cardTitle}>Total Gasto por Mês</Text>
                <View style={styles.barsContainer}>
                  {reports.map((r, i) => {
                    const barH = maxTotal > 0 ? (r.total / maxTotal) * BAR_MAX_HEIGHT : 4;
                    const isLast = i === reports.length - 1;
                    return (
                      <View key={r.monthKey} style={styles.barCol}>
                        <Text style={styles.barValue}>{formatCurrency(r.total, true)}</Text>
                        <View style={styles.barTrack}>
                          <View
                            style={[
                              styles.barFill,
                              {
                                height: Math.max(barH, 4),
                                backgroundColor: isLast ? colors.primary : colors.surfaceAlt,
                                borderColor: isLast ? colors.primary : colors.borderLight,
                              },
                            ]}
                          />
                        </View>
                        <Text style={[styles.barLabel, isLast && { color: colors.primary }]}>
                          {r.month.split(' ')[0]}
                        </Text>
                      </View>
                    );
                  })}
                </View>

                {/* PF vs PJ linha por mês */}
                <View style={styles.legendRow}>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: colors.pessoal }]} />
                    <Text style={styles.legendText}>Pessoal (PF)</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: colors.negocio }]} />
                    <Text style={styles.legendText}>NR Brownies (PJ)</Text>
                  </View>
                </View>
                <View style={styles.barsContainer}>
                  {reports.map((r, i) => {
                    const maxPFPJ = Math.max(r.totalPessoal, r.totalNegocio, 1);
                    return (
                      <View key={`pfpj-${r.monthKey}`} style={styles.barCol}>
                        <View style={styles.stackedBars}>
                          <View style={[styles.stackedBar, { height: (r.totalPessoal / maxPFPJ) * 60, backgroundColor: colors.pessoal }]} />
                          <View style={[styles.stackedBar, { height: (r.totalNegocio / maxPFPJ) * 60, backgroundColor: colors.negocio }]} />
                        </View>
                        <Text style={styles.barLabel}>{r.month.split(' ')[0]}</Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            {/* ── TAB: Categorias ── */}
            {activeTab === 'categorias' && (
              <View style={[styles.card, shadows.md]}>
                <Text style={styles.cardTitle}>Gastos por Categoria ({period} meses)</Text>
                {sortedCats.length === 0 ? (
                  <Text style={styles.emptyText}>Nenhum dado disponível</Text>
                ) : (
                  sortedCats.map(([cat, val]) => {
                    const pct = totalAll > 0 ? (val / totalAll) * 100 : 0;
                    const catColor = categoryColors[cat] ?? colors.outros;
                    const catIcon = categoryIcons[cat] ?? 'ellipsis-horizontal';
                    return (
                      <View key={cat} style={styles.catRow}>
                        <View style={[styles.catIcon, { backgroundColor: `${catColor}20` }]}>
                          <Ionicons name={catIcon as any} size={16} color={catColor} />
                        </View>
                        <View style={styles.catInfo}>
                          <View style={styles.catHeader}>
                            <Text style={styles.catName}>{cat}</Text>
                            <Text style={[styles.catValue, { color: catColor }]}>{formatCurrency(val)}</Text>
                          </View>
                          <View style={styles.catBarTrack}>
                            <View style={[styles.catBarFill, { width: `${pct}%`, backgroundColor: catColor }]} />
                          </View>
                          <Text style={styles.catPct}>{pct.toFixed(1)}% do total</Text>
                        </View>
                      </View>
                    );
                  })
                )}
              </View>
            )}

            {/* ── TAB: PF vs PJ ── */}
            {activeTab === 'pf_pj' && (
              <View style={[styles.card, shadows.md]}>
                <Text style={styles.cardTitle}>Pessoal vs. NR Brownies ({period} meses)</Text>

                {/* Barra de proporção */}
                <View style={styles.pfpjBarContainer}>
                  <View style={styles.pfpjBarTrack}>
                    <View style={[styles.pfpjBarPF, { flex: pctPF }]} />
                    <View style={[styles.pfpjBarPJ, { flex: 100 - pctPF }]} />
                  </View>
                  <View style={styles.pfpjLabels}>
                    <Text style={[styles.pfpjPct, { color: colors.pessoal }]}>{pctPF.toFixed(0)}%</Text>
                    <Text style={[styles.pfpjPct, { color: colors.negocio }]}>{(100 - pctPF).toFixed(0)}%</Text>
                  </View>
                </View>

                <View style={styles.pfpjTotals}>
                  <View style={[styles.pfpjTotalCard, { borderColor: colors.pessoal }]}>
                    <Ionicons name="person" size={20} color={colors.pessoal} />
                    <Text style={styles.pfpjTotalLabel}>Pessoal (PF)</Text>
                    <Text style={[styles.pfpjTotalValue, { color: colors.pessoal }]}>
                      {formatCurrency(totalPFAll)}
                    </Text>
                  </View>
                  <View style={[styles.pfpjTotalCard, { borderColor: colors.negocio }]}>
                    <Ionicons name="business" size={20} color={colors.negocio} />
                    <Text style={styles.pfpjTotalLabel}>NR Brownies (PJ)</Text>
                    <Text style={[styles.pfpjTotalValue, { color: colors.negocio }]}>
                      {formatCurrency(totalPJAll)}
                    </Text>
                  </View>
                </View>

                {/* Tabela por mês */}
                <Text style={styles.tableTitle}>Mês a Mês</Text>
                {reports.map((r) => (
                  <View key={r.monthKey} style={styles.tableRow}>
                    <Text style={styles.tableMonth}>{r.month}</Text>
                    <View style={styles.tableValues}>
                      <Text style={[styles.tableVal, { color: colors.pessoal }]}>
                        {formatCurrency(r.totalPessoal, true)}
                      </Text>
                      <Text style={[styles.tableVal, { color: colors.negocio }]}>
                        {formatCurrency(r.totalNegocio, true)}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </>
        )}

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
  summaryRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.sm,
    borderWidth: 1,
    alignItems: 'center',
    gap: 4,
  },
  summaryLabel: {
    fontSize: 9,
    color: colors.textSecondary,
    fontWeight: '600',
    textAlign: 'center',
  },
  summaryValue: {
    fontSize: fontSize.sm,
    fontWeight: '800',
  },
  periodRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  periodBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  periodBtnActive: {
    backgroundColor: colors.primaryDim,
    borderColor: colors.primary,
  },
  periodBtnText: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  periodBtnTextActive: {
    color: colors.primary,
  },
  tabsRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: spacing.sm - 2,
    borderRadius: borderRadius.md - 2,
    alignItems: 'center',
  },
  tabBtnActive: {
    backgroundColor: colors.surfaceAlt,
  },
  tabBtnText: {
    fontSize: 10,
    color: colors.textMuted,
    fontWeight: '600',
  },
  tabBtnTextActive: {
    color: colors.textPrimary,
  },
  loadingBox: {
    paddingVertical: 60,
    alignItems: 'center',
    gap: spacing.sm,
  },
  loadingText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
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
  barsContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.xs,
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  barCol: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  barValue: {
    fontSize: 8,
    color: colors.textMuted,
    textAlign: 'center',
  },
  barTrack: {
    width: '100%',
    height: BAR_MAX_HEIGHT,
    justifyContent: 'flex-end',
  },
  barFill: {
    width: '100%',
    borderRadius: borderRadius.sm,
    borderWidth: 1,
  },
  barLabel: {
    fontSize: 9,
    color: colors.textSecondary,
    textAlign: 'center',
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  legendRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
  stackedBars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
    height: 60,
  },
  stackedBar: {
    flex: 1,
    borderRadius: 3,
    minHeight: 2,
  },
  emptyText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
  catRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm + 4,
  },
  catIcon: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catInfo: {
    flex: 1,
    gap: 2,
  },
  catHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  catName: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  catValue: {
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  catBarTrack: {
    height: 5,
    backgroundColor: colors.surfaceAlt,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  catBarFill: {
    height: '100%',
    borderRadius: borderRadius.full,
  },
  catPct: {
    fontSize: 9,
    color: colors.textMuted,
  },
  pfpjBarContainer: {
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  pfpjBarTrack: {
    flexDirection: 'row',
    height: 24,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  pfpjBarPF: {
    backgroundColor: colors.pessoal,
  },
  pfpjBarPJ: {
    backgroundColor: colors.negocio,
  },
  pfpjLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  pfpjPct: {
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  pfpjTotals: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  pfpjTotalCard: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    borderRadius: borderRadius.lg,
    padding: spacing.sm + 4,
    alignItems: 'center',
    borderWidth: 1,
    gap: 4,
  },
  pfpjTotalLabel: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  pfpjTotalValue: {
    fontSize: fontSize.md,
    fontWeight: '800',
  },
  tableTitle: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
    marginTop: spacing.xs,
  },
  tableRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tableMonth: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textTransform: 'capitalize',
    fontWeight: '500',
    flex: 1,
  },
  tableValues: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  tableVal: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    minWidth: 70,
    textAlign: 'right',
  },
  exportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.xs + 4,
    borderRadius: borderRadius.lg,
  },
  exportBtnText: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: '#000',
  },
});
