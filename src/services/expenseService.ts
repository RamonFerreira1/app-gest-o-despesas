import {
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  writeBatch,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { Expense, ExpenseCategory, ExpenseFirestore, ExpenseOrigin, ExpenseType } from '../types';
import { addMonths, format, startOfMonth, endOfMonth } from 'date-fns';

// Gera um UUID simples
function generateId(): string {
  return Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
}

function firestoreToExpense(id: string, data: any): Expense {
  return {
    id,
    nome: data.nome,
    valor: data.valor,
    categoria: data.categoria,
    data: data.data.toDate(),
    origem: data.origem,
    tipo: data.tipo,
    totalParcelas: data.totalParcelas ?? null,
    parcelasRestantes: data.parcelasRestantes ?? null,
    grupoRecorrenciaId: data.grupoRecorrenciaId ?? null,
    parcelaNumero: data.parcelaNumero ?? null,
    createdAt: data.createdAt.toDate(),
  };
}

// ─── CRIAR DESPESA ÚNICA ──────────────────────────────────────────────────────
export async function createExpense(
  userId: string,
  expense: Omit<Expense, 'id' | 'createdAt' | 'grupoRecorrenciaId' | 'parcelaNumero' | 'totalParcelas' | 'parcelasRestantes'>
): Promise<string> {
  const ref = collection(db, `users/${userId}/expenses`);
  const docData: ExpenseFirestore = {
    nome: expense.nome,
    valor: expense.valor,
    categoria: expense.categoria,
    data: Timestamp.fromDate(expense.data),
    origem: expense.origem,
    tipo: 'unica',
    totalParcelas: null,
    parcelasRestantes: null,
    grupoRecorrenciaId: null,
    parcelaNumero: null,
    createdAt: Timestamp.now(),
  };
  const result = await addDoc(ref, docData);
  return result.id;
}

// ─── CRIAR DESPESA RECORRENTE (N parcelas) ───────────────────────────────────
export async function createRecurringExpense(
  userId: string,
  expense: Omit<Expense, 'id' | 'createdAt' | 'grupoRecorrenciaId' | 'parcelaNumero'>,
  totalMeses: number
): Promise<void> {
  const groupId = generateId();
  const batch = writeBatch(db);
  const ref = collection(db, `users/${userId}/expenses`);

  for (let i = 0; i < totalMeses; i++) {
    const dataProjetada = addMonths(expense.data, i);
    const docRef = doc(ref);
    const docData: ExpenseFirestore = {
      nome: expense.nome,
      valor: expense.valor,
      categoria: expense.categoria,
      data: Timestamp.fromDate(dataProjetada),
      origem: expense.origem,
      tipo: 'recorrente',
      totalParcelas: totalMeses,
      parcelasRestantes: totalMeses - i,
      grupoRecorrenciaId: groupId,
      parcelaNumero: i + 1,
      createdAt: Timestamp.now(),
    };
    batch.set(docRef, docData);
  }

  await batch.commit();
}

// ─── BUSCAR DESPESAS DO MÊS ───────────────────────────────────────────────────
export async function getExpensesByMonth(userId: string, date: Date): Promise<Expense[]> {
  const start = Timestamp.fromDate(startOfMonth(date));
  const end = Timestamp.fromDate(endOfMonth(date));

  const ref = collection(db, `users/${userId}/expenses`);
  const q = query(ref, where('data', '>=', start), where('data', '<=', end), orderBy('data', 'desc'));

  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => firestoreToExpense(d.id, d.data()));
}

// ─── BUSCAR TODAS AS DESPESAS ─────────────────────────────────────────────────
export async function getAllExpenses(userId: string): Promise<Expense[]> {
  const ref = collection(db, `users/${userId}/expenses`);
  const q = query(ref, orderBy('data', 'desc'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => firestoreToExpense(d.id, d.data()));
}

// ─── DELETAR DESPESA ÚNICA ────────────────────────────────────────────────────
export async function deleteExpense(userId: string, expenseId: string): Promise<void> {
  const ref = doc(db, `users/${userId}/expenses`, expenseId);
  await deleteDoc(ref);
}

// ─── DELETAR GRUPO RECORRENTE (todas as parcelas futuras ou todas) ────────────
export async function deleteRecurringGroup(
  userId: string,
  grupoRecorrenciaId: string,
  fromDate?: Date
): Promise<void> {
  const ref = collection(db, `users/${userId}/expenses`);
  const q = query(ref, where('grupoRecorrenciaId', '==', grupoRecorrenciaId));
  const snapshot = await getDocs(q);

  const batch = writeBatch(db);
  snapshot.docs.forEach((d) => {
    const expense = d.data();
    const expDate: Date = expense.data.toDate();
    if (!fromDate || expDate >= fromDate) {
      batch.delete(d.ref);
    }
  });
  await batch.commit();
}

// ─── BUSCAR DESPESAS RECORRENTES DO PRÓXIMO MÊS ───────────────────────────────
export async function getNextMonthRecurring(userId: string): Promise<Expense[]> {
  const nextMonth = addMonths(new Date(), 1);
  const start = Timestamp.fromDate(startOfMonth(nextMonth));
  const end = Timestamp.fromDate(endOfMonth(nextMonth));

  const ref = collection(db, `users/${userId}/expenses`);
  const q = query(
    ref,
    where('tipo', '==', 'recorrente'),
    where('data', '>=', start),
    where('data', '<=', end)
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => firestoreToExpense(d.id, d.data()));
}
