import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  TextInput,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { format, subMonths, addMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useExpenseStore } from '../store/useExpenseStore';
import { useAuthStore } from '../store/useAuthStore';
import { deleteExpense, deleteRecurringGroup } from '../services/expenseService';
import { colors, spacing, fontSize, borderRadius } from '../theme';
import { Expense, ExpenseCategory, ExpenseOrigin } from '../types';
import { formatCurrency } from '../services/insightService';
import ExpenseListItem from '../components/expenses/ExpenseListItem';
import { CATEGORIES } from '../theme';

type FilterOrigin = 'all' | ExpenseOrigin;
type FilterCategory = 'all' | ExpenseCategory;

export default function HistoryScreen() {
  const { user } = useAuthStore();
  const { expenses, loadData, removeExpenseLocally, selectedMonth, setSelectedMonth } = useExpenseStore();

  const [filterOrigin, setFilterOrigin] = useState<FilterOrigin>('all');
  const [filterCategory, setFilterCategory] = useState<FilterCategory>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (user) loadData(user.uid, selectedMonth);
  }, [selectedMonth]);

  const filtered = expenses.filter((e) => {
    if (filterOrigin !== 'all' && e.origem !== filterOrigin) return false;
    if (filterCategory !== 'all' && e.categoria !== filterCategory) return false;
    if (search && !e.nome.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const total = filtered.reduce((sum, e) => sum + e.valor, 0);

  const handleDelete = (expense: Expense) => {
    if (Platform.OS === 'web') {
      const confirmMsg = expense.tipo === 'recorrente' 
        ? `Excluir "${expense.nome}"?\n\n(No navegador, todas as parcelas futuras também serão apagadas. Use o celular para excluir apenas uma parcela).` 
        : `Tem certeza que deseja excluir "${expense.nome}"?`;
      
      if (window.confirm(confirmMsg)) {
        if (expense.tipo === 'recorrente' && expense.grupoRecorrenciaId) {
          deleteRecurringGroup(user!.uid, expense.grupoRecorrenciaId, expense.data).then(() => {
            if (user) loadData(user.uid, selectedMonth);
          });
        } else {
          deleteExpense(user!.uid, expense.id).then(() => {
            removeExpenseLocally(expense.id);
          });
        }
      }
      return;
    }

    if (expense.tipo === 'recorrente' && expense.grupoRecorrenciaId) {
      Alert.alert(
        'Excluir Despesa Recorrente',
        'Deseja excluir apenas esta parcela ou todas as parcelas futuras?',
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Só esta',
            onPress: async () => {
              await deleteExpense(user!.uid, expense.id);
              removeExpenseLocally(expense.id);
            },
          },
          {
            text: 'Futuras',
            style: 'destructive',
            onPress: async () => {
              await deleteRecurringGroup(user!.uid, expense.grupoRecorrenciaId!, expense.data);
              if (user) loadData(user.uid, selectedMonth);
            },
          },
        ]
      );
    } else {
      Alert.alert('Excluir', `Excluir "${expense.nome}"?`, [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            await deleteExpense(user!.uid, expense.id);
            removeExpenseLocally(expense.id);
          },
        },
      ]);
    }
  };

  const navigateMonth = (dir: -1 | 1) => {
    const newMonth = dir === -1 ? subMonths(selectedMonth, 1) : addMonths(selectedMonth, 1);
    setSelectedMonth(newMonth);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Histórico</Text>
        <View style={styles.monthNav}>
          <TouchableOpacity onPress={() => navigateMonth(-1)} style={styles.navBtn}>
            <Ionicons name="chevron-back" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
          <Text style={styles.monthLabel}>
            {format(selectedMonth, 'MMMM yyyy', { locale: ptBR })}
          </Text>
          <TouchableOpacity onPress={() => navigateMonth(1)} style={styles.navBtn}>
            <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchRow}>
        <Ionicons name="search" size={16} color={colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Pesquisar..."
          placeholderTextColor={colors.textMuted}
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* Filters Origin */}
      <View style={styles.filtersRow}>
        {(['all', 'pessoal', 'negocio'] as FilterOrigin[]).map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.filterChip, filterOrigin === f && styles.filterChipActive]}
            onPress={() => setFilterOrigin(f)}
          >
            <Text style={[styles.filterChipText, filterOrigin === f && styles.filterChipTextActive]}>
              {f === 'all' ? 'Tudo' : f === 'pessoal' ? 'Pessoal' : 'NR Brownies'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* List */}
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <ExpenseListItem
            expense={item}
            onDelete={() => handleDelete(item)}
          />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="folder-open-outline" size={48} color={colors.textMuted} />
            <Text style={styles.emptyText}>Nenhuma despesa encontrada</Text>
          </View>
        }
        ListFooterComponent={
          filtered.length > 0 ? (
            <View style={styles.footer}>
              <Text style={styles.footerLabel}>{filtered.length} despesa(s)</Text>
              <Text style={styles.footerTotal}>{formatCurrency(total)}</Text>
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: spacing.md, paddingTop: spacing.md, marginBottom: spacing.sm },
  title: { fontSize: fontSize.xxl, fontWeight: '800', color: colors.textPrimary, marginBottom: spacing.sm },
  monthNav: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  navBtn: { padding: spacing.xs, backgroundColor: colors.surface, borderRadius: borderRadius.sm },
  monthLabel: { flex: 1, textAlign: 'center', fontSize: fontSize.md, fontWeight: '600', color: colors.textPrimary, textTransform: 'capitalize' },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: { flex: 1, fontSize: fontSize.md, color: colors.textPrimary },
  filtersRow: { flexDirection: 'row', paddingHorizontal: spacing.md, gap: spacing.sm, marginBottom: spacing.sm },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: { backgroundColor: colors.primaryDim, borderColor: colors.primary },
  filterChipText: { fontSize: fontSize.xs, fontWeight: '600', color: colors.textMuted },
  filterChipTextActive: { color: colors.primary },
  list: { paddingHorizontal: spacing.md, paddingBottom: spacing.xl },
  empty: { alignItems: 'center', paddingVertical: spacing.xxl, gap: spacing.sm },
  emptyText: { fontSize: fontSize.md, color: colors.textMuted },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: spacing.md,
  },
  footerLabel: { fontSize: fontSize.sm, color: colors.textSecondary },
  footerTotal: { fontSize: fontSize.md, fontWeight: '700', color: colors.textPrimary },
});
