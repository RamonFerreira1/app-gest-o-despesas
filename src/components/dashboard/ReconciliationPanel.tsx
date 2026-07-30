import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PendingTransaction, ExpenseCategory, ExpenseOrigin } from '../../types';
import { colors, spacing, borderRadius, fontSize, CATEGORIES, categoryColors } from '../../theme';

interface ReconciliationPanelProps {
  pendingTransactions: PendingTransaction[];
  onApprove: (
    pendingTx: PendingTransaction,
    category: ExpenseCategory,
    origin: ExpenseOrigin
  ) => Promise<void>;
  onIgnore: (pendingTxId: string) => Promise<void>;
  onRefresh?: () => void;
}

export const ReconciliationPanel: React.FC<ReconciliationPanelProps> = ({
  pendingTransactions,
  onApprove,
  onIgnore,
  onRefresh,
}) => {
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [editingCategory, setEditingCategory] = useState<Record<string, ExpenseCategory>>({});
  const [editingOrigin, setEditingOrigin] = useState<Record<string, ExpenseOrigin>>({});

  if (!pendingTransactions || pendingTransactions.length === 0) {
    return null;
  }

  const formatCurrency = (val: number) =>
    val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
    });
  };

  const handleApproveClick = async (tx: PendingTransaction) => {
    try {
      setLoadingId(tx.id);
      const cat = editingCategory[tx.id] || tx.suggestedCategory;
      const orig = editingOrigin[tx.id] || tx.suggestedOrigin;
      await onApprove(tx, cat, orig);
    } catch (err) {
      console.error('Erro ao aprovar conciliação:', err);
    } finally {
      setLoadingId(null);
    }
  };

  const handleIgnoreClick = async (id: string) => {
    try {
      setLoadingId(id);
      await onIgnore(id);
    } catch (err) {
      console.error('Erro ao descartar conciliação:', err);
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <View style={styles.container}>
      {/* Banner Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.alertIconBg}>
            <Ionicons name="card-outline" size={20} color={colors.warning} />
          </View>
          <View>
            <Text style={styles.headerTitle}>Conciliação Inteligente</Text>
            <Text style={styles.headerSub}>
              ⚠️ Você possui {pendingTransactions.length} movimentaç{pendingTransactions.length === 1 ? 'ão' : 'ões'} no banco que ainda não foi{pendingTransactions.length === 1 ? '' : 'ram'} registrada{pendingTransactions.length === 1 ? '' : 's'}.
            </Text>
          </View>
        </View>

        {onRefresh && (
          <TouchableOpacity style={styles.refreshBtn} onPress={onRefresh}>
            <Ionicons name="sync-outline" size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Cards de Lançamentos Pendentes */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {pendingTransactions.map((tx) => {
          const selectedCategory = editingCategory[tx.id] || tx.suggestedCategory;
          const selectedOrigin = editingOrigin[tx.id] || tx.suggestedOrigin;
          const isLoading = loadingId === tx.id;

          return (
            <View key={tx.id} style={styles.card}>
              {/* Card Header */}
              <View style={styles.cardHeader}>
                <View style={styles.bankTag}>
                  <Ionicons name="business-outline" size={14} color={colors.info} />
                  <Text style={styles.bankText}>{tx.bankName}</Text>
                </View>
                <Text style={styles.dateText}>{formatDate(tx.date)}</Text>
              </View>

              {/* Descrição & Valor */}
              <Text style={styles.descText} numberOfLines={2}>
                {tx.description}
              </Text>
              <Text style={styles.amountText}>{formatCurrency(tx.amount)}</Text>

              {/* Seleção de Origem (PF / PJ) */}
              <View style={styles.selectorRow}>
                <Text style={styles.label}>Origem:</Text>
                <View style={styles.pillsRow}>
                  <TouchableOpacity
                    style={[
                      styles.pill,
                      selectedOrigin === 'pessoal' && styles.pillPessoalActive,
                    ]}
                    onPress={() => setEditingOrigin({ ...editingOrigin, [tx.id]: 'pessoal' })}
                  >
                    <Text
                      style={[
                        styles.pillText,
                        selectedOrigin === 'pessoal' && styles.pillTextActive,
                      ]}
                    >
                      PF (Pessoal)
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.pill,
                      selectedOrigin === 'negocio' && styles.pillNegocioActive,
                    ]}
                    onPress={() => setEditingOrigin({ ...editingOrigin, [tx.id]: 'negocio' })}
                  >
                    <Text
                      style={[
                        styles.pillText,
                        selectedOrigin === 'negocio' && styles.pillTextActive,
                      ]}
                    >
                      PJ (Negócio)
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Seleção de Categoria */}
              <View style={styles.selectorRow}>
                <Text style={styles.label}>Categoria:</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
                  <View style={styles.categoriesRow}>
                    {CATEGORIES.map((cat) => {
                      const isCatSelected = selectedCategory === cat;
                      const catColor = categoryColors[cat] || colors.outros;
                      return (
                        <TouchableOpacity
                          key={cat}
                          style={[
                            styles.catPill,
                            isCatSelected && { backgroundColor: `${catColor}30`, borderColor: catColor },
                          ]}
                          onPress={() =>
                            setEditingCategory({ ...editingCategory, [tx.id]: cat as ExpenseCategory })
                          }
                        >
                          <Text
                            style={[
                              styles.catPillText,
                              isCatSelected && { color: catColor, fontWeight: '700' },
                            ]}
                          >
                            {cat}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </ScrollView>
              </View>

              {/* Ações: Aprovar / Descartar */}
              <View style={styles.actionsRow}>
                <TouchableOpacity
                  style={styles.ignoreButton}
                  onPress={() => handleIgnoreClick(tx.id)}
                  disabled={isLoading}
                >
                  <Ionicons name="trash-outline" size={16} color={colors.textSecondary} />
                  <Text style={styles.ignoreText}>Ignorar</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.approveButton}
                  onPress={() => handleApproveClick(tx)}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <ActivityIndicator size="small" color="#000" />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle" size={18} color="#000" style={{ marginRight: 4 }} />
                      <Text style={styles.approveText}>Aprovar Lançamento</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: `${colors.warning}40`,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  alertIconBg: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.warningDim,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.sm,
  },
  headerTitle: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  headerSub: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  refreshBtn: {
    padding: spacing.xs,
  },
  scrollContent: {
    paddingVertical: spacing.xs,
    gap: spacing.sm,
  },
  card: {
    width: 300,
    backgroundColor: colors.surfaceAlt,
    borderRadius: borderRadius.md,
    padding: spacing.sm + 4,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: spacing.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  bankTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: `${colors.info}20`,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  bankText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.info,
    marginLeft: 4,
  },
  dateText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  descText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textPrimary,
    marginVertical: 4,
    height: 36,
  },
  amountText: {
    fontSize: fontSize.lg,
    fontWeight: '800',
    color: colors.primary,
    marginBottom: spacing.sm,
  },
  selectorRow: {
    marginBottom: spacing.xs + 2,
  },
  label: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  pillsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  pill: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surface,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  pillPessoalActive: {
    backgroundColor: `${colors.pessoal}30`,
    borderColor: colors.pessoal,
  },
  pillNegocioActive: {
    backgroundColor: `${colors.negocio}30`,
    borderColor: colors.negocio,
  },
  pillText: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
  pillTextActive: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  categoriesRow: {
    flexDirection: 'row',
    gap: 4,
  },
  catPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  catPillText: {
    fontSize: 10,
    color: colors.textSecondary,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  ignoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  ignoreText: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginLeft: 4,
  },
  approveButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.primary,
  },
  approveText: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: '#000',
  },
});
