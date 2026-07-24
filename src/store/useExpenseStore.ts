import { create } from 'zustand';
import { Expense, Budget, MonthSummary, InsightData } from '../types';
import { getExpensesByMonth, getNextMonthRecurring, getReservedExpensesTotal } from '../services/expenseService';
import { getOrCreateBudget } from '../services/budgetService';
import { calcMonthSummary, generateInsights } from '../services/insightService';

interface ExpenseState {
  expenses: Expense[];
  nextMonthRecurring: Expense[];
  budget: Budget | null;
  summary: MonthSummary | null;
  insights: InsightData[];
  reservedExpensesTotal: number;
  loading: boolean;
  selectedMonth: Date;
  setSelectedMonth: (date: Date) => void;
  loadData: (userId: string, month?: Date) => Promise<void>;
  addExpenseLocally: (expense: Expense) => void;
  removeExpenseLocally: (id: string) => void;
}

const defaultBudget: Budget = {
  mes: '',
  limite: 3000,
  rendaMensal: 0,
  valorReservado: 0,
  updatedAt: new Date(),
};

export const useExpenseStore = create<ExpenseState>((set, get) => ({
  expenses: [],
  nextMonthRecurring: [],
  budget: null,
  summary: null,
  insights: [],
  reservedExpensesTotal: 0,
  loading: false,
  selectedMonth: new Date(),

  setSelectedMonth: (date) => {
    set({ selectedMonth: date });
  },

  loadData: async (userId, month) => {
    set({ loading: true });
    try {
      const targetMonth = month ?? get().selectedMonth;
      const [expenses, budget, nextRecurring, reservedTotal] = await Promise.all([
        getExpensesByMonth(userId, targetMonth),
        getOrCreateBudget(userId),
        getNextMonthRecurring(userId),
        getReservedExpensesTotal(userId),
      ]);
      const summary = calcMonthSummary(expenses, budget, reservedTotal);
      const insights = generateInsights(summary, nextRecurring, budget);
      set({
        expenses,
        budget,
        nextMonthRecurring: nextRecurring,
        summary,
        insights,
        reservedExpensesTotal: reservedTotal,
        loading: false,
      });
    } catch (e) {
      console.error('Error loading data:', e);
      set({ loading: false });
    }
  },

  addExpenseLocally: (expense) => {
    const { expenses, budget, nextMonthRecurring, reservedExpensesTotal } = get();
    const updated = [expense, ...expenses];
    const newReservedTotal = expense.fontePagamento === 'reservado'
      ? reservedExpensesTotal + expense.valor
      : reservedExpensesTotal;
    const bgt = budget ?? defaultBudget;
    const summary = calcMonthSummary(updated, bgt, newReservedTotal);
    const insights = generateInsights(summary, nextMonthRecurring, bgt);
    set({ expenses: updated, reservedExpensesTotal: newReservedTotal, summary, insights });
  },

  removeExpenseLocally: (id) => {
    const { expenses, budget, nextMonthRecurring, reservedExpensesTotal } = get();
    const removedItem = expenses.find((e) => e.id === id);
    const updated = expenses.filter((e) => e.id !== id);
    const newReservedTotal = (removedItem && removedItem.fontePagamento === 'reservado')
      ? Math.max(0, reservedExpensesTotal - removedItem.valor)
      : reservedExpensesTotal;
    const bgt = budget ?? defaultBudget;
    const summary = calcMonthSummary(updated, bgt, newReservedTotal);
    const insights = generateInsights(summary, nextMonthRecurring, bgt);
    set({ expenses: updated, reservedExpensesTotal: newReservedTotal, summary, insights });
  },
}));
