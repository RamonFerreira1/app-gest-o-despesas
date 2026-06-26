import { create } from 'zustand';
import { Expense, Budget, MonthSummary, InsightData } from '../types';
import { getExpensesByMonth, getNextMonthRecurring } from '../services/expenseService';
import { getOrCreateBudget } from '../services/budgetService';
import { calcMonthSummary, generateInsights } from '../services/insightService';

interface ExpenseState {
  expenses: Expense[];
  nextMonthRecurring: Expense[];
  budget: Budget | null;
  summary: MonthSummary | null;
  insights: InsightData[];
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
  updatedAt: new Date(),
};

export const useExpenseStore = create<ExpenseState>((set, get) => ({
  expenses: [],
  nextMonthRecurring: [],
  budget: null,
  summary: null,
  insights: [],
  loading: false,
  selectedMonth: new Date(),

  setSelectedMonth: (date) => {
    set({ selectedMonth: date });
  },

  loadData: async (userId, month) => {
    set({ loading: true });
    try {
      const targetMonth = month ?? get().selectedMonth;
      const [expenses, budget, nextRecurring] = await Promise.all([
        getExpensesByMonth(userId, targetMonth),
        getOrCreateBudget(userId),
        getNextMonthRecurring(userId),
      ]);
      const summary = calcMonthSummary(expenses, budget);
      const insights = generateInsights(summary, nextRecurring, budget);
      set({
        expenses,
        budget,
        nextMonthRecurring: nextRecurring,
        summary,
        insights,
        loading: false,
      });
    } catch (e) {
      console.error('Error loading data:', e);
      set({ loading: false });
    }
  },

  addExpenseLocally: (expense) => {
    const { expenses, budget, nextMonthRecurring } = get();
    const updated = [expense, ...expenses];
    const bgt = budget ?? defaultBudget;
    const summary = calcMonthSummary(updated, bgt);
    const insights = generateInsights(summary, nextMonthRecurring, bgt);
    set({ expenses: updated, summary, insights });
  },

  removeExpenseLocally: (id) => {
    const { expenses, budget, nextMonthRecurring } = get();
    const updated = expenses.filter((e) => e.id !== id);
    const bgt = budget ?? defaultBudget;
    const summary = calcMonthSummary(updated, bgt);
    const insights = generateInsights(summary, nextMonthRecurring, bgt);
    set({ expenses: updated, summary, insights });
  },
}));
