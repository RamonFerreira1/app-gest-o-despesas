import {
  doc,
  getDoc,
  setDoc,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { Budget, BudgetFirestore } from '../types';
import { format } from 'date-fns';

function monthKey(date: Date): string {
  return format(date, 'yyyy-MM');
}

export async function getBudget(userId: string, date: Date): Promise<Budget | null> {
  const key = monthKey(date);
  const ref = doc(db, `users/${userId}/budgets`, key);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const data = snap.data() as BudgetFirestore;
  return {
    mes: data.mes,
    limite: data.limite,
    rendaMensal: data.rendaMensal ?? 0,
    updatedAt: data.updatedAt.toDate(),
  };
}

export async function setBudget(
  userId: string,
  date: Date,
  limite: number,
  rendaMensal: number
): Promise<void> {
  const key = monthKey(date);
  const ref = doc(db, `users/${userId}/budgets`, key);
  const data: BudgetFirestore = {
    mes: key,
    limite,
    rendaMensal,
    updatedAt: Timestamp.now(),
  };
  await setDoc(ref, data, { merge: true });
}

// Retorna o budget do mês atual, ou cria um padrão vazio
export async function getOrCreateBudget(userId: string): Promise<Budget> {
  const now = new Date();
  const existing = await getBudget(userId, now);
  if (existing) return existing;
  return {
    mes: monthKey(now),
    limite: 3000,
    rendaMensal: 0,
    updatedAt: now,
  };
}
