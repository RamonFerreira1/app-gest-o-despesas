import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { Expense } from '../types';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export interface MonthlyReport {
  month: string;       // ex: "Jul 2025"
  monthKey: string;    // ex: "2025-07"
  total: number;
  totalPessoal: number;
  totalNegocio: number;
  byCategory: Record<string, number>;
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
    fontePagamento: data.fontePagamento ?? 'corrente',
    totalParcelas: data.totalParcelas ?? null,
    parcelasRestantes: data.parcelasRestantes ?? null,
    grupoRecorrenciaId: data.grupoRecorrenciaId ?? null,
    parcelaNumero: data.parcelaNumero ?? null,
    createdAt: data.createdAt.toDate(),
  };
}

/**
 * Busca despesas de um mês específico (apenas corrente)
 */
async function getExpensesForMonth(userId: string, date: Date): Promise<Expense[]> {
  const start = startOfMonth(date);
  const end = endOfMonth(date);
  const ref = collection(db, `users/${userId}/expenses`);
  const q = query(
    ref,
    where('data', '>=', Timestamp.fromDate(start)),
    where('data', '<=', Timestamp.fromDate(end)),
    where('fontePagamento', '!=', 'reservado')
  );

  try {
    const snap = await getDocs(q);
    return snap.docs.map((d) => firestoreToExpense(d.id, d.data()));
  } catch {
    // Fallback sem filtro de fontePagamento (índice pode não existir)
    const q2 = query(
      ref,
      where('data', '>=', Timestamp.fromDate(start)),
      where('data', '<=', Timestamp.fromDate(end))
    );
    const snap2 = await getDocs(q2);
    return snap2.docs
      .map((d) => firestoreToExpense(d.id, d.data()))
      .filter((e) => (e.fontePagamento ?? 'corrente') !== 'reservado');
  }
}

/**
 * Busca os últimos N meses de relatórios
 */
export async function getMonthlyReports(userId: string, monthsBack: number = 6): Promise<MonthlyReport[]> {
  const now = new Date();
  const reports: MonthlyReport[] = [];

  for (let i = monthsBack - 1; i >= 0; i--) {
    const date = subMonths(now, i);
    const expenses = await getExpensesForMonth(userId, date);

    const total = expenses.reduce((sum, e) => sum + e.valor, 0);
    const totalPessoal = expenses.filter((e) => e.origem === 'pessoal').reduce((sum, e) => sum + e.valor, 0);
    const totalNegocio = expenses.filter((e) => e.origem === 'negocio').reduce((sum, e) => sum + e.valor, 0);

    const byCategory: Record<string, number> = {};
    expenses.forEach((e) => {
      byCategory[e.categoria] = (byCategory[e.categoria] ?? 0) + e.valor;
    });

    reports.push({
      month: format(date, 'MMM yyyy', { locale: ptBR }),
      monthKey: format(date, 'yyyy-MM'),
      total,
      totalPessoal,
      totalNegocio,
      byCategory,
    });
  }

  return reports;
}
