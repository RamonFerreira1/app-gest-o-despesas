import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Budget, ExpenseOrigin } from '../../types';
import { colors, borderRadius, spacing, fontSize } from '../../theme';
import { formatCurrency } from '../../services/insightService';

interface PurchaseSimulatorModalProps {
  visible: boolean;
  budget: Budget | null;
  currentTotalGasto: number;
  onClose: () => void;
}

export const PurchaseSimulatorModal: React.FC<PurchaseSimulatorModalProps> = ({
  visible,
  budget,
  currentTotalGasto,
  onClose,
}) => {
  const [nome, setNome] = useState('');
  const [valorInput, setValorInput] = useState('');
  const [parcelasInput, setParcelasInput] = useState('10');
  const [origem, setOrigem] = useState<ExpenseOrigin>('negocio');

  if (!visible) return null;

  const limite = budget?.limite || 3000;
  const valorTotal = parseFloat(valorInput.replace(',', '.')) || 0;
  const parcelas = parseInt(parcelasInput, 10) || 1;
  const valorParcela = valorTotal > 0 ? valorTotal / parcelas : 0;

  const novoGastoMensal = currentTotalGasto + valorParcela;
  const percentualAtual = limite > 0 ? (currentTotalGasto / limite) * 100 : 0;
  const novoPercentual = limite > 0 ? (novoGastoMensal / limite) * 100 : 0;
  const ultrapassaLimite = novoGastoMensal > limite;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <View style={[styles.iconBg, { backgroundColor: '#C77DFF20' }]}>
                <Ionicons name="calculator-outline" size={20} color="#C77DFF" />
              </View>
              <View>
                <Text style={styles.title}>Simulador "E se...?" 🔮</Text>
                <Text style={styles.subtitle}>Projete o impacto de uma nova compra no seu orçamento</Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            {/* Form Inputs */}
            <Text style={styles.label}>O que você pretende comprar?</Text>
            <TextInput
              style={styles.input}
              placeholder="Ex: Forno Industrial, Notebook, Maquininha"
              placeholderTextColor={colors.textMuted}
              value={nome}
              onChangeText={setNome}
            />

            <View style={styles.rowInputs}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={styles.label}>Valor Total (R$)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Digite o valor ex: 2400"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="numeric"
                  value={valorInput}
                  onChangeText={setValorInput}
                />
              </View>
              <View style={{ flex: 1, marginLeft: 8 }}>
                <Text style={styles.label}>Nº de Parcelas</Text>
                <TextInput
                  style={styles.input}
                  placeholder="10"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="number-pad"
                  value={parcelasInput}
                  onChangeText={setParcelasInput}
                />
              </View>
            </View>

            {/* Origem PF vs PJ */}
            <Text style={styles.label}>Finalidade da Compra</Text>
            <View style={styles.origemRow}>
              <TouchableOpacity
                style={[styles.origemBtn, origem === 'negocio' && styles.origemBtnNegocioActive]}
                onPress={() => setOrigem('negocio')}
              >
                <Text style={[styles.origemText, origem === 'negocio' && styles.origemTextActive]}>
                  🍫 NR Brownies (PJ)
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.origemBtn, origem === 'pessoal' && styles.origemBtnPessoalActive]}
                onPress={() => setOrigem('pessoal')}
              >
                <Text style={[styles.origemText, origem === 'pessoal' && styles.origemTextActive]}>
                  👤 Uso Pessoal (PF)
                </Text>
              </TouchableOpacity>
            </View>

            {/* Resultado da Projeção */}
            {valorTotal > 0 ? (
              <View style={[styles.resultCard, ultrapassaLimite ? styles.resultCardDanger : styles.resultCardSuccess]}>
                <View style={styles.resultHeader}>
                  <Ionicons
                    name={ultrapassaLimite ? 'warning-outline' : 'checkmark-circle-outline'}
                    size={24}
                    color={ultrapassaLimite ? colors.danger : colors.success}
                  />
                  <Text style={[styles.resultTitle, { color: ultrapassaLimite ? colors.danger : colors.success }]}>
                    {ultrapassaLimite ? '⚠️ Risco de Estouro de Teto' : '✅ Compra Viável no Orçamento'}
                  </Text>
                </View>

                <Text style={styles.resultText}>
                  Parcela Mensal: <Text style={styles.boldText}>{formatCurrency(valorParcela)}</Text> durante <Text style={styles.boldText}>{parcelas} meses</Text>.
                </Text>

                <View style={styles.metricBox}>
                  <View style={styles.metricRow}>
                    <Text style={styles.metricLabel}>Gasto Atual do Mês:</Text>
                    <Text style={styles.metricVal}>{formatCurrency(currentTotalGasto)} ({percentualAtual.toFixed(0)}%)</Text>
                  </View>
                  <View style={styles.metricRow}>
                    <Text style={styles.metricLabel}>Novo Gasto com a Parcela:</Text>
                    <Text style={[styles.metricVal, { color: ultrapassaLimite ? colors.danger : colors.primary }]}>
                      {formatCurrency(novoGastoMensal)} ({novoPercentual.toFixed(0)}% do Teto)
                    </Text>
                  </View>
                </View>

                <Text style={styles.resultTip}>
                  {ultrapassaLimite
                    ? `Essa parcela vai fazer você ultrapassar o teto mensal em ${formatCurrency(novoGastoMensal - limite)}. Sugerimos aumentar as parcelas ou utilizar o Valor Reservado.`
                    : `Você ainda ficará com uma folga mensal de ${formatCurrency(limite - novoGastoMensal)} no seu orçamento!`}
                </Text>
              </View>
            ) : (
              <View style={styles.infoHintBox}>
                <Ionicons name="information-circle-outline" size={20} color={colors.info} />
                <Text style={styles.infoHintText}>
                  Digite o valor total da compra e o número de parcelas acima para ver o resultado do cálculo automaticamente em tempo real!
                </Text>
              </View>
            )}
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity style={styles.closeModalBtn} onPress={onClose}>
              <Ionicons name="checkmark-circle-outline" size={18} color="#000" style={{ marginRight: 6 }} />
              <Text style={styles.closeModalBtnText}>Concluir Simulação</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 500,
    maxHeight: '85%',
    backgroundColor: colors.surface,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconBg: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: `${colors.primary}20`,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
  closeBtn: {
    padding: 4,
  },
  body: {
    padding: 20,
  },
  label: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  input: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: fontSize.md,
    color: colors.textPrimary,
    marginBottom: 16,
  },
  rowInputs: {
    flexDirection: 'row',
  },
  origemRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  origemBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  origemBtnNegocioActive: {
    backgroundColor: `${colors.negocio}30`,
    borderColor: colors.negocio,
  },
  origemBtnPessoalActive: {
    backgroundColor: `${colors.pessoal}30`,
    borderColor: colors.pessoal,
  },
  origemText: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  origemTextActive: {
    color: colors.textPrimary,
    fontWeight: '800',
  },
  resultCard: {
    borderRadius: borderRadius.lg,
    padding: 16,
    borderWidth: 1,
    marginTop: 8,
  },
  resultCardSuccess: {
    backgroundColor: '#00E67615',
    borderColor: colors.success,
  },
  resultCardDanger: {
    backgroundColor: '#FF4D4D15',
    borderColor: colors.danger,
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  resultTitle: {
    fontSize: fontSize.md,
    fontWeight: '800',
  },
  resultText: {
    fontSize: fontSize.sm,
    color: colors.textPrimary,
    marginBottom: 12,
  },
  boldText: {
    fontWeight: '800',
    color: colors.primary,
  },
  metricBox: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: 10,
    gap: 6,
    marginBottom: 10,
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metricLabel: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
  metricVal: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  resultTip: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  infoHintBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: `${colors.info}15`,
    borderColor: `${colors.info}40`,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: 12,
    gap: 8,
    marginTop: 8,
  },
  infoHintText: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    flex: 1,
    lineHeight: 16,
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  closeModalBtn: {
    backgroundColor: colors.primary,
    flexDirection: 'row',
    paddingVertical: 12,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeModalBtnText: {
    color: '#000',
    fontWeight: '800',
    fontSize: fontSize.sm,
  },
});
