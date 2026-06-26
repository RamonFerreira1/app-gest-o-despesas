import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Switch,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import CrossPlatformDatePicker from '../components/ui/CrossPlatformDatePicker';
import { format } from 'date-fns';

import { useAuthStore } from '../store/useAuthStore';
import { useExpenseStore } from '../store/useExpenseStore';
import { createExpense, createRecurringExpense } from '../services/expenseService';
import { colors, spacing, fontSize, borderRadius, shadows } from '../theme';
import { CATEGORIES, categoryColors, categoryIcons } from '../theme';
import { Expense, ExpenseCategory, ExpenseOrigin } from '../types';

export default function NewExpenseScreen({ navigation }: any) {
  const { user } = useAuthStore();
  const { addExpenseLocally, loadData } = useExpenseStore();

  const [nome, setNome] = useState('');
  const [valor, setValor] = useState('');
  const [categoria, setCategoria] = useState<ExpenseCategory>('Outros');
  const [data, setData] = useState(new Date());
  const [origem, setOrigem] = useState<ExpenseOrigin>('pessoal');
  const [isRecorrente, setIsRecorrente] = useState(false);
  const [parcelas, setParcelas] = useState('1');
  const [saving, setSaving] = useState(false);


  const valorNum = parseFloat(valor.replace(',', '.')) || 0;

  const handleSave = async () => {
    if (!nome.trim()) return Alert.alert('Atenção', 'Informe o nome da despesa.');
    if (valorNum <= 0) return Alert.alert('Atenção', 'Informe um valor válido.');
    if (!user) return;

    setSaving(true);
    try {
      const baseExpense = {
        nome: nome.trim(),
        valor: valorNum,
        categoria,
        data,
        origem,
        tipo: isRecorrente ? 'recorrente' : 'unica',
      } as const;

      if (isRecorrente) {
        const meses = parseInt(parcelas, 10) || 1;
        await createRecurringExpense(user.uid, { ...baseExpense, totalParcelas: meses, parcelasRestantes: meses }, meses);
        Alert.alert('✅ Sucesso', `${meses} parcelas registradas com sucesso!`);
      } else {
        const id = await createExpense(user.uid, baseExpense);
        const newExpense: Expense = {
          id,
          ...baseExpense,
          totalParcelas: null,
          parcelasRestantes: null,
          grupoRecorrenciaId: null,
          parcelaNumero: null,
          createdAt: new Date(),
        };
        addExpenseLocally(newExpense);
        Alert.alert('✅ Sucesso', 'Despesa registrada!');
      }

      // Reset form
      setNome('');
      setValor('');
      setCategoria('Outros');
      setOrigem('pessoal');
      setIsRecorrente(false);
      setParcelas('1');

      if (isRecorrente) await loadData(user.uid);
      navigation.navigate('Dashboard');
    } catch (e) {
      Alert.alert('Erro', 'Não foi possível salvar a despesa.');
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Nova Despesa</Text>
          <Text style={styles.subtitle}>Registre rapidamente</Text>
        </View>

        {/* Nome */}
        <View style={styles.field}>
          <Text style={styles.label}>Nome da Despesa</Text>
          <View style={styles.inputRow}>
            <Ionicons name="pencil-outline" size={18} color={colors.textMuted} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Ex: Almoço, Uber, Material..."
              placeholderTextColor={colors.textMuted}
              value={nome}
              onChangeText={setNome}
              returnKeyType="next"
            />
          </View>
        </View>

        {/* Valor */}
        <View style={styles.field}>
          <Text style={styles.label}>Valor (R$)</Text>
          <View style={styles.inputRow}>
            <Text style={[styles.inputIcon, { color: colors.primary, fontSize: 16, fontWeight: '700' }]}>R$</Text>
            <TextInput
              style={[styles.input, styles.valorInput]}
              placeholder="0,00"
              placeholderTextColor={colors.textMuted}
              value={valor}
              onChangeText={setValor}
              keyboardType="numeric"
              returnKeyType="done"
            />
          </View>
        </View>

        {/* Data */}
        <View style={styles.field}>
          <Text style={styles.label}>Data</Text>
          <View style={styles.inputRow}>
            <Ionicons name="calendar-outline" size={18} color={colors.textMuted} style={styles.inputIcon} />
            <CrossPlatformDatePicker
              value={data}
              onChange={setData}
              maximumDate={new Date()}
            />
          </View>
        </View>

        {/* Origem Toggle */}
        <View style={styles.field}>
          <Text style={styles.label}>Origem</Text>
          <View style={styles.toggleRow}>
            <TouchableOpacity
              style={[styles.toggleBtn, origem === 'pessoal' && styles.toggleBtnActivePessoal]}
              onPress={() => setOrigem('pessoal')}
            >
              <Ionicons name="person" size={16} color={origem === 'pessoal' ? colors.background : colors.textSecondary} />
              <Text style={[styles.toggleLabel, origem === 'pessoal' && styles.toggleLabelActive]}>Pessoal</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleBtn, origem === 'negocio' && styles.toggleBtnActiveNegocio]}
              onPress={() => setOrigem('negocio')}
            >
              <Ionicons name="storefront" size={16} color={origem === 'negocio' ? colors.background : colors.textSecondary} />
              <Text style={[styles.toggleLabel, origem === 'negocio' && styles.toggleLabelActive]}>NR Brownies</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Categoria */}
        <View style={styles.field}>
          <Text style={styles.label}>Categoria</Text>
          <View style={styles.categoriaGrid}>
            {CATEGORIES.map((cat) => {
              const isSelected = categoria === cat;
              const cor = categoryColors[cat];
              return (
                <TouchableOpacity
                  key={cat}
                  style={[styles.categoriaBtn, isSelected && { borderColor: cor, backgroundColor: cor + '25' }]}
                  onPress={() => setCategoria(cat as ExpenseCategory)}
                >
                  <Ionicons
                    name={categoryIcons[cat] as any}
                    size={18}
                    color={isSelected ? cor : colors.textMuted}
                  />
                  <Text style={[styles.categoriaLabel, isSelected && { color: cor }]}>{cat}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Recorrência */}
        <View style={styles.field}>
          <View style={styles.switchRow}>
            <View>
              <Text style={styles.label}>Despesa Recorrente / Parcelada</Text>
              <Text style={styles.switchSubtitle}>Projetar nos próximos meses</Text>
            </View>
            <Switch
              value={isRecorrente}
              onValueChange={setIsRecorrente}
              trackColor={{ false: colors.surfaceAlt, true: colors.primaryDim }}
              thumbColor={isRecorrente ? colors.primary : colors.textMuted}
            />
          </View>

          {isRecorrente && (
            <View style={[styles.inputRow, { marginTop: spacing.sm }]}>
              <Ionicons name="repeat" size={18} color={colors.primary} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Número de meses (ex: 12)"
                placeholderTextColor={colors.textMuted}
                value={parcelas}
                onChangeText={setParcelas}
                keyboardType="numeric"
                returnKeyType="done"
              />
            </View>
          )}
        </View>

        {/* Preview do valor */}
        {valorNum > 0 && (
          <View style={styles.preview}>
            <Text style={styles.previewLabel}>
              {isRecorrente
                ? `${parseInt(parcelas) || 1}x de R$ ${valor} = R$ ${(valorNum * (parseInt(parcelas) || 1)).toFixed(2).replace('.', ',')}`
                : `Total: R$ ${valor}`}
            </Text>
          </View>
        )}

        {/* Botão Salvar */}
        <TouchableOpacity
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.85}
        >
          {saving ? (
            <ActivityIndicator color={colors.background} />
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={22} color={colors.background} />
              <Text style={styles.saveBtnText}>Salvar Despesa</Text>
            </>
          )}
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { paddingHorizontal: spacing.md, paddingBottom: spacing.xl },
  header: { paddingVertical: spacing.lg },
  title: { fontSize: fontSize.xxl, fontWeight: '800', color: colors.textPrimary },
  subtitle: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 4 },
  field: { marginBottom: spacing.md },
  label: { fontSize: fontSize.sm, fontWeight: '600', color: colors.textSecondary, marginBottom: spacing.xs, textTransform: 'uppercase', letterSpacing: 0.5 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  inputIcon: { marginRight: spacing.sm },
  input: { flex: 1, fontSize: fontSize.md, color: colors.textPrimary },
  valorInput: { fontSize: fontSize.xl, fontWeight: '700', color: colors.primary },
  dateText: { flex: 1, fontSize: fontSize.md, color: colors.textPrimary },
  toggleRow: { flexDirection: 'row', gap: spacing.sm },
  toggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  toggleBtnActivePessoal: { backgroundColor: colors.pessoal, borderColor: colors.pessoal },
  toggleBtnActiveNegocio: { backgroundColor: colors.negocio, borderColor: colors.negocio },
  toggleLabel: { fontSize: fontSize.sm, fontWeight: '600', color: colors.textSecondary },
  toggleLabelActive: { color: colors.background },
  categoriaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  categoriaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: borderRadius.full,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  categoriaLabel: { fontSize: fontSize.xs, fontWeight: '600', color: colors.textMuted },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  switchSubtitle: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  preview: {
    backgroundColor: colors.primaryDim,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.primary + '40',
  },
  previewLabel: { fontSize: fontSize.md, color: colors.primary, fontWeight: '600', textAlign: 'center' },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    paddingVertical: 18,
    marginTop: spacing.md,
    ...shadows.md,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { fontSize: fontSize.lg, fontWeight: '700', color: colors.background },
});
