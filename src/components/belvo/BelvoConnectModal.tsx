import React, { useEffect, useState, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { colors, spacing, fontSize, borderRadius } from '../../theme';
import {
  getBelvoWidgetToken,
  saveUserBelvoLink,
  saveUserBelvoAccount,
} from '../../services/belvoService';

interface BelvoConnectModalProps {
  visible: boolean;
  userId: string;
  onClose: () => void;
  onSuccess: (linkId: string) => void;
}

export const BelvoConnectModal: React.FC<BelvoConnectModalProps> = ({
  visible,
  userId,
  onClose,
  onSuccess,
}) => {
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('Iniciando Belvo...');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [widgetOpen, setWidgetOpen] = useState(false);

  const popupRef = useRef<Window | null>(null);
  const popupPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (visible) {
      initBelvoConnect();
    } else {
      setErrorMsg(null);
      setLoading(false);
      setWidgetOpen(false);
    }
  }, [visible]);

  const initBelvoConnect = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      setLoadingMsg('Gerando sessão segura no Belvo...');

      const { access, environment } = await getBelvoWidgetToken();

      const origin =
        typeof window !== 'undefined' && window.location?.origin
          ? window.location.origin
          : 'https://app-gest-o-despesas.vercel.app';
      const widgetUrl = `${origin}/belvo-widget.html?access_token=${encodeURIComponent(access)}`;

      if (Platform.OS === 'web') {
        const width = 500;
        const height = 720;
        const left = window.screenX + (window.outerWidth - width) / 2;
        const top = window.screenY + (window.outerHeight - height) / 2;

        const popup = window.open(
          widgetUrl,
          'BelvoConnect',
          `width=${width},height=${height},left=${left},top=${top},scrollbars=yes,resizable=yes`
        );

        if (!popup || popup.closed) {
          setErrorMsg(
            'O navegador bloqueou a janela pop-up.\n\n' +
            'Permita pop-ups nas configurações do navegador e tente novamente.'
          );
          setLoading(false);
          return;
        }

        popupRef.current = popup;
        setLoading(false);
        setWidgetOpen(true);

        if (popupPollRef.current) clearInterval(popupPollRef.current);
        popupPollRef.current = setInterval(() => {
          if (popup.closed) {
            if (popupPollRef.current) clearInterval(popupPollRef.current);
            popupPollRef.current = null;
            popupRef.current = null;
            setWidgetOpen(false);
          }
        }, 800);
      } else {
        const result = await WebBrowser.openAuthSessionAsync(
          widgetUrl,
          'nrfinance://belvo-callback'
        );

        if (result.type === 'success' || result.type === 'dismiss') {
          onSuccess('belvo-connected-link');
          onClose();
        } else {
          onClose();
        }
      }
    } catch (err: any) {
      console.error('Erro ao iniciar Belvo Connect:', err);
      setErrorMsg(
        err.message ||
        'Não foi possível conectar com o Belvo. Verifique se as credenciais BELVO_SECRET_ID e BELVO_SECRET_PASSWORD foram configuradas.'
      );
    } finally {
      if (Platform.OS !== 'web') setLoading(false);
    }
  };

  // Listener para eventos do Belvo Widget no Web
  useEffect(() => {
    if (Platform.OS !== 'web' || !visible) return;

    const handleMessage = async (event: MessageEvent) => {
      try {
        let data = event.data;
        if (typeof data === 'string') {
          try {
            data = JSON.parse(data);
          } catch {
            return;
          }
        }

        if (!data) return;

        // Trata callback de sucesso do Belvo Widget (evento de link criado)
        if (data.event === 'BELVO_LINK_CREATED' || data.link || data.link_id) {
          const linkId = data.link || data.link_id || `belvo_link_${Date.now()}`;
          const institution = data.institution || 'Banco Conectado';

          if (popupRef.current && !popupRef.current.closed) popupRef.current.close();
          if (popupPollRef.current) {
            clearInterval(popupPollRef.current);
            popupPollRef.current = null;
          }
          popupRef.current = null;
          setWidgetOpen(false);

          setLoading(true);
          setLoadingMsg('Salvando dados da conta bancária...');

          await saveUserBelvoLink(userId, {
            id: linkId,
            institution,
            accessMode: 'single',
            status: 'valid',
          });

          await saveUserBelvoAccount(userId, {
            id: `acc_${linkId}`,
            linkId,
            name: `Conta ${institution}`,
            balance: 0,
            currency: 'BRL',
            type: 'CHECKING_ACCOUNT',
            bankName: institution,
            origemDefault: 'pessoal',
          });

          onSuccess(linkId);
          onClose();
        } else if (data.event === 'BELVO_WIDGET_CLOSED' || data.event === 'close') {
          if (popupRef.current && !popupRef.current.closed) popupRef.current.close();
          popupRef.current = null;
          setWidgetOpen(false);
          onClose();
        }
      } catch (err) {
        console.error('Erro ao processar mensagem do Belvo:', err);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [visible, userId]);

  // Limpa timer e popup ao desmontar
  useEffect(() => {
    return () => {
      if (popupPollRef.current) clearInterval(popupPollRef.current);
      if (popupRef.current && !popupRef.current.closed) popupRef.current.close();
    };
  }, []);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType={Platform.OS === 'web' ? 'none' : 'slide'}
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <Ionicons name="shield-checkmark" size={24} color="#009EE3" style={{ marginRight: 8 }} />
              <Text style={styles.title}>Belvo Open Finance</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Body */}
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#009EE3" />
              <Text style={styles.loadingText}>{loadingMsg}</Text>
            </View>
          ) : errorMsg ? (
            <View style={styles.errorContainer}>
              <Ionicons name="alert-circle-outline" size={48} color={colors.danger} />
              <Text style={styles.errorText}>{errorMsg}</Text>
              <TouchableOpacity style={styles.retryButton} onPress={initBelvoConnect}>
                <Text style={styles.retryText}>Tentar Novamente</Text>
              </TouchableOpacity>
            </View>
          ) : Platform.OS === 'web' && widgetOpen ? (
            <View style={styles.hintContainer}>
              <Ionicons name="open-outline" size={52} color="#009EE3" />
              <Text style={styles.hintTitle}>Janela Belvo Aberta</Text>
              <Text style={styles.hintDesc}>
                {'Selecione o seu banco e siga os passos na janela pop-up do Belvo.\n\nApós autorizar, esta tela será atualizada automaticamente.'}
              </Text>
              <TouchableOpacity
                style={styles.retryButton}
                onPress={() => {
                  if (popupRef.current && !popupRef.current.closed) {
                    popupRef.current.focus();
                  } else {
                    initBelvoConnect();
                  }
                }}
              >
                <Text style={styles.retryText}>Reabrir Janela</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.hintContainer}>
              <ActivityIndicator size="large" color="#009EE3" />
              <Text style={styles.loadingText}>Aguardando autorização...</Text>
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
    height: Platform.OS === 'web' ? '70%' : '60%',
    maxHeight: 600,
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
    fontSize: 14,
    color: colors.textSecondary,
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
    marginBottom: 20,
    fontSize: 14,
    color: colors.danger,
    textAlign: 'center',
    lineHeight: 20,
  },
  hintContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 28,
  },
  hintTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
    marginTop: 16,
    marginBottom: 8,
  },
  hintDesc: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  retryButton: {
    backgroundColor: '#009EE3',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
});
