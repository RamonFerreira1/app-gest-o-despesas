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
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../store/useAuthStore';
import { useExpenseStore } from '../store/useExpenseStore';
import { setBudget } from '../services/budgetService';
import { colors, spacing, fontSize, borderRadius, shadows } from '../theme';
import { formatCurrency } from '../services/insightService';
import { PluggyConnectModal } from '../components/pluggy/PluggyConnectModal';
import { BelvoConnectModal } from '../components/belvo/BelvoConnectModal';
import {
  getUserPluggyItems,
  getUserPluggyAccounts,
  updateUserPluggyAccountOrigin,
  deleteUserPluggyItem,
} from '../services/pluggyService';
import { syncPluggyTransactions } from '../services/reconciliationService';
import { PluggyItem, PluggyAccount, ExpenseOrigin } from '../types';
import { getCustomGeminiKey, setCustomGeminiKey } from '../services/aiConfigService';

export default function SettingsScreen() {
  const { user, logout } = useAuthStore();
  const { budget, loadData } = useExpenseStore();

  const [limite, setLimite] = useState('');
  const [renda, setRenda] = useState('');
  const [valorReservadoInput, setValorReservadoInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  // Estados Open Finance / Pluggy / Belvo
  const [showPluggyModal, setShowPluggyModal] = useState(false);
  const [showBelvoModal, setShowBelvoModal] = useState(false);
  const [pluggyItems, setPluggyItems] = useState<PluggyItem[]>([]);
  const [pluggyAccounts, setPluggyAccounts] = useState<PluggyAccount[]>([]);
  const [loadingPluggy, setLoadingPluggy] = useState(false);
  const [syncingItemId, setSyncingItemId] = useState<string | null>(null);
  const [syncDaysBack, setSyncDaysBack] = useState<number>(30); // 0 = Apenas após conectar, 15, 30, 60, 90

  // Estado IA Gemini Key
  const [geminiKey, setGeminiKey] = useState('');
  const [keySavedMsg, setKeySavedMsg] = useState<string | null>(null);
  const [keyErrorMsg, setKeyErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    setGeminiKey(getCustomGeminiKey());
  }, []);

  const handleSaveGeminiKey = () => {
    const trimmed = geminiKey.trim();
    setKeySavedMsg(null);
    setKeyErrorMsg(null);

    if (trimmed && trimmed.length < 15) {
      setKeyErrorMsg('⚠️ Informe uma chave de API válida do Google AI Studio.');
      return;
    }

    setCustomGeminiKey(trimmed);
    setKeySavedMsg(trimmed ? '✅ Chave do Gemini salva com sucesso! IA Ativada.' : 'ℹ️ Chave removida. Usando motor semântico local.');
    setTimeout(() => setKeySavedMsg(null), 4000);
  };

  useEffect(() => {
    if (budget) {
      setLimite(budget.limite.toString());
      setRenda(budget.rendaMensal.toString());
      setValorReservadoInput((budget.valorReservado ?? 0).toString());
    }
  }, [budget]);

  useEffect(() => {
    if (user?.uid) {
      loadPluggyData();
    }
  }, [user?.uid]);

  const loadPluggyData = async () => {
    if (!user?.uid) return;
    try {
      setLoadingPluggy(true);
      const items = await getUserPluggyItems(user.uid);
      const accounts = await getUserPluggyAccounts(user.uid);
      setPluggyItems(items);
      setPluggyAccounts(accounts);
    } catch (err) {
      console.error('Erro ao carregar dados do Pluggy:', err);
    } finally {
      setLoadingPluggy(false);
    }
  };

  const handleSave = async () => {
    const limiteNum = parseFloat(limite.replace(',', '.'));
    const rendaNum = parseFloat(renda.replace(',', '.')) || 0;
    const valorReservadoNum = parseFloat(valorReservadoInput.replace(',', '.')) || 0;
    if (!limiteNum || limiteNum <= 0) return Alert.alert('Atenção', 'Informe um teto de gastos válido.');
    if (!user) return;

    setSaving(true);
    try {
      await setBudget(user.uid, new Date(), limiteNum, rendaNum, valorReservadoNum);
      await loadData(user.uid);
      Alert.alert('✅ Salvo', 'Configurações atualizadas!');
    } catch (e) {
      Alert.alert('Erro', 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  };

  const handleOriginToggle = async (account: PluggyAccount, newOrigin: ExpenseOrigin) => {
    if (!user?.uid) return;
    try {
      await updateUserPluggyAccountOrigin(user.uid, account.id, newOrigin);
      setPluggyAccounts((prev) =>
        prev.map((a) => (a.id === account.id ? { ...a, origemDefault: newOrigin } : a))
      );
    } catch (err) {
      Alert.alert('Erro', 'Não foi possível atualizar a classificação da conta.');
    }
  };

  const handleSyncItem = async (itemId: string) => {
    if (!user?.uid) return;
    try {
      setSyncingItemId(itemId);
      const newTxs = await syncPluggyTransactions(user.uid, itemId, syncDaysBack);
      Alert.alert(
        'Sincronização Concluída',
        newTxs > 0
          ? `Foram encontradas ${newTxs} novas movimentações para conciliação!`
          : 'Sua conta já está atualizada com os lançamentos mais recentes.'
      );
    } catch (err) {
      Alert.alert('Erro', 'Falha ao sincronizar extrato da instituição.');
    } finally {
      setSyncingItemId(null);
    }
  };

  const handleDeleteItem = async (itemId: string, connectorName: string) => {
    if (!user?.uid) return;
    Alert.alert(
      'Remover Conexão Bancária',
      `Deseja desconectar a conta de ${connectorName}? As movimentações já conciladas continuarão salvas.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Desconectar',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteUserPluggyItem(user.uid, itemId);
              await loadPluggyData();
            } catch (err) {
              Alert.alert('Erro', 'Não foi possível remover a conexão.');
            }
          },
        },
      ]
    );
  };

  const handlePluggySuccess = async (itemId: string, count: number) => {
    await loadPluggyData();
    Alert.alert(
      '🎉 Banco Conectado!',
      count > 0
        ? `Sua conta foi vinculada e ${count} movimentações foram enviadas para a tela inicial para conciliação!`
        : 'Sua conta bancária foi conectada com sucesso!'
    );
  };

  const confirmLogout = () => {
    setShowLogoutModal(false);
    logout();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>Configurações</Text>
          <Text style={styles.subtitle}>Personalize seu app financeiro</Text>
        </View>

        {/* Card Open Finance (Pluggy) */}
        <View style={[styles.card, shadows.sm]}>
          <View style={styles.cardHeader}>
            <View style={[styles.cardIcon, { backgroundColor: `${colors.info}20` }]}>
              <Ionicons name="card" size={20} color={colors.info} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>Conexões Open Finance</Text>
              <Text style={styles.hint}>Conecte suas contas de banco para sincronização automática</Text>
            </View>
          </View>

          {/* Seletor de Período Retroativo */}
          <Text style={[styles.label, { marginTop: spacing.sm }]}>Histórico de Busca na Sincronização</Text>
          <Text style={[styles.hint, { marginBottom: 8 }]}>Defina se deseja buscar apenas gastos recentes ou histórico anterior</Text>
          <View style={styles.periodRow}>
            {[
              { label: 'Apenas Hoje', days: 0 },
              { label: '15 Dias', days: 15 },
              { label: '30 Dias', days: 30 },
              { label: '60 Dias', days: 60 },
            ].map((p) => (
              <TouchableOpacity
                key={p.days}
                style={[
                  styles.periodChip,
                  syncDaysBack === p.days && styles.periodChipActive,
                ]}
                onPress={() => setSyncDaysBack(p.days)}
              >
                <Text
                  style={[
                    styles.periodChipText,
                    syncDaysBack === p.days && styles.periodChipTextActive,
                  ]}
                >
                  {p.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={styles.connectPluggyBtn}
            onPress={() => setShowPluggyModal(true)}
            activeOpacity={0.85}
          >
            <Ionicons name="add-circle-outline" size={20} color="#000" />
            <Text style={styles.connectPluggyText}>Conectar via Pluggy (Open Finance)</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.connectPluggyBtn, { backgroundColor: '#009EE3', marginTop: 8 }]}
            onPress={() => setShowBelvoModal(true)}
            activeOpacity={0.85}
          >
            <Ionicons name="shield-checkmark-outline" size={20} color="#FFF" />
            <Text style={[styles.connectPluggyText, { color: '#FFF' }]}>Conectar via Belvo Open Finance</Text>
          </TouchableOpacity>

          {loadingPluggy ? (
            <ActivityIndicator style={{ marginVertical: spacing.md }} color={colors.primary} />
          ) : pluggyItems.length > 0 ? (
            <View style={styles.accountsSection}>
              <Text style={styles.subSectionTitle}>Contas Conectadas & Mapeamento PF/PJ</Text>

              {pluggyItems.map((item) => {
                const accountsOfItem = pluggyAccounts.filter((a) => a.itemId === item.id);
                const isSyncing = syncingItemId === item.id;

                return (
                  <View key={item.id} style={styles.itemBox}>
                    <View style={styles.itemHeader}>
                      <View style={styles.itemHeaderLeft}>
                        <Ionicons name="business" size={18} color={colors.primary} />
                        <Text style={styles.itemTitle}>{item.connectorName}</Text>
                      </View>
                      <View style={styles.itemActions}>
                        <TouchableOpacity
                          style={styles.iconBtn}
                          onPress={() => handleSyncItem(item.id)}
                          disabled={isSyncing}
                        >
                          {isSyncing ? (
                            <ActivityIndicator size="small" color={colors.info} />
                          ) : (
                            <Ionicons name="sync-outline" size={18} color={colors.info} />
                          )}
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.iconBtn}
                          onPress={() => handleDeleteItem(item.id, item.connectorName)}
                        >
                          <Ionicons name="trash-outline" size={18} color={colors.danger} />
                        </TouchableOpacity>
                      </View>
                    </View>

                    {accountsOfItem.map((acc) => (
                      <View key={acc.id} style={styles.accRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.accName}>{acc.name}</Text>
                          <Text style={styles.accSub}>
                            Saldo: {formatCurrency(acc.balance)}
                          </Text>
                        </View>

                        {/* Selector Pessoal (PF) vs Negócio (PJ) */}
                        <View style={styles.toggleRow}>
                          <TouchableOpacity
                            style={[
                              styles.toggleBtn,
                              acc.origemDefault === 'pessoal' && styles.toggleBtnPessoalActive,
                            ]}
                            onPress={() => handleOriginToggle(acc, 'pessoal')}
                          >
                            <Text
                              style={[
                                styles.toggleText,
                                acc.origemDefault === 'pessoal' && styles.toggleTextActive,
                              ]}
                            >
                              PF
                            </Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={[
                              styles.toggleBtn,
                              acc.origemDefault === 'negocio' && styles.toggleBtnNegocioActive,
                            ]}
                            onPress={() => handleOriginToggle(acc, 'negocio')}
                          >
                            <Text
                              style={[
                                styles.toggleText,
                                acc.origemDefault === 'negocio' && styles.toggleTextActive,
                              ]}
                            >
                              PJ
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))}
                  </View>
                );
              })}
            </View>
          ) : (
            <Text style={styles.noConnsText}>Nenhuma conta bancária conectada no momento.</Text>
          )}
        </View>

        {/* Card Inteligência Artificial (IA Chat) */}
        <View style={[styles.card, shadows.sm]}>
          <View style={styles.cardHeader}>
            <View style={[styles.cardIcon, { backgroundColor: `${colors.primary}20` }]}>
              <Ionicons name="sparkles" size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>Inteligência Artificial (IA Chat)</Text>
              <Text style={styles.hint}>
                {geminiKey ? '✨ Conectado à IA Real do Google Gemini' : '⚡ Motor Semântico Local Ativo'}
              </Text>
            </View>
          </View>

          <Text style={styles.label}>Chave da API do Google Gemini (opcional)</Text>
          <View style={styles.inputRow}>
            <Ionicons name="key-outline" size={18} color={colors.textMuted} style={{ marginRight: 8 }} />
            <TextInput
              style={styles.input}
              value={geminiKey}
              onChangeText={setGeminiKey}
              placeholder="Cole sua API Key (ex: AIzaSy...)"
              placeholderTextColor={colors.textMuted}
              secureTextEntry
            />
          </View>
          <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 4, marginBottom: 12 }}>
            💡 Obtenha uma chave 100% gratuita em <Text style={{ color: colors.primary }}>aistudio.google.com</Text> para ativar a IA do Gemini igual ao ChatGPT!
          </Text>

          {keyErrorMsg && (
            <View style={{ backgroundColor: '#FF4D4D20', borderColor: '#FF4D4D', borderWidth: 1, borderRadius: borderRadius.md, padding: 10, marginBottom: 12 }}>
              <Text style={{ fontSize: 12, color: '#FF4D4D', lineHeight: 16 }}>{keyErrorMsg}</Text>
            </View>
          )}

          {keySavedMsg && (
            <View style={{ backgroundColor: '#00E67620', borderColor: '#00E676', borderWidth: 1, borderRadius: borderRadius.md, padding: 10, marginBottom: 12 }}>
              <Text style={{ fontSize: 12, color: '#00E676', fontWeight: '700' }}>{keySavedMsg}</Text>
            </View>
          )}

          <TouchableOpacity style={styles.saveKeyBtn} onPress={handleSaveGeminiKey}>
            <Ionicons name="save-outline" size={18} color="#000" />
            <Text style={styles.saveKeyBtnText}>Salvar Chave da IA</Text>
          </TouchableOpacity>
        </View>

        {/* Card Orçamento & Reserva */}
        <View style={[styles.card, shadows.sm]}>
          <View style={styles.cardHeader}>
            <View style={[styles.cardIcon, { backgroundColor: colors.primaryDim }]}>
              <Ionicons name="wallet" size={20} color={colors.primary} />
            </View>
            <Text style={styles.cardTitle}>Orçamento & Reserva</Text>
          </View>

          <Text style={styles.label}>Teto de Gastos Mensais (R$)</Text>
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

          <Text style={[styles.label, { marginTop: spacing.md }]}>Valor Reservado Total (R$)</Text>
          <Text style={styles.hint}>Dinheiro guardado para amortizações ou emergências</Text>
          <View style={styles.inputRow}>
            <Text style={[styles.currencyPrefix, { color: '#C77DFF' }]}>R$</Text>
            <TextInput
              style={styles.input}
              placeholder="0,00"
              placeholderTextColor={colors.textMuted}
              value={valorReservadoInput}
              onChangeText={setValorReservadoInput}
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
                Teto Atual: <Text style={styles.currentValue}>{formatCurrency(budget.limite)}</Text>
              </Text>
              <Text style={styles.currentLabel}>
                Valor Reservado: <Text style={[styles.currentValue, { color: '#C77DFF' }]}>{formatCurrency(budget.valorReservado ?? 0)}</Text>
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
          <TouchableOpacity style={styles.logoutBtn} onPress={() => setShowLogoutModal(true)} activeOpacity={0.8}>
            <Ionicons name="log-out-outline" size={18} color={colors.danger} />
            <Text style={styles.logoutText}>Sair da Conta</Text>
          </TouchableOpacity>
        </View>

        {/* Info */}
        <View style={styles.infoBox}>
          <Text style={styles.infoText}>NR Finance v1.0</Text>
          <Text style={styles.infoText}>Gestão de Despesas Inteligente com Open Finance</Text>
          <Text style={styles.infoSub}>NR Brownies e Bolos</Text>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Pluggy Connect Modal */}
      {user?.uid && (
        <PluggyConnectModal
          visible={showPluggyModal}
          userId={user.uid}
          onClose={() => setShowPluggyModal(false)}
          onSuccess={handlePluggySuccess}
        />
      )}

      {/* Belvo Connect Modal */}
      {user?.uid && (
        <BelvoConnectModal
          visible={showBelvoModal}
          userId={user.uid}
          onClose={() => setShowBelvoModal(false)}
          onSuccess={async () => {
            await loadPluggyData();
            Alert.alert('🎉 Conexão Belvo Concluída!', 'Sua conta bancária foi vinculada com sucesso via Belvo!');
          }}
        />
      )}

      {/* Logout Modal */}
      <Modal visible={showLogoutModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={styles.modalIconWrap}>
                <Ionicons name="log-out" size={24} color={colors.danger} />
              </View>
              <Text style={styles.modalTitle}>Sair da Conta</Text>
            </View>
            
            <Text style={styles.modalText}>
              Tem certeza que deseja sair do seu perfil? Você precisará fazer login novamente para acessar suas despesas.
            </Text>

            <View style={styles.modalButtonsRow}>
              <TouchableOpacity style={[styles.modalBtnRow, styles.modalBtnCancelRow]} onPress={() => setShowLogoutModal(false)}>
                <Text style={styles.modalBtnTextCancel}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtnRow, styles.modalBtnDangerRow]} onPress={confirmLogout}>
                <Text style={styles.modalBtnTextDanger}>Sair</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  hint: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  connectPluggyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primary,
    paddingVertical: 12,
    borderRadius: borderRadius.md,
    marginVertical: spacing.sm,
  },
  connectPluggyText: {
    color: '#000',
    fontWeight: '700',
    fontSize: fontSize.sm,
  },
  accountsSection: {
    marginTop: spacing.md,
  },
  subSectionTitle: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  itemBox: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: borderRadius.md,
    padding: spacing.sm + 2,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  itemHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  itemTitle: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  itemActions: {
    flexDirection: 'row',
    gap: 8,
  },
  iconBtn: {
    padding: 4,
  },
  accRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: 6,
  },
  accName: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  accSub: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  toggleRow: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
    padding: 2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  toggleBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
  },
  toggleBtnPessoalActive: {
    backgroundColor: colors.pessoal,
  },
  toggleBtnNegocioActive: {
    backgroundColor: colors.negocio,
  },
  toggleText: {
    fontSize: 10,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  toggleTextActive: {
    color: '#FFF',
    fontWeight: '800',
  },
  noConnsText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: spacing.xs,
    fontStyle: 'italic',
  },
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
  saveKeyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: 10,
    marginTop: spacing.xs,
  },
  saveKeyBtnText: { fontSize: fontSize.sm, fontWeight: '700', color: '#000' },
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
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: spacing.lg },
  modalContent: { backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border },
  modalHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  modalIconWrap: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.danger + '20', alignItems: 'center', justifyContent: 'center' },
  modalTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.textPrimary },
  modalText: { fontSize: fontSize.md, color: colors.textSecondary, marginBottom: spacing.xl, lineHeight: 22 },
  modalButtonsRow: { flexDirection: 'row', gap: spacing.sm },
  modalBtnRow: { flex: 1, padding: spacing.md, borderRadius: borderRadius.md, alignItems: 'center' },
  modalBtnCancelRow: { backgroundColor: colors.background },
  modalBtnTextCancel: { color: colors.textSecondary, fontWeight: '600', fontSize: fontSize.md },
  modalBtnDangerRow: { backgroundColor: colors.danger },
  modalBtnTextDanger: { color: colors.background, fontWeight: '700', fontSize: fontSize.md },
  periodRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: spacing.md,
  },
  periodChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  periodChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  periodChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  periodChipTextActive: {
    color: '#000',
    fontWeight: '800',
  },
});
