import {
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { PendingTransaction, ExpenseCategory, ExpenseOrigin } from '../types';
import { createExpense } from './expenseService';
import {
  getApiKey,
  fetchPluggyAccounts,
  fetchPluggyTransactions,
  getUserPluggyAccounts,
  mapPluggyCategoryToExpenseCategory,
} from './pluggyService';

/**
 * Busca todas as movimentações pendentes de conciliação do usuário.
 */
export async function getPendingTransactions(userId: string): Promise<PendingTransaction[]> {
  const ref = collection(db, 'users', userId, 'pending_transactions');
  const q = query(ref, where('status', '==', 'pending'), orderBy('date', 'desc'));
  const snap = await getDocs(q);

  return snap.docs.map((docSnap) => {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      pluggyTransactionId: data.pluggyTransactionId,
      itemId: data.itemId,
      accountId: data.accountId,
      bankName: data.bankName || 'Banco',
      description: data.description,
      amount: data.amount,
      date: data.date?.toDate ? data.date.toDate() : new Date(),
      pluggyCategory: data.pluggyCategory,
      suggestedCategory: data.suggestedCategory || 'Outros',
      suggestedOrigin: data.suggestedOrigin || 'pessoal',
      status: data.status,
      createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
    };
  });
}

/**
 * Sincroniza e busca movimentações recentes dos bancos conectados via Pluggy
 * e as adiciona na fila de conciliação pendente do usuário.
 */
export async function syncPluggyTransactions(userId: string, itemId: string): Promise<number> {
  const apiKey = await getApiKey();
  const accounts = await fetchPluggyAccounts(itemId, apiKey);
  const userAccounts = await getUserPluggyAccounts(userId);

  let totalNew = 0;

  for (const account of accounts) {
    const matchingUserAcc = userAccounts.find((a) => a.id === account.id);
    const suggestedOrigin: ExpenseOrigin = matchingUserAcc?.origemDefault || 'pessoal';
    const bankName = matchingUserAcc?.bankName || account.name || 'Banco';

    // Busca transações recentes dos últimos 30 dias
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const fromStr = thirtyDaysAgo.toISOString().split('T')[0];

    const pluggyTxs = await fetchPluggyTransactions(account.id, apiKey, fromStr);

    for (const tx of pluggyTxs) {
      // Consideramos movimentações que representam saída/gasto (amount negativo na API da Pluggy)
      // Se amount for negativo, convertemos para positivo para o modelo Expense do NRFinance.
      const rawAmount = tx.amount || 0;
      if (rawAmount >= 0) {
        // Ignora entradas / proventos se o objetivo for conciliar despesas
        continue;
      }

      const positiveAmount = Math.abs(rawAmount);
      const pluggyTxId = tx.id;

      // Verifica se a transação já foi processada anteriormente
      const existingRef = doc(db, 'users', userId, 'pending_transactions', pluggyTxId);
      const snap = await getDocs(
        query(
          collection(db, 'users', userId, 'pending_transactions'),
          where('pluggyTransactionId', '==', pluggyTxId)
        )
      );

      if (snap.empty) {
        const cat = mapPluggyCategoryToExpenseCategory(tx.category);
        const txDate = tx.date ? new Date(tx.date) : new Date();

        await setDoc(existingRef, {
          pluggyTransactionId: pluggyTxId,
          itemId,
          accountId: account.id,
          bankName,
          description: tx.description || 'Lançamento bancário',
          amount: positiveAmount,
          date: Timestamp.fromDate(txDate),
          pluggyCategory: tx.category || null,
          suggestedCategory: cat,
          suggestedOrigin,
          status: 'pending',
          createdAt: Timestamp.now(),
        });

        totalNew++;
      }
    }
  }

  return totalNew;
}

/**
 * Aprova uma movimentação pendente, convertendo-a em uma Despesa (Expense) no NRFinance.
 */
export async function approvePendingTransaction(
  userId: string,
  pendingTx: PendingTransaction,
  customData?: {
    nome?: string;
    categoria?: ExpenseCategory;
    origem?: ExpenseOrigin;
    valor?: number;
  }
): Promise<string> {
  const nome = customData?.nome || pendingTx.description;
  const categoria = customData?.categoria || pendingTx.suggestedCategory;
  const origem = customData?.origem || pendingTx.suggestedOrigin;
  const valor = customData?.valor ?? pendingTx.amount;

  // 1. Criar a Despesa no NRFinance
  const expenseId = await createExpense(userId, {
    nome,
    valor,
    categoria,
    data: pendingTx.date,
    origem,
    tipo: 'unica',
    fontePagamento: 'corrente',
  });

  // 2. Marcar a transação pendente como importada
  const pendingRef = doc(db, 'users', userId, 'pending_transactions', pendingTx.id);
  await updateDoc(pendingRef, {
    status: 'imported',
  });

  return expenseId;
}

/**
 * Ignora uma movimentação pendente para não ser adicionada às despesas.
 */
export async function ignorePendingTransaction(userId: string, pendingTxId: string): Promise<void> {
  const pendingRef = doc(db, 'users', userId, 'pending_transactions', pendingTxId);
  await updateDoc(pendingRef, {
    status: 'ignored',
  });
}
