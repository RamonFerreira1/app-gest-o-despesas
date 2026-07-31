import { collection, doc, getDocs, setDoc, Timestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { ExpenseCategory, ExpenseOrigin } from '../types';

export interface CategoryRule {
  id: string;
  keyword: string; // Ex: "supermercado", "uber", "fornecedor"
  category: ExpenseCategory;
  origin: ExpenseOrigin;
  createdAt: Date;
}

function cleanKeyword(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim();
}

/**
 * Busca todas as regras de categorização aprendidas do usuário.
 */
export async function getUserCategoryRules(userId: string): Promise<CategoryRule[]> {
  try {
    const ref = collection(db, 'users', userId, 'category_rules');
    const snap = await getDocs(ref);
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        keyword: data.keyword,
        category: data.category,
        origin: data.origin,
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
      };
    });
  } catch (err) {
    console.warn('Erro ao carregar regras de categorização:', err);
    return [];
  }
}

/**
 * Salva uma nova regra de aprendizado (ou atualiza existente) com base na descrição da transação.
 */
export async function saveUserCategoryRule(
  userId: string,
  rawDescription: string,
  category: ExpenseCategory,
  origin: ExpenseOrigin
): Promise<void> {
  const keyword = cleanKeyword(rawDescription);
  if (!keyword || keyword.length < 3) return;

  // Usa as primeiras 3 palavras ou a palavra principal para criar o ID da regra
  const ruleId = keyword.substring(0, 30).replace(/\s+/g, '_');
  const ref = doc(db, 'users', userId, 'category_rules', ruleId);

  await setDoc(
    ref,
    {
      keyword,
      category,
      origin,
      createdAt: Timestamp.now(),
    },
    { merge: true }
  );
}

/**
 * Aplica as regras salvas do usuário à descrição de uma nova transação.
 */
export function applyUserCategoryRules(
  rawDescription: string,
  rules: CategoryRule[],
  defaultCategory: ExpenseCategory,
  defaultOrigin: ExpenseOrigin
): { category: ExpenseCategory; origin: ExpenseOrigin } {
  if (!rules || rules.length === 0) {
    return { category: defaultCategory, origin: defaultOrigin };
  }

  const cleanedTx = cleanKeyword(rawDescription);

  for (const rule of rules) {
    if (cleanedTx.includes(rule.keyword) || rule.keyword.includes(cleanedTx)) {
      return {
        category: rule.category,
        origin: rule.origin,
      };
    }
  }

  return { category: defaultCategory, origin: defaultOrigin };
}
