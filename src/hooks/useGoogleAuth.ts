import { useEffect, useState } from 'react';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { GoogleAuthProvider, signInWithPopup, signInWithCredential } from 'firebase/auth';
import { auth } from '../config/firebase';
import { useAuthStore } from '../store/useAuthStore';

// Necessário para fechar o browser automaticamente no Android
WebBrowser.maybeCompleteAuthSession();

const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '';

export function useGoogleAuth() {
  const { loginWithGoogle, setError } = useAuthStore();
  const [googleLoading, setGoogleLoading] = useState(false);
  const [nativeRequest, setNativeRequest] = useState<any>(null);
  const [nativeResponse, setNativeResponse] = useState<any>(null);

  // ── WEB & PWA: usa signInWithRedirect do Firebase para maior compatibilidade ─
  const signInWithGoogleWeb = async () => {
    setGoogleLoading(true);
    setError(null);
    try {
      const provider = new GoogleAuthProvider();
      provider.addScope('profile');
      provider.addScope('email');
      
      // signInWithPopup pode falhar em PWAs/Mobile Web, signInWithRedirect é mais seguro
      // Mas a causa nº 1 de erro na Vercel é o domínio não estar autorizado no Firebase!
      await signInWithPopup(auth, provider);
      // onAuthStateChanged no store cuida do resto automaticamente
    } catch (e: any) {
      if (e.code !== 'auth/popup-closed-by-user') {
        setError(`Erro: ${e.message} (${e.code})`);
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  // ── NATIVE (Expo Go / APK): usa WebBrowser diretamente ──────────────────────
  const signInWithGoogleNative = async () => {
    setGoogleLoading(true);
    setError(null);
    try {
      const { makeRedirectUri } = await import('expo-auth-session');
      const redirectUri = makeRedirectUri({ scheme: 'nrfinance' });

      // No ambiente nativo, abre o browser externo para OAuth
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth` +
        `?client_id=${WEB_CLIENT_ID}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&response_type=id_token` +
        `&scope=${encodeURIComponent('openid profile email')}` +
        `&nonce=default_nonce`;

      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);

      if (result.type === 'success' && result.url) {
        // Extrai o id_token da URL de retorno (hash fragment)
        const params = new URLSearchParams(result.url.split('#')[1]);
        const idToken = params.get('id_token');
        if (idToken) {
          const credential = GoogleAuthProvider.credential(idToken);
          await signInWithCredential(auth, credential);
        }
      }
    } catch (e: any) {
      setError('Erro ao entrar com Google. Tente novamente.');
      console.error('Native Google auth error:', e);
    } finally {
      setGoogleLoading(false);
    }
  };

  const signInWithGoogle = Platform.OS === 'web'
    ? signInWithGoogleWeb
    : signInWithGoogleNative;

  return {
    signInWithGoogle,
    googleLoading,
    googleReady: true,
  };
}
