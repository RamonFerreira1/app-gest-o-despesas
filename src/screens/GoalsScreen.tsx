import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Modal,
  Animated,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../store/useAuthStore';
import { formatCurrency } from '../services/insightService';
import {
  getGoals,
  createGoal,
  updateGoalProgress,
  deleteGoal,
  toggleGoalDone,
  GOAL_PRESETS,
} from '../services/goalsService';
import { Goal, GoalCategory } from '../types';
import { colors, spacing, fontSize, borderRadius, shadows } from '../theme';

function GoalProgressBar({ pct, cor }: { pct: number; cor: string }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: Math.min(pct, 100) / 100, duration: 800, useNativeDriver: false }).start();
  }, [pct]);
  return (
    <View style={styles.barTrack}>
      <Animated.View
        style={[
          styles.barFill,
          {
            backgroundColor: cor,
            width: anim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
          },
        ]}
      />
    </View>
  );
}

function GoalCard({
  goal,
  onAddValue,
  onDelete,
  onToggleDone,
}: {
  goal: Goal;
  onAddValue: (g: Goal) => void;
  onDelete: (id: string) => void;
  onToggleDone: (g: Goal) => void;
}) {
  const pct = goal.valorMeta > 0 ? (goal.valorAtual / goal.valorMeta) * 100 : 0;
  const prazoStr = goal.prazo
    ? new Date(goal.prazo).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })
    : null;

  return (
    <View style={[styles.goalCard, goal.concluida && styles.goalCardDone, { borderLeftColor: goal.cor }]}>
      <View style={styles.goalHeader}>
        <View style={styles.goalTitleRow}>
          <Text style={styles.goalEmoji}>{goal.emoji}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.goalName, goal.concluida && styles.doneText]}>{goal.nome}</Text>
            {prazoStr && <Text style={styles.goalPrazo}>⏰ Prazo: {prazoStr}</Text>}
          </View>
          {goal.concluida && (
            <View style={styles.doneBadge}>
              <Text style={styles.doneBadgeText}>✅ Concluída</Text>
            </View>
          )}
        </View>
      </View>

      <GoalProgressBar pct={pct} cor={goal.cor} />

      <View style={styles.goalValues}>
        <Text style={[styles.goalCurrent, { color: goal.cor }]}>{formatCurrency(goal.valorAtual)}</Text>
        <Text style={styles.goalTarget}>de {formatCurrency(goal.valorMeta)}</Text>
        <Text style={[styles.goalPct, { color: pct >= 100 ? '#00E676' : colors.textMuted }]}>
          {pct.toFixed(0)}%
        </Text>
      </View>

      {!goal.concluida && (
        <View style={styles.goalActions}>
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: `${goal.cor}20`, borderColor: goal.cor }]} onPress={() => onAddValue(goal)}>
            <Ionicons name="add-circle" size={16} color={goal.cor} />
            <Text style={[styles.actionBtnText, { color: goal.cor }]}>Adicionar</Text>
          </TouchableOpacity>
          {pct >= 100 && (
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#00E67620', borderColor: '#00E676' }]} onPress={() => onToggleDone(goal)}>
              <Ionicons name="checkmark-circle" size={16} color="#00E676" />
              <Text style={[styles.actionBtnText, { color: '#00E676' }]}>Marcar como concluída</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.deleteBtn} onPress={() => onDelete(goal.id)}>
            <Ionicons name="trash-outline" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

export default function GoalsScreen() {
  const { user } = useAuthStore();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showAddValueModal, setShowAddValueModal] = useState(false);
  const [selectedGoal, setSelectedGoal] = useState<Goal | null>(null);
  const [addValueInput, setAddValueInput] = useState('');

  // Form fields
  const [nome, setNome] = useState('');
  const [valorMeta, setValorMeta] = useState('');
  const [valorAtual, setValorAtual] = useState('');
  const [selectedPreset, setSelectedPreset] = useState(GOAL_PRESETS[0]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user?.uid) loadGoals();
  }, [user?.uid]);

  const loadGoals = async () => {
    if (!user?.uid) return;
    setLoading(true);
    try {
      const data = await getGoals(user.uid);
      setGoals(data);
    } catch (err) {
      console.error('Erro ao carregar metas:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    const meta = parseFloat(valorMeta.replace(',', '.'));
    const atual = parseFloat(valorAtual.replace(',', '.')) || 0;
    if (!nome.trim() || !meta || meta <= 0) {
      return Alert.alert('Atenção', 'Preencha o nome e o valor da meta!');
    }
    if (!user?.uid) return;
    setSaving(true);
    try {
      await createGoal(user.uid, {
        nome: nome.trim(),
        valorMeta: meta,
        valorAtual: atual,
        categoria: selectedPreset.categoria as GoalCategory,
        emoji: selectedPreset.emoji,
        cor: selectedPreset.cor,
      });
      setShowModal(false);
      setNome('');
      setValorMeta('');
      setValorAtual('');
      await loadGoals();
    } catch {
      Alert.alert('Erro', 'Não foi possível criar a meta.');
    } finally {
      setSaving(false);
    }
  };

  const handleAddValue = async () => {
    if (!selectedGoal || !user?.uid) return;
    const add = parseFloat(addValueInput.replace(',', '.'));
    if (!add || add <= 0) return Alert.alert('Atenção', 'Informe um valor válido!');
    const novoValor = selectedGoal.valorAtual + add;
    await updateGoalProgress(user.uid, selectedGoal.id, novoValor);
    setShowAddValueModal(false);
    setAddValueInput('');
    setSelectedGoal(null);
    await loadGoals();
  };

  const handleDelete = (id: string) => {
    Alert.alert('Excluir Meta', 'Deseja remover esta meta?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          if (!user?.uid) return;
          await deleteGoal(user.uid, id);
          await loadGoals();
        },
      },
    ]);
  };

  const handleToggleDone = async (g: Goal) => {
    if (!user?.uid) return;
    await toggleGoalDone(user.uid, g.id, !g.concluida);
    await loadGoals();
  };

  const activeGoals = goals.filter((g) => !g.concluida);
  const doneGoals = goals.filter((g) => g.concluida);
  const totalMeta = activeGoals.reduce((s, g) => s + g.valorMeta, 0);
  const totalAtual = activeGoals.reduce((s, g) => s + g.valorAtual, 0);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {/* ── Header ── */}
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>🎯 Metas Financeiras</Text>
            <Text style={styles.subtitle}>Objetivos e conquistas</Text>
          </View>
          <TouchableOpacity style={styles.addBtn} onPress={() => setShowModal(true)}>
            <Ionicons name="add" size={22} color="#000" />
          </TouchableOpacity>
        </View>

        {/* ── Resumo ── */}
        {activeGoals.length > 0 && (
          <View style={[styles.summaryCard, shadows.sm]}>
            <View style={styles.summaryRow}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Metas Ativas</Text>
                <Text style={styles.summaryValue}>{activeGoals.length}</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Total Acumulado</Text>
                <Text style={[styles.summaryValue, { color: colors.primary }]}>{formatCurrency(totalAtual, true)}</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Falta Juntar</Text>
                <Text style={[styles.summaryValue, { color: colors.warning }]}>{formatCurrency(totalMeta - totalAtual, true)}</Text>
              </View>
            </View>
          </View>
        )}

        {/* ── Lista de Metas ── */}
        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : activeGoals.length === 0 && doneGoals.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyEmoji}>🎯</Text>
            <Text style={styles.emptyTitle}>Nenhuma meta criada ainda</Text>
            <Text style={styles.emptySubtitle}>Defina um objetivo financeiro e acompanhe seu progresso!</Text>
            <TouchableOpacity style={styles.emptyBtn} onPress={() => setShowModal(true)}>
              <Text style={styles.emptyBtnText}>+ Criar primeira meta</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {activeGoals.map((g) => (
              <GoalCard
                key={g.id}
                goal={g}
                onAddValue={(goal) => { setSelectedGoal(goal); setShowAddValueModal(true); }}
                onDelete={handleDelete}
                onToggleDone={handleToggleDone}
              />
            ))}
            {doneGoals.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>🏆 Concluídas</Text>
                {doneGoals.map((g) => (
                  <GoalCard
                    key={g.id}
                    goal={g}
                    onAddValue={() => {}}
                    onDelete={handleDelete}
                    onToggleDone={handleToggleDone}
                  />
                ))}
              </>
            )}
          </>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* ── Modal: Criar Meta ── */}
      <Modal visible={showModal} transparent animationType="slide">
        <Pressable style={styles.modalOverlay} onPress={() => setShowModal(false)}>
          <Pressable style={styles.modalContent} onPress={() => {}}>
            <Text style={styles.modalTitle}>Nova Meta Financeira</Text>

            <Text style={styles.inputLabel}>Tipo da Meta</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.md }}>
              {GOAL_PRESETS.map((preset) => (
                <TouchableOpacity
                  key={preset.categoria}
                  style={[
                    styles.presetBtn,
                    selectedPreset.categoria === preset.categoria && { borderColor: preset.cor, backgroundColor: `${preset.cor}20` },
                  ]}
                  onPress={() => setSelectedPreset(preset)}
                >
                  <Text style={styles.presetEmoji}>{preset.emoji}</Text>
                  <Text style={[styles.presetLabel, selectedPreset.categoria === preset.categoria && { color: preset.cor }]}>
                    {preset.categoria}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.inputLabel}>Nome da Meta</Text>
            <TextInput
              style={styles.input}
              value={nome}
              onChangeText={setNome}
              placeholder={selectedPreset.sugestao}
              placeholderTextColor={colors.textMuted}
            />

            <Text style={styles.inputLabel}>Valor da Meta (R$)</Text>
            <TextInput
              style={styles.input}
              value={valorMeta}
              onChangeText={setValorMeta}
              keyboardType="numeric"
              placeholder="Ex: 5000"
              placeholderTextColor={colors.textMuted}
            />

            <Text style={styles.inputLabel}>Já tenho guardado (R$, opcional)</Text>
            <TextInput
              style={styles.input}
              value={valorAtual}
              onChangeText={setValorAtual}
              keyboardType="numeric"
              placeholder="Ex: 500"
              placeholderTextColor={colors.textMuted}
            />

            <TouchableOpacity style={[styles.saveBtn, { backgroundColor: selectedPreset.cor }]} onPress={handleCreate} disabled={saving}>
              {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.saveBtnText}>✅ Criar Meta</Text>}
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Modal: Adicionar Valor ── */}
      <Modal visible={showAddValueModal} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setShowAddValueModal(false)}>
          <Pressable style={[styles.modalContent, { paddingBottom: spacing.lg }]} onPress={() => {}}>
            <Text style={styles.modalTitle}>Adicionar Progresso</Text>
            {selectedGoal && (
              <Text style={styles.modalSubtitle}>
                {selectedGoal.emoji} {selectedGoal.nome} — {formatCurrency(selectedGoal.valorAtual)} de {formatCurrency(selectedGoal.valorMeta)}
              </Text>
            )}
            <Text style={styles.inputLabel}>Valor a adicionar (R$)</Text>
            <TextInput
              style={styles.input}
              value={addValueInput}
              onChangeText={setAddValueInput}
              keyboardType="numeric"
              placeholder="Ex: 200"
              placeholderTextColor={colors.textMuted}
              autoFocus
            />
            <TouchableOpacity style={[styles.saveBtn, { backgroundColor: selectedGoal?.cor ?? colors.primary }]} onPress={handleAddValue}>
              <Text style={styles.saveBtnText}>💰 Adicionar</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
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
  title: { fontSize: fontSize.xxl, fontWeight: '800', color: colors.textPrimary },
  subtitle: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  addBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  summaryCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  summaryRow: { flexDirection: 'row', alignItems: 'center' },
  summaryItem: { flex: 1, alignItems: 'center', gap: 2 },
  summaryDivider: { width: 1, height: 32, backgroundColor: colors.border },
  summaryLabel: { fontSize: fontSize.xs, color: colors.textSecondary, textAlign: 'center' },
  summaryValue: { fontSize: fontSize.md, fontWeight: '800', color: colors.textPrimary },
  loadingBox: { paddingVertical: 60, alignItems: 'center' },
  emptyBox: { alignItems: 'center', paddingVertical: spacing.xxl, gap: spacing.sm },
  emptyEmoji: { fontSize: 56 },
  emptyTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.textPrimary },
  emptySubtitle: { fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center' },
  emptyBtn: {
    marginTop: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 4,
  },
  emptyBtnText: { fontSize: fontSize.sm, fontWeight: '700', color: '#000' },
  sectionLabel: { fontSize: fontSize.md, fontWeight: '700', color: colors.textSecondary, marginTop: spacing.md, marginBottom: spacing.sm },
  goalCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderLeftWidth: 4,
  },
  goalCardDone: { opacity: 0.6 },
  goalHeader: { marginBottom: spacing.sm },
  goalTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  goalEmoji: { fontSize: 28 },
  goalName: { fontSize: fontSize.md, fontWeight: '700', color: colors.textPrimary },
  goalPrazo: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  doneText: { textDecorationLine: 'line-through' },
  doneBadge: {
    backgroundColor: '#00E67620',
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  doneBadgeText: { fontSize: fontSize.xs, color: '#00E676', fontWeight: '700' },
  barTrack: {
    height: 10,
    backgroundColor: colors.surfaceAlt,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
    marginBottom: spacing.sm,
  },
  barFill: { height: '100%', borderRadius: borderRadius.full },
  goalValues: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs, marginBottom: spacing.sm },
  goalCurrent: { fontSize: fontSize.lg, fontWeight: '800' },
  goalTarget: { fontSize: fontSize.sm, color: colors.textSecondary, flex: 1 },
  goalPct: { fontSize: fontSize.sm, fontWeight: '700' },
  goalActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  actionBtnText: { fontSize: fontSize.xs, fontWeight: '700' },
  deleteBtn: { marginLeft: 'auto' as any, padding: spacing.xs },
  modalOverlay: { flex: 1, backgroundColor: '#00000088', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    borderTopWidth: 1,
    borderColor: colors.borderLight,
  },
  modalTitle: { fontSize: fontSize.xl, fontWeight: '800', color: colors.textPrimary, marginBottom: spacing.sm },
  modalSubtitle: { fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.md },
  inputLabel: { fontSize: fontSize.sm, color: colors.textSecondary, fontWeight: '600', marginBottom: spacing.xs },
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
  presetBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    marginRight: spacing.sm,
    gap: 4,
  },
  presetEmoji: { fontSize: 22 },
  presetLabel: { fontSize: fontSize.xs, color: colors.textSecondary, fontWeight: '600' },
  saveBtn: {
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xs,
  },
  saveBtnText: { fontSize: fontSize.md, fontWeight: '700', color: '#fff' },
});
