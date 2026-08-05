import {
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { ExpenseOrigin } from '../types';

export interface BelvoLink {
  id: string;
  institution: string;
  institutionLogo?: string;
  accessMode: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface BelvoAccount {
  id: string;
  linkId: string;
  name: string;
  number?: string;
  balance: number;
  currency: string;
  type: string;
  bankName: string;
  origemDefault: ExpenseOrigin;
}

/**
 * Obtém token do Belvo via Vercel Serverless Function.
 */
export async function getBelvoWidgetToken(): Promise<{ access: string; environment: string }> {
  const apiEndpoint =
    typeof window !== 'undefined' && window.location?.origin
      ? `${window.location.origin}/api/belvo/token`
      : 'https://app-gest-o-despesas.vercel.app/api/belvo/token';

  const res = await fetch(apiEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Não foi possível obter o token do Belvo Widget.');
  }

  return data;
}

/**
 * Salva um Link do Belvo no Firestore do usuário.
 */
export async function saveUserBelvoLink(
  userId: string,
  link: Omit<BelvoLink, 'createdAt' | 'updatedAt'>
): Promise<void> {
  const ref = doc(db, 'users', userId, 'belvo_links', link.id);
  await setDoc(ref, {
    ...link,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });
}

/**
 * Busca todos os Links Belvo do usuário no Firestore.
 */
export async function getUserBelvoLinks(userId: string): Promise<BelvoLink[]> {
  const ref = collection(db, 'users', userId, 'belvo_links');
  const snap = await getDocs(ref);

  return snap.docs.map((docSnap) => {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      institution: data.institution || 'Banco',
      institutionLogo: data.institutionLogo,
      accessMode: data.accessMode || 'single',
      status: data.status || 'valid',
      createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
      updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : new Date(),
    };
  });
}

/**
 * Salva uma Conta Belvo no Firestore do usuário.
 */
export async function saveUserBelvoAccount(
  userId: string,
  account: BelvoAccount
): Promise<void> {
  const ref = doc(db, 'users', userId, 'belvo_accounts', account.id);
  await setDoc(ref, {
    ...account,
    updatedAt: Timestamp.now(),
  });
}

/**
 * Busca todas as Contas Belvo salvas para o usuário.
 */
export async function getUserBelvoAccounts(userId: string): Promise<BelvoAccount[]> {
  const ref = collection(db, 'users', userId, 'belvo_accounts');
  const snap = await getDocs(ref);

  return snap.docs.map((docSnap) => {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      linkId: data.linkId,
      name: data.name || 'Conta Bancária',
      number: data.number,
      balance: data.balance || 0,
      currency: data.currency || 'BRL',
      type: data.type || 'CHECKING_ACCOUNT',
      bankName: data.bankName || 'Banco',
      origemDefault: data.origemDefault || 'pessoal',
    };
  });
}

/**
 * Atualiza a origem default da conta Belvo (pessoal/negócio).
 */
export async function updateUserBelvoAccountOrigin(
  userId: string,
  accountId: string,
  newOrigin: ExpenseOrigin
): Promise<void> {
  const ref = doc(db, 'users', userId, 'belvo_accounts', accountId);
  await updateDoc(ref, {
    origemDefault: newOrigin,
    updatedAt: Timestamp.now(),
  });
}

/**
 * Remove um Link Belvo e suas contas associadas.
 */
export async function deleteUserBelvoLink(userId: string, linkId: string): Promise<void> {
  const linkRef = doc(db, 'users', userId, 'belvo_links', linkId);
  await deleteDoc(linkRef);

  // Remove também as contas associadas a este link
  const accountsRef = collection(db, 'users', userId, 'belvo_accounts');
  const snap = await getDocs(accountsRef);
  for (const docSnap of snap.docs) {
    if (docSnap.data().linkId === linkId) {
      await deleteDoc(doc(db, 'users', userId, 'belvo_accounts', docSnap.id));
    }
  }
}
