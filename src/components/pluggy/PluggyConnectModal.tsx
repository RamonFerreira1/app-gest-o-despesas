import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';
import { getConnectToken, getApiKey, fetchPluggyItemDetails, fetchPluggyAccounts, saveUserPluggyItem, saveUserPluggyAccount } from '../../services/pluggyService';
import { syncPluggyTransactions } from '../../services/reconciliationService';
import { colors } from '../../theme';

interface PluggyConnectModalProps {
  visible: boolean;
  userId: string;
  itemIdToUpdate?: string;
  onClose: () => void;
  onSuccess: (itemId: string, newTransactionsCount: number) => void;
}

export const PluggyConnectModal: React.FC<PluggyConnectModalProps> = ({
  visible,
  userId,
  itemIdToUpdate,
  onClose,
  onSuccess,
}) => {
  const [loading, setLoading] = useState(false);
  const [connectToken, setConnectToken] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      initConnect();
    } else {
      setConnectToken(null);
      setErrorMsg(null);
      setLoading(false);
    }
  }, [visible]);

  const initConnect = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const token = await getConnectToken(itemIdToUpdate);
      setConnectToken(token);

      if (Platform.OS !== 'web') {
        // No mobile, abre usando WebBrowser
        const connectUrl = `https://connect.pluggy.ai?connectToken=${token}`;
        const result = await WebBrowser.openAuthSessionAsync(connectUrl, 'nrfinance://pluggy-callback');
        if (result.type === 'success' || result.type === 'dismiss') {
          // Após fechar o browser no mobile, tenta finalizar
          onClose();
        }
      }
    } catch (err: any) {
      console.error('Erro ao obter token do Pluggy Connect:', err);
      setErrorMsg(err.message || 'Não foi possível conectar com a Pluggy.');
    } finally {
      setLoading(false);
    }
  };

  // Listener para postMessage no Web (quando o iframe do Pluggy envia eventos)
  useEffect(() => {
    if (Platform.OS !== 'web' || !visible) return;

    const handleMessage = async (event: MessageEvent) => {
      try {
        let eventData = event.data;
        if (typeof eventData === 'string') {
          try {
            eventData = JSON.parse(eventData);
          } catch {
            return;
          }
        }

        if (!eventData || !eventData.event) return;

        // Trata os eventos do Pluggy Connect
        if (eventData.event === 'item/created' || eventData.event === 'item/updated') {
          const itemId = eventData.item?.id || eventData.itemId;
          if (itemId) {
            setLoading(true);
            try {
              const apiKey = await getApiKey();
              const itemDetails = await fetchPluggyItemDetails(itemId, apiKey);
              const accounts = await fetchPluggyAccounts(itemId, apiKey);

              // Salva o item
              await saveUserPluggyItem(userId, {
                id: itemDetails.id,
                connectorId: itemDetails.connector?.id || 0,
                connectorName: itemDetails.connector?.name || 'Banco',
                connectorLogo: itemDetails.connector?.imageUrl,
                status: itemDetails.status || 'UPDATED',
                createdAt: new Date(itemDetails.createdAt || Date.now()),
                updatedAt: new Date(itemDetails.updatedAt || Date.now()),
              });

              // Salva as contas
              for (const acc of accounts) {
                await saveUserPluggyAccount(userId, {
                  id: acc.id,
                  itemId: itemDetails.id,
                  name: acc.name || 'Conta Bancária',
                  number: acc.number,
                  balance: acc.balance || 0,
                  type: acc.type || 'BANK',
                  subtype: acc.subtype,
                  bankName: itemDetails.connector?.name || 'Banco',
                  origemDefault: 'pessoal', // Padrão Inicial
                });
              }

              // Sincroniza primeiras movimentações para conciliação
              const count = await syncPluggyTransactions(userId, itemDetails.id);

              onSuccess(itemDetails.id, count);
            } catch (saveErr) {
              console.error('Erro ao salvar item conectado:', saveErr);
            } finally {
              setLoading(false);
              onClose();
            }
          }
        } else if (eventData.event === 'close') {
          onClose();
        }
      } catch (err) {
        console.error('Erro no processamento de postMessage do Pluggy:', err);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [visible, userId]);

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <Ionicons name="shield-checkmark" size={24} color={colors.primary} style={{ marginRight: 8 }} />
              <Text style={styles.title}>Conexão Segura Open Finance</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Body */}
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.loadingText}>Iniciando conexão segura com a Pluggy...</Text>
            </View>
          ) : errorMsg ? (
            <View style={styles.errorContainer}>
              <Ionicons name="alert-circle-outline" size={48} color={colors.danger} />
              <Text style={styles.errorText}>{errorMsg}</Text>
              <TouchableOpacity style={styles.retryButton} onPress={initConnect}>
                <Text style={styles.retryText}>Tentar Novamente</Text>
              </TouchableOpacity>
            </View>
          ) : Platform.OS === 'web' && connectToken ? (
            <View style={styles.iframeContainer}>
              <iframe
                src={`https://connect.pluggy.ai?connectToken=${encodeURIComponent(connectToken)}&token=${encodeURIComponent(connectToken)}&includeSandbox=true`}
                style={{ width: '100%', height: '100%', border: 'none', borderRadius: 12 }}
                title="Pluggy Connect"
              />
            </View>
          ) : (

            <View style={styles.mobileHintContainer}>
              <Ionicons name="open-outline" size={48} color={colors.primary} />
              <Text style={styles.mobileHintTitle}>Janela de Autenticação Aberta</Text>
              <Text style={styles.mobileHintDesc}>
                Siga as instruções na tela oficial do seu banco para autorizar a leitura do extrato.
              </Text>
              <TouchableOpacity style={styles.retryButton} onPress={onClose}>
                <Text style={styles.retryText}>Concluir / Fechar</Text>
              </TouchableOpacity>
            </View>
          )}
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
    height: Platform.OS === 'web' ? '85%' : '60%',
    maxHeight: 700,
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
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  closeButton: {
    padding: 4,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 16,
    color: colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorText: {
    marginTop: 12,
    color: colors.danger,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
  },
  retryText: {
    color: '#FFF',
    fontWeight: '600',
    fontSize: 14,
  },
  iframeContainer: {
    flex: 1,
    width: '100%',
  },
  mobileHintContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  mobileHintTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  mobileHintDesc: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
  },
});
