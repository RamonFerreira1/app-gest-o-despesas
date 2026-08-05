import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { MercadoPagoConnection, ExpenseOrigin } from '../types';

const DEFAULT_CLIENT_ID = '991846704144067'; // ID da aplicação NRFinance no Mercado Pago

export function getMercadoPagoClientId(): string {
  return process.env.EXPO_PUBLIC_MP_CLIENT_ID || DEFAULT_CLIENT_ID;
}

export function getMercadoPagoRedirectUri(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/mercadopago-callback`;
  }
  return 'https://app-gest-o-despesas.vercel.app/mercadopago-callback';
}

export function getMercadoPagoAuthUrl(): string {
  const clientId = getMercadoPagoClientId();
  const redirectUri = getMercadoPagoRedirectUri();
  return `https://auth.mercadopago.com.br/authorization?client_id=${encodeURIComponent(
    clientId
  )}&response_type=code&platform_id=mp&redirect_uri=${encodeURIComponent(redirectUri)}`;
}

/**
 * Troca o código OAuth (code) pelo Token de Acesso chamando a Vercel Function.
 */
export async function exchangeCodeForMercadoPagoToken(
  code: string,
  redirectUri?: string
): Promise<{
  access_token: string;
  refresh_token?: string;
  user_id: number | string;
  expires_in?: number;
}> {
  const uri = redirectUri || getMercadoPagoRedirectUri();
  const apiEndpoint = typeof window !== 'undefined' && window.location?.origin
    ? `${window.location.origin}/api/mercadopago/token`
    : 'https://app-gest-o-despesas.vercel.app/api/mercadopago/token';

  const res = await fetch(apiEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, redirectUri: uri }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Falha ao autenticar com o Mercado Pago.');
  }

  return data;
}

/**
 * Busca informações do perfil do usuário no Mercado Pago.
 */
export async function fetchMercadoPagoUserInfo(accessToken: string): Promise<{
  id: number | string;
  first_name?: string;
  last_name?: string;
  email?: string;
  nickname?: string;
}> {
  const res = await fetch('https://api.mercadopago.com/users/me', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    throw new Error('Não foi possível buscar informações do Mercado Pago.');
  }

  return res.json();
}

/**
 * Busca o saldo da conta no Mercado Pago.
 */
export async function fetchMercadoPagoBalance(
  accessToken: string,
  mpUserId: number | string
): Promise<number> {
  try {
    const res = await fetch(
      `https://api.mercadopago.com/users/${mpUserId}/mercadopago_account/balance`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (res.ok) {
      const data = await res.json();
      return data.total_amount || data.available_balance || 0;
    }
  } catch (err) {
    console.warn('Endpoint de saldo primário falhou, tentando fallback:', err);
  }

  return 0;
}

/**
 * Salva a conexão do Mercado Pago no Firestore do usuário.
 */
export async function saveMercadoPagoConnection(
  userId: string,
  connection: Omit<MercadoPagoConnection, 'createdAt' | 'updatedAt'>
): Promise<void> {
  const ref = doc(db, 'users', userId, 'mercadopago_connections', connection.id);
  await setDoc(ref, {
    ...connection,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });
}

/**
 * Busca todas as conexões do Mercado Pago salvas para o usuário.
 */
export async function getUserMercadoPagoConnections(
  userId: string
): Promise<MercadoPagoConnection[]> {
  const ref = collection(db, 'users', userId, 'mercadopago_connections');
  const snap = await getDocs(ref);

  return snap.docs.map((docSnap) => {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      mpUserId: data.mpUserId,
      accountName: data.accountName || 'Mercado Pago',
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      expiresAt: data.expiresAt?.toDate ? data.expiresAt.toDate() : undefined,
      balance: data.balance || 0,
      origemDefault: data.origemDefault || 'pessoal',
      createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
      updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : new Date(),
    };
  });
}

/**
 * Atualiza a classificação da conta MP (pessoal/negócio).
 */
export async function updateMercadoPagoAccountOrigin(
  userId: string,
  connectionId: string,
  newOrigin: ExpenseOrigin
): Promise<void> {
  const ref = doc(db, 'users', userId, 'mercadopago_connections', connectionId);
  await updateDoc(ref, {
    origemDefault: newOrigin,
    updatedAt: Timestamp.now(),
  });
}

/**
 * Remove uma conexão do Mercado Pago.
 */
export async function deleteMercadoPagoConnection(
  userId: string,
  connectionId: string
): Promise<void> {
  const ref = doc(db, 'users', userId, 'mercadopago_connections', connectionId);
  await deleteDoc(ref);
}

/**
 * Busca pagamentos/extrato do Mercado Pago.
 */
export async function fetchMercadoPagoPayments(
  accessToken: string,
  daysBack: number = 30
): Promise<any[]> {
  const startDate = new Date();
  if (daysBack > 0) {
    startDate.setDate(startDate.getDate() - daysBack);
  } else {
    startDate.setHours(0, 0, 0, 0);
  }
  const dateFrom = startDate.toISOString();

  const url = `https://api.mercadopago.com/v1/payments/search?sort=date_created&criteria=desc&begin_date=${encodeURIComponent(
    dateFrom
  )}&limit=100`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    console.warn('Erro ao buscar pagamentos Mercado Pago:', res.statusText);
    return [];
  }

  const data = await res.json();
  return data.results || [];
}
