import React, { useState, useEffect, useRef } from 'react';
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

const PLUGGY_API_URL = 'https://api.pluggy.ai';

/** Busca todos os items (conexões) existentes na conta Pluggy */
async function fetchAllPluggyItems(apiKey: string): Promise<any[]> {
  const res = await fetch(`${PLUGGY_API_URL}/items`, {
    headers: { 'X-API-KEY': apiKey },
  });
  if (!res.ok) throw new Error('Erro ao listar items da Pluggy');
  const data = await res.json();
  return data.results || [];
}

/** Garante que uma Promise resolva em no máximo `ms` milissegundos */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`TIMEOUT:${label}`)), ms)
    ),
  ]);
}

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
  const [loadingMsg, setLoadingMsg] = useState('Iniciando...');
  const [connectToken, setConnectToken] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [adBlockerDetected, setAdBlockerDetected] = useState(false);
  const [webPopupOpen, setWebPopupOpen] = useState(false);
  // Guarda os item IDs já existentes antes de abrir o browser
  const previousItemIdsRef = useRef<Set<string>>(new Set());
  // Referência ao popup aberto no web
  const popupRef = useRef<Window | null>(null);
  const popupPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (visible) {
      initConnect();
    } else {
      setConnectToken(null);
      setErrorMsg(null);
      setLoading(false);
    }
  }, [visible]);

  /**
   * Após o browser fechar no mobile, tenta encontrar o item recém-criado na
   * Pluggy com retries (a Pluggy pode demorar alguns segundos para processar).
   */
  const handleMobileSuccess = async () => {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const MAX_RETRIES = 5;
    const RETRY_DELAY_MS = 3000;

    try {
      setLoading(true);
      setErrorMsg(null);

      const apiKey = await getApiKey();
      let targetItem: any = null;

      // Aguarda 2s antes da 1ª tentativa (Pluggy precisa de tempo para processar)
      setLoadingMsg('Aguardando a Pluggy processar a conexão...');
      await sleep(2000);

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        setLoadingMsg(`Verificando conexão bancária... (${attempt}/${MAX_RETRIES})`);
        const allItems = await fetchAllPluggyItems(apiKey);

        if (itemIdToUpdate) {
          targetItem = allItems.find((i: any) => i.id === itemIdToUpdate);
        } else {
          // Novo item: qualquer item que não estava no snapshot anterior
          targetItem = allItems.find((i: any) => !previousItemIdsRef.current.has(i.id));

          // Fallback: o mais recente criado nos últimos 5 minutos
          if (!targetItem && allItems.length > 0) {
            const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
            const recentItem = allItems
              .filter((i: any) => new Date(i.createdAt).getTime() > fiveMinutesAgo)
              .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
            targetItem = recentItem || null;
          }
        }

        if (targetItem) break; // Encontrou! Para de tentar.

        if (attempt < MAX_RETRIES) {
          setLoadingMsg(`Ainda processando... aguardando ${RETRY_DELAY_MS / 1000}s`);
          await sleep(RETRY_DELAY_MS);
        }
      }

      if (!targetItem) {
        setErrorMsg(
          'A conexão foi concluída no banco, mas não encontramos o item na Pluggy.\n\n' +
          'Feche este modal e toque em “Conectar Conta Bancária” novamente para tentar sincronizar.'
        );
        return;
      }

      setLoadingMsg('Carregando dados da conta...');
      const itemDetails = await fetchPluggyItemDetails(targetItem.id, apiKey);
      const accounts = await fetchPluggyAccounts(targetItem.id, apiKey);

      setLoadingMsg('Salvando conexão...');
      await saveUserPluggyItem(userId, {
        id: itemDetails.id,
        connectorId: itemDetails.connector?.id || 0,
        connectorName: itemDetails.connector?.name || 'Banco',
        connectorLogo: itemDetails.connector?.imageUrl,
        status: itemDetails.status || 'UPDATED',
        createdAt: new Date(itemDetails.createdAt || Date.now()),
        updatedAt: new Date(itemDetails.updatedAt || Date.now()),
      });

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
          origemDefault: 'pessoal',
        });
      }

      setLoadingMsg('Sincronizando movimentações...');
      const count = await syncPluggyTransactions(userId, itemDetails.id);
      onSuccess(itemDetails.id, count);
      onClose();
    } catch (saveErr: any) {
      console.error('Erro ao salvar item conectado (mobile):', saveErr);
      setErrorMsg(saveErr.message || 'Erro ao salvar a conexão bancária.');
    } finally {
      setLoading(false);
    }
  };

  const initConnect = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      setWebPopupOpen(false);
      const token = await getConnectToken(itemIdToUpdate);
      setConnectToken(token);

      if (Platform.OS === 'web') {
        // Web: abre popup em vez de iframe para permitir OAuth sem restrições
        const connectUrl = `https://connect.pluggy.ai?connect_token=${encodeURIComponent(token)}`;
        const width = 480;
        const height = 700;
        const left = window.screenX + (window.outerWidth - width) / 2;
        const top = window.screenY + (window.outerHeight - height) / 2;
        const popup = window.open(
          connectUrl,
          'PluggyConnect',
          `width=${width},height=${height},left=${left},top=${top},scrollbars=yes,resizable=yes`
        );

        if (!popup || popup.closed) {
          // Popup bloqueado pelo navegador
          setErrorMsg(
            'O navegador bloqueou o pop-up.\n\n' +
            'Permita pop-ups para este site nas configurações do navegador e tente novamente.'
          );
          setLoading(false);
          return;
        }

        popupRef.current = popup;
        setLoading(false);
        setWebPopupOpen(true);

        // Detecta se o usuário fechou o popup manualmente
        if (popupPollRef.current) clearInterval(popupPollRef.current);
        popupPollRef.current = setInterval(() => {
          if (popup.closed) {
            clearInterval(popupPollRef.current!);
            popupPollRef.current = null;
            popupRef.current = null;
            setWebPopupOpen(false);
          }
        }, 800);
      } else {
        // Mobile: snapshot dos items já existentes antes de abrir o browser
        try {
          const apiKey = await getApiKey();
          const existingItems = await fetchAllPluggyItems(apiKey);
          previousItemIdsRef.current = new Set(existingItems.map((i: any) => i.id));
        } catch {
          previousItemIdsRef.current = new Set();
        }

        const connectUrl = `https://connect.pluggy.ai?connect_token=${encodeURIComponent(token)}&with_sandbox=true`;
        const result = await WebBrowser.openAuthSessionAsync(connectUrl, 'nrfinance://pluggy-callback');

        if (result.type === 'success' || result.type === 'dismiss') {
          await handleMobileSuccess();
        } else {
          onClose();
        }
      }
    } catch (err: any) {
      console.error('Erro ao obter token do Pluggy Connect:', err);
      setErrorMsg(err.message || 'Não foi possível conectar com a Pluggy.');
    } finally {
      if (Platform.OS !== 'web') setLoading(false);
    }
  };

  // Limpa o popup e o intervalo ao desmontar ou fechar
  useEffect(() => {
    return () => {
      if (popupPollRef.current) clearInterval(popupPollRef.current);
      if (popupRef.current && !popupRef.current.closed) popupRef.current.close();
    };
  }, []);


  // Listener para postMessage no Web (quando o popup do Pluggy envia eventos)
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
            // Fecha o popup ao receber sucesso
            if (popupRef.current && !popupRef.current.closed) popupRef.current.close();
            if (popupPollRef.current) { clearInterval(popupPollRef.current); popupPollRef.current = null; }
            popupRef.current = null;
            setWebPopupOpen(false);

            setLoading(true);
            setLoadingMsg('Salvando conexão bancária...');
            setAdBlockerDetected(false);
            try {
              // Busca detalhes do item e contas com timeout de 15s
              const apiKey = await withTimeout(getApiKey(), 15000, 'getApiKey');
              const itemDetails = await withTimeout(fetchPluggyItemDetails(itemId, apiKey), 15000, 'fetchItem');
              const accounts = await withTimeout(fetchPluggyAccounts(itemId, apiKey), 15000, 'fetchAccounts');

              setLoadingMsg('Salvando conta no app...');
              // Salva o item no Firestore (timeout de 12s — operações de rede)
              await withTimeout(
                saveUserPluggyItem(userId, {
                  id: itemDetails.id,
                  connectorId: itemDetails.connector?.id || 0,
                  connectorName: itemDetails.connector?.name || 'Banco',
                  connectorLogo: itemDetails.connector?.imageUrl,
                  status: itemDetails.status || 'UPDATED',
                  createdAt: new Date(itemDetails.createdAt || Date.now()),
                  updatedAt: new Date(itemDetails.updatedAt || Date.now()),
                }),
                12000,
                'saveItem'
              );

              // Salva as contas no Firestore
              for (const acc of accounts) {
                await withTimeout(
                  saveUserPluggyAccount(userId, {
                    id: acc.id,
                    itemId: itemDetails.id,
                    name: acc.name || 'Conta Bancária',
                    number: acc.number,
                    balance: acc.balance || 0,
                    type: acc.type || 'BANK',
                    subtype: acc.subtype,
                    bankName: itemDetails.connector?.name || 'Banco',
                    origemDefault: 'pessoal',
                  }),
                  12000,
                  'saveAccount'
                );
              }

              setLoadingMsg('Sincronizando movimentações...');
              // Sincroniza transações
              const count = await withTimeout(
                syncPluggyTransactions(userId, itemDetails.id),
                20000,
                'syncTransactions'
              );

              onSuccess(itemDetails.id, count);
            } catch (saveErr: any) {
              console.error('Erro ao salvar item conectado:', saveErr);
              // Detecta timeout (causado geralmente por ad blocker bloqueando Firestore)
              if (saveErr?.message?.startsWith('TIMEOUT:')) {
                setAdBlockerDetected(true);
                setLoading(false);
                return; // Não fecha o modal — mostra tela de erro
              }
            } finally {
              setLoading(false);
              if (!adBlockerDetected) onClose();
            }
          }
        } else if (eventData.event === 'close') {
          if (popupRef.current && !popupRef.current.closed) popupRef.current.close();
          popupRef.current = null;
          setWebPopupOpen(false);
          onClose();
        }
      } catch (err) {
        console.error('Erro no processamento de postMessage do Pluggy:', err);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [visible, userId, adBlockerDetected]);

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType={Platform.OS === 'web' ? 'none' : 'slide'} transparent onRequestClose={onClose}>
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
          {adBlockerDetected ? (
            <View style={styles.errorContainer}>
              <Ionicons name="shield-outline" size={52} color="#FF9500" />
              <Text style={[styles.errorText, { color: '#FF9500', fontWeight: '700', fontSize: 16, marginBottom: 8 }]}>
                Ad Blocker Detectado
              </Text>
              <Text style={[styles.errorText, { color: colors.textSecondary, fontSize: 13, lineHeight: 20 }]}>
                Seu bloqueador de anúncios está impedindo a conexão com o banco de dados do app (Firestore).{'\n\n'}
                Para continuar, <Text style={{ fontWeight: '700', color: colors.textPrimary }}>desative o ad blocker para este site</Text> e tente novamente.
              </Text>
              <TouchableOpacity
                style={[styles.retryButton, { backgroundColor: '#FF9500', marginTop: 8 }]}
                onPress={() => { setAdBlockerDetected(false); initConnect(); }}
              >
                <Text style={styles.retryText}>Já desativei — Tentar Novamente</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.retryButton, { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border, marginTop: 8 }]} onPress={onClose}>
                <Text style={[styles.retryText, { color: colors.textSecondary }]}>Fechar</Text>
              </TouchableOpacity>
            </View>
          ) : loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.loadingText}>{loadingMsg}</Text>
            </View>
          ) : errorMsg ? (
            <View style={styles.errorContainer}>
              <Ionicons name="alert-circle-outline" size={48} color={colors.danger} />
              <Text style={styles.errorText}>{errorMsg}</Text>
              <TouchableOpacity style={styles.retryButton} onPress={initConnect}>
                <Text style={styles.retryText}>Tentar Novamente</Text>
              </TouchableOpacity>
            </View>
          ) : Platform.OS === 'web' && webPopupOpen ? (
            <View style={styles.mobileHintContainer}>
              <Ionicons name="open-outline" size={52} color={colors.primary} />
              <Text style={styles.mobileHintTitle}>Janela de Conexão Aberta</Text>
              <Text style={styles.mobileHintDesc}>
                {'Complete a autorização na janela pop-up que abriu.\n\nApós concluir no site do banco, esta tela será atualizada automaticamente.'}
              </Text>
              <TouchableOpacity
                style={styles.retryButton}
                onPress={() => {
                  if (popupRef.current && !popupRef.current.closed) {
                    popupRef.current.focus();
                  } else {
                    initConnect();
                  }
                }}
              >
                <Text style={styles.retryText}>Reabrir Janela</Text>
              </TouchableOpacity>
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
