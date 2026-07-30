import {
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { Goal, GoalCategory, GoalFirestore } from '../types';

function firestoreToGoal(id: string, data: any): Goal {
  return {
    id,
    nome: data.nome,
    descricao: data.descricao,
    valorMeta: data.valorMeta,
    valorAtual: data.valorAtual ?? 0,
    categoria: data.categoria,
    emoji: data.emoji,
    cor: data.cor,
    prazo: data.prazo?.toDate?.() ?? undefined,
    concluida: data.concluida ?? false,
    createdAt: data.createdAt?.toDate?.() ?? new Date(),
  };
}

export async function getGoals(userId: string): Promise<Goal[]> {
  const ref = collection(db, `users/${userId}/goals`);
  const snap = await getDocs(ref);
  return snap.docs
    .map((d) => firestoreToGoal(d.id, d.data()))
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

export async function createGoal(
  userId: string,
  goal: Omit<Goal, 'id' | 'createdAt' | 'concluida'>
): Promise<string> {
  const ref = collection(db, `users/${userId}/goals`);
  const data: GoalFirestore = {
    nome: goal.nome,
    descricao: goal.descricao,
    valorMeta: goal.valorMeta,
    valorAtual: goal.valorAtual,
    categoria: goal.categoria,
    emoji: goal.emoji,
    cor: goal.cor,
    prazo: goal.prazo ? Timestamp.fromDate(goal.prazo) : undefined,
    concluida: false,
    createdAt: Timestamp.now(),
  };
  const docRef = await addDoc(ref, data);
  return docRef.id;
}

export async function updateGoalProgress(
  userId: string,
  goalId: string,
  valorAtual: number
): Promise<void> {
  const ref = doc(db, `users/${userId}/goals`, goalId);
  await updateDoc(ref, { valorAtual });
}

export async function toggleGoalDone(
  userId: string,
  goalId: string,
  concluida: boolean
): Promise<void> {
  const ref = doc(db, `users/${userId}/goals`, goalId);
  await updateDoc(ref, { concluida });
}

export async function deleteGoal(userId: string, goalId: string): Promise<void> {
  await deleteDoc(doc(db, `users/${userId}/goals`, goalId));
}

export const GOAL_PRESETS: Array<{
  categoria: GoalCategory;
  emoji: string;
  cor: string;
  sugestao: string;
}> = [
  { categoria: 'Viagem', emoji: '✈️', cor: '#4D9FFF', sugestao: 'Viagem de férias' },
  { categoria: 'Equipamento', emoji: '💻', cor: '#AB47BC', sugestao: 'Equipamento NR Brownies' },
  { categoria: 'Emergência', emoji: '🛡️', cor: '#00E676', sugestao: 'Fundo de emergência (6 meses)' },
  { categoria: 'Educação', emoji: '📚', cor: '#FF9100', sugestao: 'Curso ou formação' },
  { categoria: 'Casa', emoji: '🏠', cor: '#26A69A', sugestao: 'Reforma ou móvel novo' },
  { categoria: 'Negócio', emoji: '🏢', cor: '#FF7043', sugestao: 'Investimento NR Brownies' },
  { categoria: 'Outro', emoji: '🎯', cor: '#78909C', sugestao: 'Meta personalizada' },
];
