import { Timestamp } from 'firebase/firestore';

export type ExpenseOrigin = 'pessoal' | 'negocio';
export type ExpenseType = 'unica' | 'recorrente';
export type ExpenseCategory =
  | 'Alimentação'
  | 'Transporte'
  | 'Fornecedores'
  | 'Moradia'
  | 'Saúde'
  | 'Lazer'
  | 'Outros';

export interface Expense {
  id: string;
  nome: string;
  valor: number;
  categoria: ExpenseCategory;
  data: Date;
  origem: ExpenseOrigin;
  tipo: ExpenseType;
  totalParcelas: number | null;
  parcelasRestantes: number | null;
  grupoRecorrenciaId: string | null;
  parcelaNumero: number | null;
  createdAt: Date;
}

export interface ExpenseFirestore {
  id?: string;
  nome: string;
  valor: number;
  categoria: ExpenseCategory;
  data: Timestamp;
  origem: ExpenseOrigin;
  tipo: ExpenseType;
  totalParcelas: number | null;
  parcelasRestantes: number | null;
  grupoRecorrenciaId: string | null;
  parcelaNumero: number | null;
  createdAt: Timestamp;
}

export interface Budget {
  mes: string; // YYYY-MM
  limite: number;
  rendaMensal: number;
  updatedAt: Date;
}

export interface BudgetFirestore {
  mes: string;
  limite: number;
  rendaMensal: number;
  updatedAt: Timestamp;
}

export interface InsightData {
  type: 'warning' | 'danger' | 'info' | 'success';
  title: string;
  message: string;
  icon: string;
}

export interface MonthSummary {
  totalGasto: number;
  totalPessoal: number;
  totalNegocio: number;
  byCategory: Record<string, number>;
  limite: number;
  percentualUsado: number;
  saldoRestante: number;
}
