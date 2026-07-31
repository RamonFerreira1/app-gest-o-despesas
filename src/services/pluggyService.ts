import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  deleteDoc,
  query,
  where,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { PluggyItem, PluggyAccount, ExpenseOrigin, ExpenseCategory } from '../types';

const PLUGGY_API_URL = 'https://api.pluggy.ai';

const CLIENT_ID = process.env.EXPO_PUBLIC_PLUGGY_CLIENT_ID || '';
const CLIENT_SECRET = process.env.EXPO_PUBLIC_PLUGGY_CLIENT_SECRET || '';


export interface PluggyConnectTokenResponse {
  accessToken: string;
}

/**
 * Gera um Connect Token de uso único/temporário para abrir a janela do Pluggy Connect Widget.
 */
export async function getConnectToken(itemIdToUpdate?: string): Promise<string> {
  const apiKey = await getApiKey();

  const response = await fetch(`${PLUGGY_API_URL}/connect_token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-API-KEY': apiKey,
    },
    body: JSON.stringify({
      itemId: itemIdToUpdate || undefined,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Falha ao obter token da Pluggy: ${errText}`);
  }

  const data: any = await response.json();
  const token = data.accessToken || data.connectToken || data.token;
  if (!token) {
    throw new Error('Token de conexão não retornado pela API da Pluggy');
  }

  return token;
}



/**
 * Gera uma chave de API para chamadas diretas aos endpoints REST da Pluggy.
 */
export async function getApiKey(): Promise<string> {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error('Chaves da Pluggy não encontradas no arquivo .env');
  }

  const response = await fetch(`${PLUGGY_API_URL}/auth`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Falha ao autenticar na Pluggy: ${errText}`);
  }

  const data = await response.json();
  return data.apiKey;
}

/**
 * Busca detalhes de um Item (conexão bancária) na Pluggy.
 */
export async function fetchPluggyItemDetails(itemId: string, apiKey: string) {
  const res = await fetch(`${PLUGGY_API_URL}/items/${itemId}`, {
    headers: { 'X-API-KEY': apiKey },
  });
  if (!res.ok) throw new Error('Erro ao buscar item na Pluggy');
  return res.json();
}

/**
 * Busca todas as contas vinculadas a um Item.
 */
export async function fetchPluggyAccounts(itemId: string, apiKey: string) {
  const res = await fetch(`${PLUGGY_API_URL}/accounts?itemId=${itemId}`, {
    headers: { 'X-API-KEY': apiKey },
  });
  if (!res.ok) throw new Error('Erro ao buscar contas na Pluggy');
  const data = await res.json();
  return data.results || [];
}

/**
 * Busca transações recentes de uma conta.
 */
export async function fetchPluggyTransactions(accountId: string, apiKey: string, fromDate?: string) {
  let url = `${PLUGGY_API_URL}/transactions?accountId=${accountId}`;
  if (fromDate) {
    url += `&from=${fromDate}`;
  }
  const res = await fetch(url, {
    headers: { 'X-API-KEY': apiKey },
  });
  if (!res.ok) throw new Error('Erro ao buscar transações na Pluggy');
  const data = await res.json();
  return data.results || [];
}

/**
 * Mapeia categorias padrão da Pluggy para as categorias do NRFinance
 */
export function mapPluggyCategoryToExpenseCategory(pluggyCat?: string): ExpenseCategory {
  if (!pluggyCat) return 'Outros';

  const catLower = pluggyCat.toLowerCase();
  if (catLower.includes('food') || catLower.includes('alimen') || catLower.includes('restauran') || catLower.includes('superm')) {
    return 'Alimentação';
  }
  if (catLower.includes('transport') || catLower.includes('uber') || catLower.includes('combust') || catLower.includes('posto')) {
    return 'Transporte';
  }
  if (catLower.includes('housing') || catLower.includes('moradia') || catLower.includes('aluguel') || catLower.includes('luz') || catLower.includes('agua')) {
    return 'Moradia';
  }
  if (catLower.includes('health') || catLower.includes('saude') || catLower.includes('farmac') || catLower.includes('medic')) {
    return 'Saúde';
  }
  if (catLower.includes('leisure') || catLower.includes('lazer') || catLower.includes('cinem') || catLower.includes('viagem') || catLower.includes('entreten')) {
    return 'Lazer';
  }
  if (catLower.includes('services') || catLower.includes('servi') || catLower.includes('fornec')) {
    return 'Fornecedores';
  }

  return 'Outros';
}

// --- PERSISTÊNCIA FIRESTORE PARA CONEXÕES PLUGGY DO USUÁRIO ---

export async function saveUserPluggyItem(userId: string, item: PluggyItem): Promise<void> {
  const ref = doc(db, 'users', userId, 'pluggy_items', item.id);
  await setDoc(ref, {
    ...item,
    createdAt: Timestamp.fromDate(item.createdAt),
    updatedAt: Timestamp.fromDate(item.updatedAt),
  });
}

export async function getUserPluggyItems(userId: string): Promise<PluggyItem[]> {
  const ref = collection(db, 'users', userId, 'pluggy_items');
  const snap = await getDocs(ref);
  return snap.docs.map((docSnap) => {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      connectorId: data.connectorId,
      connectorName: data.connectorName,
      connectorLogo: data.connectorLogo,
      status: data.status,
      createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
      updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : new Date(),
    };
  });
}

export async function deleteUserPluggyItem(userId: string, itemId: string): Promise<void> {
  const itemRef = doc(db, 'users', userId, 'pluggy_items', itemId);
  await deleteDoc(itemRef);

  const accsRef = collection(db, 'users', userId, 'pluggy_accounts');
  const q = query(accsRef, where('itemId', '==', itemId));
  const snap = await getDocs(q);
  const deletePromises = snap.docs.map((d) => deleteDoc(d.ref));
  await Promise.all(deletePromises);
}

export async function saveUserPluggyAccount(userId: string, account: PluggyAccount): Promise<void> {
  const ref = doc(db, 'users', userId, 'pluggy_accounts', account.id);
  await setDoc(ref, account, { merge: true });
}

export async function getUserPluggyAccounts(userId: string): Promise<PluggyAccount[]> {
  const ref = collection(db, 'users', userId, 'pluggy_accounts');
  const snap = await getDocs(ref);
  return snap.docs.map((d) => d.data() as PluggyAccount);
}

export async function updateUserPluggyAccountOrigin(
  userId: string,
  accountId: string,
  origemDefault: ExpenseOrigin
): Promise<void> {
  const ref = doc(db, 'users', userId, 'pluggy_accounts', accountId);
  await setDoc(ref, { origemDefault }, { merge: true });
}
