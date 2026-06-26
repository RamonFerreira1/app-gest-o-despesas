import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../store/useAuthStore';
import { useExpenseStore } from '../store/useExpenseStore';
import { setBudget } from '../services/budgetService';
import { colors, spacing, fontSize, borderRadius, shadows } from '../theme';
import { formatCurrency } from '../services/insightService';

export default function SettingsScreen() {
  const { user, logout } = useAuthStore();
  const { budget, loadData } = useExpenseStore();

  const [limite, setLimite] = useState('');
  const [renda, setRenda] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (budget) {
      setLimite(budget.limite.toString());
      setRenda(budget.rendaMensal.toString());
    }
  }, [budget]);

  const handleSave = async () => {
    const limiteNum = parseFloat(limite.replace(',', '.'));
    const rendaNum = parseFloat(renda.replace(',', '.')) || 0;
    if (!limiteNum || limiteNum <= 0) return Alert.alert('Atenção', 'Informe um teto de gastos válido.');
    if (!user) return;

    setSaving(true);
    try {
      await setBudget(user.uid, new Date(), limiteNum, rendaNum);
      await loadData(user.uid);
      Alert.alert('✅ Salvo', 'Configurações atualizadas!');
    } catch (e) {
      Alert.alert('Erro', 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    Alert.alert('Sair', 'Tem certeza que deseja sair?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: logout },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>Configurações</Text>
          <Text style={styles.subtitle}>Personalize seu app financeiro</Text>
        </View>

        {/* Card Orçamento */}
        <View style={[styles.card, shadows.sm]}>
          <View style={styles.cardHeader}>
            <View style={[styles.cardIcon, { backgroundColor: colors.primaryDim }]}>
              <Ionicons name="wallet" size={20} color={colors.primary} />
            </View>
            <Text style={styles.cardTitle}>Orçamento Mensal</Text>
          </View>

          <Text style={styles.label}>Teto de Gastos (R$)</Text>
          <View style={styles.inputRow}>
            <Text style={styles.currencyPrefix}>R$</Text>
            <TextInput
              style={styles.input}
              placeholder="3000,00"
              placeholderTextColor={colors.textMuted}
              value={limite}
              onChangeText={setLimite}
              keyboardType="numeric"
            />
          </View>

          <Text style={[styles.label, { marginTop: spacing.md }]}>Renda Mensal (R$)</Text>
          <Text style={styles.hint}>Usado para calcular sugestão de reserva</Text>
          <View style={styles.inputRow}>
            <Text style={styles.currencyPrefix}>R$</Text>
            <TextInput
              style={styles.input}
              placeholder="0,00"
              placeholderTextColor={colors.textMuted}
              value={renda}
              onChangeText={setRenda}
              keyboardType="numeric"
            />
          </View>

          {budget && (
            <View style={styles.currentValues}>
              <Text style={styles.currentLabel}>
                Atual: <Text style={styles.currentValue}>{formatCurrency(budget.limite)}</Text>
              </Text>
              {budget.rendaMensal > 0 && (
                <Text style={styles.currentLabel}>
                  Renda: <Text style={styles.currentValue}>{formatCurrency(budget.rendaMensal)}</Text>
                </Text>
              )}
            </View>
          )}

          <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving} activeOpacity={0.85}>
            {saving ? (
              <ActivityIndicator color={colors.background} />
            ) : (
              <>
                <Ionicons name="save-outline" size={18} color={colors.background} />
                <Text style={styles.saveBtnText}>Salvar Configurações</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Card Conta */}
        <View style={[styles.card, shadows.sm]}>
          <View style={styles.cardHeader}>
            <View style={[styles.cardIcon, { backgroundColor: colors.infoDim }]}>
              <Ionicons name="person-circle" size={20} color={colors.info} />
            </View>
            <Text style={styles.cardTitle}>Conta</Text>
          </View>
          <View style={styles.accountRow}>
            <Ionicons name="mail-outline" size={16} color={colors.textMuted} />
            <Text style={styles.accountEmail}>{user?.email}</Text>
          </View>
          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
            <Ionicons name="log-out-outline" size={18} color={colors.danger} />
            <Text style={styles.logoutText}>Sair da Conta</Text>
          </TouchableOpacity>
        </View>

        {/* Info */}
        <View style={styles.infoBox}>
          <Text style={styles.infoText}>NR Finance v1.0</Text>
          <Text style={styles.infoText}>Gestão de Despesas Inteligente</Text>
          <Text style={styles.infoSub}>NR Brownies e Bolos</Text>
        </View>

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
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.lg },
  cardIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.textPrimary },
  label: { fontSize: fontSize.xs, fontWeight: '600', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing.xs },
  hint: { fontSize: fontSize.xs, color: colors.textMuted, marginBottom: spacing.sm, marginTop: -4 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  currencyPrefix: { fontSize: fontSize.md, fontWeight: '700', color: colors.primary, marginRight: spacing.sm },
  input: { flex: 1, fontSize: fontSize.md, color: colors.textPrimary },
  currentValues: { marginTop: spacing.md, gap: 4 },
  currentLabel: { fontSize: fontSize.sm, color: colors.textMuted },
  currentValue: { color: colors.textPrimary, fontWeight: '600' },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: 14,
    marginTop: spacing.lg,
  },
  saveBtnText: { fontSize: fontSize.md, fontWeight: '700', color: colors.background },
  accountRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  accountEmail: { fontSize: fontSize.md, color: colors.textSecondary },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: borderRadius.md,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.danger + '40',
    backgroundColor: colors.dangerDim,
  },
  logoutText: { fontSize: fontSize.md, fontWeight: '600', color: colors.danger },
  infoBox: { alignItems: 'center', gap: 4, paddingVertical: spacing.lg },
  infoText: { fontSize: fontSize.sm, color: colors.textMuted, fontWeight: '500' },
  infoSub: { fontSize: fontSize.xs, color: colors.textMuted },
});
