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
import { createExpense, getAllExpenses } from './expenseService';
import {
  getApiKey,
  fetchPluggyAccounts,
  fetchPluggyTransactions,
  getUserPluggyAccounts,
  mapPluggyCategoryToExpenseCategory,
} from './pluggyService';
import {
  getUserCategoryRules,
  saveUserCategoryRule,
  applyUserCategoryRules,
} from './categoryRuleService';

/**
 * Busca todas as movimentações pendentes de conciliação do usuário.
 */
export async function getPendingTransactions(userId: string): Promise<PendingTransaction[]> {
  const ref = collection(db, 'users', userId, 'pending_transactions');
  // Consulta filtrando por status (sem orderBy na query para não exigir índice composto no Firestore)
  const q = query(ref, where('status', '==', 'pending'));
  const snap = await getDocs(q);

  const list = snap.docs.map((docSnap) => {
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
      isPossibleDuplicate: data.isPossibleDuplicate || false,
      matchedExpenseName: data.matchedExpenseName || undefined,
      createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
    };
  });

  return list.sort((a, b) => b.date.getTime() - a.date.getTime());
}


/**
 * Sincroniza e busca movimentações recentes dos bancos conectados via Pluggy
 * e as adiciona na fila de conciliação pendente do usuário.
 * @param daysBack Quantidade de dias retroativos para busca (0 = apenas a partir de hoje / data de conexão).
 */
export async function syncPluggyTransactions(
  userId: string,
  itemId: string,
  daysBack: number = 30
): Promise<number> {
  const apiKey = await getApiKey();
  const accounts = await fetchPluggyAccounts(itemId, apiKey);
  const userAccounts = await getUserPluggyAccounts(userId);

  // Carrega as regras de categorização aprendidas do usuário
  const userRules = await getUserCategoryRules(userId);

  // Busca todos os gastos existentes para detecção de duplicados
  let existingExpenses: any[] = [];
  try {
    existingExpenses = await getAllExpenses(userId);
  } catch (e) {
    console.warn('Não foi possível buscar gastos para verificação de duplicados:', e);
  }

  let totalNew = 0;

  // Define a data limite inicial para a Pluggy
  let fromStr: string;
  if (daysBack === 0) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    fromStr = today.toISOString().split('T')[0];
  } else {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);
    fromStr = startDate.toISOString().split('T')[0];
  }

  for (const account of accounts) {
    const matchingUserAcc = userAccounts.find((a) => a.id === account.id);
    const defaultOrigin: ExpenseOrigin = matchingUserAcc?.origemDefault || 'pessoal';
    const bankName = matchingUserAcc?.bankName || account.name || 'Banco';

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

      // Verifica se a transação já foi processada anteriormente na fila de conciliação
      const existingRef = doc(db, 'users', userId, 'pending_transactions', pluggyTxId);
      const snap = await getDocs(
        query(
          collection(db, 'users', userId, 'pending_transactions'),
          where('pluggyTransactionId', '==', pluggyTxId)
        )
      );

      if (snap.empty) {
        const defaultCat = mapPluggyCategoryToExpenseCategory(tx.category);
        const txDate = tx.date ? new Date(tx.date) : new Date();

        // Aplica regras de aprendizado salvas pelo usuário (se houver correspondência com a descrição)
        const { category: suggestedCategory, origin: suggestedOrigin } = applyUserCategoryRules(
          tx.description || '',
          userRules,
          defaultCat,
          defaultOrigin
        );

        // Checa se já existe um gasto manual cadastrado com mesmo valor e data aproximada (±2 dias)
        const matchingExpense = existingExpenses.find((exp) => {
          const sameAmount = Math.abs(exp.valor - positiveAmount) < 0.01;
          const expTime = exp.data instanceof Date ? exp.data.getTime() : new Date(exp.data).getTime();
          const dayDiff = Math.abs(txDate.getTime() - expTime) / (1000 * 60 * 60 * 24);
          return sameAmount && dayDiff <= 2;
        });

        await setDoc(existingRef, {
          pluggyTransactionId: pluggyTxId,
          itemId,
          accountId: account.id,
          bankName,
          description: tx.description || 'Lançamento bancário',
          amount: positiveAmount,
          date: Timestamp.fromDate(txDate),
          pluggyCategory: tx.category || null,
          suggestedCategory,
          suggestedOrigin,
          status: 'pending',
          isPossibleDuplicate: !!matchingExpense,
          matchedExpenseName: matchingExpense ? matchingExpense.nome : null,
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
 * Também memoriza a preferência do usuário para futuras sincronizações.
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

  // 2. Memorizar a regra de categorização do usuário para esta descrição/estabelecimento
  try {
    await saveUserCategoryRule(userId, pendingTx.description, categoria, origem);
  } catch (ruleErr) {
    console.warn('Erro ao salvar regra de aprendizado de categorização:', ruleErr);
  }

  // 3. Marcar a transação pendente como importada
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
