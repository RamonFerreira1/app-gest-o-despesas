import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useExpenseStore } from '../store/useExpenseStore';
import { useAuthStore } from '../store/useAuthStore';
import { ChatMessage } from '../types';
import {
  askFinancialAI,
  saveChatMessageFirestore,
  getChatMessagesFirestore,
  clearChatMessagesFirestore,
} from '../services/aiChatService';
import { getPendingTransactions } from '../services/reconciliationService';
import { colors, spacing, fontSize, borderRadius, shadows } from '../theme';

const QUICK_CHIPS = [
  { label: '💾 Nossa conversa fica salva?', prompt: 'Nossa conversa fica salva?' },
  { label: '📊 Quanto gastei este mês?', prompt: 'Quanto eu gastei este mês?' },
  { label: '🎯 Quanto me resta do limite?', prompt: 'Quanto me resta do orçamento?' },
  { label: '⚖️ Pessoal vs Negócio (PF/PJ)', prompt: 'Resumo Pessoal vs Negócio' },
  { label: '💰 Valor da minha Reserva', prompt: 'Qual o valor da minha reserva?' },
  { label: '💡 Dicas para Economizar', prompt: 'Como posso economizar este mês?' },
];

export default function ChatAssistantScreen() {
  const { user } = useAuthStore();
  const { expenses, summary, budget, loadData } = useExpenseStore();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [pendingTxs, setPendingTxs] = useState<any[]>([]);

  const scrollViewRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (user?.uid) {
      loadData(user.uid);
      loadPending();
      loadHistory();
    }
  }, [user?.uid]);

  const loadPending = async () => {
    if (!user?.uid) return;
    try {
      const p = await getPendingTransactions(user.uid);
      setPendingTxs(p);
    } catch {
      // Ignora erro
    }
  };

  const loadHistory = async () => {
    if (!user?.uid) return;
    try {
      setLoadingHistory(true);
      const savedMsgs = await getChatMessagesFirestore(user.uid);
      if (savedMsgs.length > 0) {
        setMessages(savedMsgs);
      } else {
        // Mensagem padrão inicial
        const welcomeMsg: ChatMessage = {
          id: 'welcome',
          sender: 'assistant',
          text: `Olá! Sou o **NR Finance AI**, seu assistente pessoal de inteligência financeira. 🤖\n\nEstou conectado aos seus dados de despesas, teto orçamentário, fundo de reserva e contas do banco Pluggy.\n\nNossa conversa fica **100% salva** para você consultar quando quiser. Como posso ajudar você hoje?`,
          timestamp: new Date(),
        };
        setMessages([welcomeMsg]);
        await saveChatMessageFirestore(user.uid, welcomeMsg);
      }
    } catch (err) {
      console.error('Erro ao carregar histórico de chat:', err);
    } finally {
      setLoadingHistory(false);
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: false }), 200);
    }
  };

  const handleClearHistory = () => {
    if (!user?.uid) return;
    Alert.alert(
      'Limpar Histórico',
      'Deseja apagar todas as mensagens salvas desta conversa?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Limpar',
          style: 'destructive',
          onPress: async () => {
            await clearChatMessagesFirestore(user.uid);
            const welcomeMsg: ChatMessage = {
              id: Math.random().toString(),
              sender: 'assistant',
              text: `Histórico limpo! 🧹 Como posso ajudar você agora?`,
              timestamp: new Date(),
            };
            setMessages([welcomeMsg]);
            await saveChatMessageFirestore(user.uid, welcomeMsg);
          },
        },
      ]
    );
  };

  const handleSend = async (customPrompt?: string) => {
    const textToSend = customPrompt || inputText;
    if (!textToSend.trim() || isThinking || !user?.uid) return;

    const userMsg: ChatMessage = {
      id: Math.random().toString(),
      sender: 'user',
      text: textToSend.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    await saveChatMessageFirestore(user.uid, userMsg);

    if (!customPrompt) setInputText('');
    setIsThinking(true);

    setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);

    try {
      const replyText = await askFinancialAI(
        textToSend,
        {
          expenses,
          summary,
          budget,
          pendingTransactions: pendingTxs,
        },
        messages
      );


      const aiMsg: ChatMessage = {
        id: Math.random().toString(),
        sender: 'assistant',
        text: replyText,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, aiMsg]);
      await saveChatMessageFirestore(user.uid, aiMsg);
    } catch (err) {
      const errMsg: ChatMessage = {
        id: Math.random().toString(),
        sender: 'assistant',
        text: 'Desculpe, ocorreu um erro ao consultar os dados. Tente novamente!',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errMsg]);
      await saveChatMessageFirestore(user.uid, errMsg);
    } finally {
      setIsThinking(false);
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  const renderFormattedText = (text: string) => {
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, index) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return (
          <Text key={index} style={styles.boldText}>
            {part.slice(2, -2)}
          </Text>
        );
      }
      return part;
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.aiAvatar}>
              <Ionicons name="sparkles" size={20} color={colors.primary} />
            </View>
            <View>
              <Text style={styles.title}>NR Finance AI</Text>
              <View style={styles.statusRow}>
                <View style={styles.onlineDot} />
                <Text style={styles.subtitle}>Conversa Salva • Inteligência Financeira</Text>
              </View>
            </View>
          </View>

          <TouchableOpacity style={styles.clearBtn} onPress={handleClearHistory}>
            <Ionicons name="trash-outline" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Lista de Mensagens */}
        {loadingHistory ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingHistoryText}>Carregando conversa salva...</Text>
          </View>
        ) : (
          <ScrollView
            ref={scrollViewRef}
            contentContainerStyle={styles.messagesContent}
            showsVerticalScrollIndicator={false}
          >
            {messages.map((msg) => {
              const isUser = msg.sender === 'user';
              return (
                <View
                  key={msg.id}
                  style={[
                    styles.msgRow,
                    isUser ? styles.msgRowUser : styles.msgRowAssistant,
                  ]}
                >
                  {!isUser && (
                    <View style={styles.msgAvatar}>
                      <Ionicons name="sparkles" size={14} color={colors.primary} />
                    </View>
                  )}

                  <View
                    style={[
                      styles.bubble,
                      isUser ? styles.bubbleUser : styles.bubbleAssistant,
                    ]}
                  >
                    <Text style={isUser ? styles.bubbleTextUser : styles.bubbleTextAssistant}>
                      {renderFormattedText(msg.text)}
                    </Text>
                    <Text style={styles.timeText}>
                      {new Date(msg.timestamp).toLocaleTimeString('pt-BR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </Text>
                  </View>
                </View>
              );
            })}

            {isThinking && (
              <View style={[styles.msgRow, styles.msgRowAssistant]}>
                <View style={styles.msgAvatar}>
                  <Ionicons name="sparkles" size={14} color={colors.primary} />
                </View>
                <View style={[styles.bubble, styles.bubbleAssistant, styles.thinkingBubble]}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={styles.thinkingText}>Analisando suas finanças...</Text>
                </View>
              </View>
            )}
          </ScrollView>
        )}

        {/* Chips de Perguntas Rápidas */}
        <View style={styles.chipsSection}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsScroll}>
            {QUICK_CHIPS.map((chip, idx) => (
              <TouchableOpacity
                key={idx}
                style={styles.chipBtn}
                onPress={() => handleSend(chip.prompt)}
                disabled={isThinking}
              >
                <Text style={styles.chipText}>{chip.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Input Bar */}
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Digite qualquer pergunta sobre suas finanças..."
            placeholderTextColor={colors.textMuted}
            value={inputText}
            onChangeText={setInputText}
            onSubmitEditing={() => handleSend()}
            returnKeyType="send"
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!inputText.trim() || isThinking) && styles.sendBtnDisabled]}
            onPress={() => handleSend()}
            disabled={!inputText.trim() || isThinking}
            activeOpacity={0.8}
          >
            <Ionicons name="send" size={18} color={inputText.trim() ? '#000' : colors.textMuted} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  aiAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: `${colors.primary}20`,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  title: {
    fontSize: fontSize.md,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  onlineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
  subtitle: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
  clearBtn: {
    padding: spacing.xs,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
  },
  loadingHistoryText: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
  messagesContent: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  msgRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  msgRowUser: {
    justifyContent: 'flex-end',
  },
  msgRowAssistant: {
    justifyContent: 'flex-start',
  },
  msgAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: `${colors.primary}20`,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  bubble: {
    maxWidth: '82%',
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  bubbleUser: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: 4,
  },
  bubbleAssistant: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderBottomLeftRadius: 4,
  },
  bubbleTextUser: {
    fontSize: fontSize.sm,
    color: '#000',
    fontWeight: '500',
    lineHeight: 20,
  },
  bubbleTextAssistant: {
    fontSize: fontSize.sm,
    color: colors.textPrimary,
    lineHeight: 22,
  },
  boldText: {
    fontWeight: '800',
    color: colors.primary,
  },
  timeText: {
    fontSize: 10,
    color: colors.textMuted,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  thinkingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  thinkingText: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  chipsSection: {
    paddingVertical: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipsScroll: {
    paddingHorizontal: spacing.md,
    gap: spacing.xs,
  },
  chipBtn: {
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipText: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: fontSize.sm,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    backgroundColor: colors.surfaceAlt,
  },
});
