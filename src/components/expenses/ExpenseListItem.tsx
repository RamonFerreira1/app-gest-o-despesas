import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Expense } from '../../types';
import { colors, spacing, fontSize, borderRadius, categoryColors, categoryIcons } from '../../theme';
import { formatCurrency } from '../../services/insightService';

interface Props {
  expense: Expense;
  compact?: boolean;
  onDelete?: () => void;
}

export default function ExpenseListItem({ expense, compact, onDelete }: Props) {
  const catColor = categoryColors[expense.categoria] ?? colors.outros;
  const catIcon = categoryIcons[expense.categoria] ?? 'ellipsis-horizontal';
  const origemColor = expense.origem === 'pessoal' ? colors.pessoal : colors.negocio;

  return (
    <View style={[styles.container, compact && styles.compact]}>
      <View style={[styles.iconWrap, { backgroundColor: catColor + '20' }]}>
        <Ionicons name={catIcon as any} size={18} color={catColor} />
      </View>

      <View style={styles.info}>
        <View style={styles.topRow}>
          <Text style={styles.nome} numberOfLines={1}>{expense.nome}</Text>
          <Text style={[styles.valor, { color: expense.valor > 0 ? colors.danger : colors.primary }]}>
            -{formatCurrency(expense.valor)}
          </Text>
        </View>
        <View style={styles.bottomRow}>
          <View style={[styles.badge, { backgroundColor: origemColor + '20' }]}>
            <Text style={[styles.badgeText, { color: origemColor }]}>
              {expense.origem === 'pessoal' ? 'Pessoal' : 'NR Brownies'}
            </Text>
          </View>
          <Text style={styles.categoria}>{expense.categoria}</Text>
          <Text style={styles.data}>{format(expense.data, 'dd/MM', { locale: ptBR })}</Text>
          {expense.tipo === 'recorrente' && expense.totalParcelas && (
            <View style={styles.recorrBadge}>
              <Ionicons name="repeat" size={10} color={colors.info} />
              <Text style={styles.recorrText}>{expense.parcelaNumero}/{expense.totalParcelas}</Text>
            </View>
          )}
        </View>
      </View>

      {onDelete && (
        <TouchableOpacity style={styles.deleteBtn} onPress={onDelete} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="trash-outline" size={16} color={colors.danger} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  compact: { padding: spacing.sm },
  iconWrap: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1, gap: 4 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  nome: { flex: 1, fontSize: fontSize.md, fontWeight: '600', color: colors.textPrimary, marginRight: spacing.sm },
  valor: { fontSize: fontSize.md, fontWeight: '700' },
  bottomRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: borderRadius.full },
  badgeText: { fontSize: 10, fontWeight: '700' },
  categoria: { fontSize: fontSize.xs, color: colors.textMuted },
  data: { fontSize: fontSize.xs, color: colors.textMuted, marginLeft: 'auto' },
  recorrBadge: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  recorrText: { fontSize: 10, color: colors.info, fontWeight: '600' },
  deleteBtn: { padding: 4 },
});
