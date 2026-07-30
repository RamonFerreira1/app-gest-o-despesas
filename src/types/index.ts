import { Timestamp } from 'firebase/firestore';

export type ExpenseOrigin = 'pessoal' | 'negocio';
export type ExpenseType = 'unica' | 'recorrente';
export type ExpensePaymentSource = 'corrente' | 'reservado';

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
  fontePagamento?: ExpensePaymentSource;
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
  fontePagamento?: ExpensePaymentSource;
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
  valorReservado: number;
  updatedAt: Date;
}

export interface BudgetFirestore {
  mes: string;
  limite: number;
  rendaMensal: number;
  valorReservado?: number;
  updatedAt: Timestamp;
}

export interface InsightData {
  type: 'warning' | 'danger' | 'info' | 'success';
  title: string;
  message: string;
  icon: string;
}

export interface MonthSummary {
  totalGasto: number; // Apenas gastos com fonte 'corrente'
  totalGastoReservado: number; // Gastos com fonte 'reservado' no mês
  totalGastoReservadoAcumulado: number; // Gastos acumulados da reserva (histórico completo)
  totalPessoal: number;
  totalNegocio: number;
  byCategory: Record<string, number>;
  limite: number;
  percentualUsado: number;
  saldoRestante: number;
  valorReservado: number;
  saldoReservaRestante: number;
}

export interface PluggyItem {
  id: string;
  connectorId: number;
  connectorName: string;
  connectorLogo?: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PluggyAccount {
  id: string;
  itemId: string;
  name: string;
  number?: string;
  balance: number;
  type: string;
  subtype?: string;
  bankName: string;
  origemDefault: ExpenseOrigin; // 'pessoal' | 'negocio'
}

export type PendingTransactionStatus = 'pending' | 'imported' | 'ignored';

export interface PendingTransaction {
  id: string;
  pluggyTransactionId: string;
  itemId: string;
  accountId: string;
  bankName: string;
  description: string;
  amount: number; // sempre valor positivo (para despesas)
  date: Date;
  pluggyCategory?: string;
  suggestedCategory: ExpenseCategory;
  suggestedOrigin: ExpenseOrigin;
  status: PendingTransactionStatus;
  createdAt: Date;
}

export interface PendingTransactionFirestore {
  id?: string;
  pluggyTransactionId: string;
  itemId: string;
  accountId: string;
  bankName: string;
  description: string;
  amount: number;
  date: Timestamp;
  pluggyCategory?: string;
  suggestedCategory: ExpenseCategory;
  suggestedOrigin: ExpenseOrigin;
  status: PendingTransactionStatus;
  createdAt: Timestamp;
}


