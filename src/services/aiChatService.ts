import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  orderBy,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { Expense, MonthSummary, Budget, PendingTransaction, ChatMessage } from '../types';
import { formatCurrency } from './insightService';

const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY || '';
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

export interface FinancialContext {
  expenses: Expense[];
  summary: MonthSummary | null;
  budget: Budget | null;
  pendingTransactions: PendingTransaction[];
}

/**
 * Processa a pergunta do usuário utilizando a API do Gemini (quando disponível)
 * ou o Motor de Inteligência Financeira Local (fallback instantâneo e offline).
 */
export async function askFinancialAI(
  prompt: string,
  context: FinancialContext
): Promise<string> {
  if (GEMINI_API_KEY) {
    try {
      const systemContextPrompt = buildSystemContextPrompt(context);
      const res = await fetch(GEMINI_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: `${systemContextPrompt}\n\nPergunta do Usuário: "${prompt}"\n\nResponda em português brasileiro de forma natural, amigável e direta, usando negrito para valores em R$ ou destaques importantes.`,
                },
              ],
            },
          ],
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (candidateText) {
          return candidateText.trim();
        }
      }
    } catch (err) {
      console.warn('Fallback para o motor local da IA:', err);
    }
  }

  return processLocalFinancialQuery(prompt, context);
}

function buildSystemContextPrompt(ctx: FinancialContext): string {
  const { summary, budget, expenses, pendingTransactions } = ctx;
  const mes = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  let text = `Você é o **NR Finance AI**, o assistente virtual de inteligência financeira do aplicativo **NRFinance** (para uso pessoal e do negócio NR Brownies e Bolos).\n`;
  text += `Contexto Financeiro Atual (${mes}):\n`;

  if (budget) {
    text += `- Teto de Gastos Mensais: ${formatCurrency(budget.limite)}\n`;
    text += `- Renda Mensal Informada: ${formatCurrency(budget.rendaMensal)}\n`;
    text += `- Valor Reservado Total: ${formatCurrency(budget.valorReservado || 0)}\n`;
  }

  if (summary) {
    text += `- Total Gasto no Mês (Orçamento): ${formatCurrency(summary.totalGasto)}\n`;
    text += `- Saldo Restante do Teto: ${formatCurrency(summary.saldoRestante)} (${(100 - summary.percentualUsado).toFixed(1)}% livre)\n`;
    text += `- Gastos Pessoais (PF): ${formatCurrency(summary.totalPessoal)}\n`;
    text += `- Gastos do Negócio NR Brownies (PJ): ${formatCurrency(summary.totalNegocio)}\n`;
    text += `- Gastos por Categoria:\n`;
    Object.entries(summary.byCategory).forEach(([cat, val]) => {
      text += `  * ${cat}: ${formatCurrency(val)}\n`;
    });
  }

  if (pendingTransactions.length > 0) {
    text += `- Movimentações Bancárias Pendentes de Conciliação (Pluggy): ${pendingTransactions.length} lançamentos.\n`;
  }

  if (expenses.length > 0) {
    text += `- Últimas Despesas Registradas:\n`;
    expenses.slice(0, 5).forEach((e) => {
      const dataFormatada = new Date(e.data).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      text += `  * ${e.nome} (${e.origem === 'negocio' ? 'PJ' : 'PF'} - ${e.categoria}): ${formatCurrency(e.valor)} em ${dataFormatada}\n`;
    });
  }

  return text;
}

function processLocalFinancialQuery(prompt: string, ctx: FinancialContext): string {
  const p = prompt.toLowerCase().trim();
  const { summary, budget, expenses, pendingTransactions } = ctx;

  // Perguntas sobre salvamento da conversa
  if (p.includes('salva') || p.includes('salvo') || p.includes('histórico') || p.includes('historico') || p.includes('grava') || p.includes('guardad')) {
    return `Sim! 💾 **Nossa conversa fica salva automaticamente** na sua conta com total segurança.\n\nSempre que você abrir o chat do **NR Finance AI**, você poderá ver as mensagens anteriores ou tocar no ícone de lixeira no topo para limpar o histórico!`;
  }

  // Cumprimentos
  if (p === 'oi' || p === 'olá' || p === 'ola' || p.startsWith('bom dia') || p.startsWith('boa tarde') || p.startsWith('boa noite')) {
    let greeting = `Olá! 👋 Como posso ajudar no gerenciamento das suas finanças pessoais ou da **NR Brownies** hoje?\n\n`;
    if (summary) {
      greeting += `Você já utilizou **${formatCurrency(summary.totalGasto)}** do seu teto de **${formatCurrency(summary.limite)}**. Restam **${formatCurrency(summary.saldoRestante)}** livres!`;
    }
    return greeting;
  }

  // Quem é você / Como funciona
  if (p.includes('quem é você') || p.includes('quem e voce') || p.includes('como funciona') || p.includes('o que você faz') || p.includes('o que voce faz')) {
    return `🤖 Sou o **NR Finance AI**, o seu assistente de inteligência financeira pessoal e empresarial!\n\nPosso calcular seu saldo restante, analisar gastos por categoria, comparar despesas Pessoais vs Negócio (PF/PJ), consultar seu Valor Reservado e dar dicas práticas para você economizar. Sinta-se à vontade para perguntar qualquer coisa!`;
  }

  // 1. Quanto gastei / Total gasto
  if (p.includes('quanto gastei') || p.includes('total gasto') || p.includes('resumo do mês') || p.includes('resumo dos gastos')) {
    if (!summary) return 'Você ainda não possui despesas registradas este mês.';
    let reply = `📊 **Resumo Financeiro do Mês**\n\n`;
    reply += `• **Total Gasto no Orçamento:** ${formatCurrency(summary.totalGasto)}\n`;
    reply += `• **Limite Mensal (Teto):** ${formatCurrency(summary.limite)}\n`;
    reply += `• **Saldo Disponível:** ${formatCurrency(summary.saldoRestante)}\n\n`;
    reply += `⚖️ **Divisão por Origem:**\n`;
    reply += `• **Pessoal (PF):** ${formatCurrency(summary.totalPessoal)}\n`;
    reply += `• **NR Brownies (PJ):** ${formatCurrency(summary.totalNegocio)}\n`;

    if (summary.totalGasto > summary.limite) {
      reply += `\n⚠️ **Alerta:** Você ultrapassou seu teto de gastos em ${formatCurrency(summary.totalGasto - summary.limite)}!`;
    }
    return reply;
  }

  // 2. Pessoal vs Negócio (PF / PJ)
  if (p.includes('pessoal') || p.includes('negocio') || p.includes('negócio') || p.includes('pj') || p.includes('pf') || p.includes('brownies')) {
    if (!summary) return 'Nenhum dado de gastos registrado ainda.';
    const total = summary.totalPessoal + summary.totalNegocio;
    const pctPF = total > 0 ? ((summary.totalPessoal / total) * 100).toFixed(1) : 0;
    const pctPJ = total > 0 ? ((summary.totalNegocio / total) * 100).toFixed(1) : 0;

    let reply = `⚖️ **Divisão Pessoal (PF) vs. Negócio (PJ)**\n\n`;
    reply += `👤 **Uso Pessoal (PF):** ${formatCurrency(summary.totalPessoal)} (${pctPF}%)\n`;
    reply += `🏢 **NR Brownies (PJ):** ${formatCurrency(summary.totalNegocio)} (${pctPJ}%)\n\n`;

    if (summary.totalNegocio > summary.totalPessoal) {
      reply += `💡 Os investimentos no seu negócio representam a maior fatia dos seus custos este mês!`;
    } else {
      reply += `💡 Suas despesas pessoais representam a maior parte dos seus gastos atuais.`;
    }
    return reply;
  }

  // 3. Orçamento / Teto / Quanto me resta
  if (p.includes('resta') || p.includes('sobra') || p.includes('teto') || p.includes('limite') || p.includes('disponivel') || p.includes('disponível')) {
    if (!summary) return 'Seu teto de gastos padrão é de R$ 3.000,00.';
    let reply = `🎯 **Situação do Orçamento**\n\n`;
    reply += `• **Teto Definido:** ${formatCurrency(summary.limite)}\n`;
    reply += `• **Utilizado:** ${formatCurrency(summary.totalGasto)} (${summary.percentualUsado.toFixed(1)}%)\n`;
    reply += `• **Saldo Restante:** ${formatCurrency(summary.saldoRestante)}\n\n`;

    const diasNoMes = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
    const diaAtual = new Date().getDate();
    const diasRestantes = Math.max(1, diasNoMes - diaAtual);
    const mediaDiaria = summary.saldoRestante > 0 ? summary.saldoRestante / diasRestantes : 0;

    if (summary.saldoRestante > 0) {
      reply += `💡 Você pode gastar em média **${formatCurrency(mediaDiaria)} por dia** nos próximos ${diasRestantes} dias para terminar o mês no azul!`;
    } else {
      reply += `⚠️ Seu orçamento mensal esgotou. Evite novos gastos não essenciais até o próximo mês.`;
    }
    return reply;
  }

  // 4. Valor Reservado / Reserva / Emergência
  if (p.includes('reserva') || p.includes('reservado') || p.includes('guardado') || p.includes('emergencia') || p.includes('emergência')) {
    const valRes = budget?.valorReservado || 0;
    const acumuladoReserva = summary?.totalGastoReservadoAcumulado || 0;

    let reply = `💰 **Valor Reservado & Investimentos**\n\n`;
    reply += `• **Total na Reserva:** ${formatCurrency(valRes)}\n`;
    reply += `• **Gastos da Reserva (Histórico):** ${formatCurrency(acumuladoReserva)}\n\n`;
    reply += `💡 O dinheiro da reserva é protegido e não afeta seu teto de gastos mensal!`;
    return reply;
  }

  // 5. Categorias
  if (p.includes('categoria') || p.includes('alimentação') || p.includes('alimentacao') || p.includes('transporte') || p.includes('saúde') || p.includes('lazer')) {
    if (!summary || Object.keys(summary.byCategory).length === 0) {
      return 'Nenhum gasto por categoria registrado ainda neste mês.';
    }

    let reply = `📊 **Gastos por Categoria (Mês Atual)**\n\n`;
    const sorted = Object.entries(summary.byCategory).sort((a, b) => b[1] - a[1]);
    sorted.forEach(([cat, val]) => {
      const pct = ((val / summary.totalGasto) * 100).toFixed(1);
      reply += `• **${cat}:** ${formatCurrency(val)} (${pct}%)\n`;
    });

    const maiorCat = sorted[0];
    if (maiorCat) {
      reply += `\n🏆 A categoria de **${maiorCat[0]}** é seu maior gasto atual (${formatCurrency(maiorCat[1])}).`;
    }
    return reply;
  }

  // 6. Conciliação Bancária / Pluggy
  if (p.includes('banco') || p.includes('pluggy') || p.includes('pendente') || p.includes('conciliaç') || p.includes('extrato')) {
    const count = pendingTransactions.length;
    if (count === 0) {
      return '🎉 Todas as suas movimentações bancárias do Open Finance estão 100% conciladas!';
    }
    let reply = `🏦 **Conciliação Open Finance (Pluggy)**\n\n`;
    reply += `Você possui **${count} movimentaç${count === 1 ? 'ão' : 'ões'} pendente${count === 1 ? '' : 's'}** importada${count === 1 ? '' : 's'} dos seus bancos.\n\n`;
    reply += `Acesse o painel na tela **Início** para aprovar com 1 clique e definir se é Pessoal ou do Negócio!`;
    return reply;
  }

  // 7. Economizar / Dicas
  if (p.includes('economiz') || p.includes('dica') || p.includes('conselho') || p.includes('poupar') || p.includes('ajuda')) {
    if (!summary) return 'Cadastre suas primeiras despesas para eu analisar oportunidades de economia!';

    const sortedCats = Object.entries(summary.byCategory).sort((a, b) => b[1] - a[1]);
    const maiorCat = sortedCats[0];

    let reply = `💡 **Recomendações Inteligentes para Economizar**\n\n`;
    if (maiorCat) {
      reply += `1. **Atenção em ${maiorCat[0]}:** Esta categoria responde por **${formatCurrency(maiorCat[1])}** dos seus custos. Tentar reduzir 15% aqui trará uma economia de **${formatCurrency(maiorCat[1] * 0.15)}**!\n`;
    }
    if (summary.totalNegocio > 0) {
      reply += `2. **Separação de Caixas:** Mantenha os custos da **NR Brownies (PJ)** rigorosamente mapeados para não impactar o orçamento da sua casa.\n`;
    }
    reply += `3. **Consolidar Assinaturas e Recorrências:** Revise na aba *Histórico* se há cobranças recorrentes que podem ser renegociadas.\n`;
    return reply;
  }

  // Resposta genérica inteligente baseada nos dados do usuário
  let defaultReply = `Entendi a sua dúvida! 🤖\n\n`;
  if (summary) {
    defaultReply += `Analisando seu mês atual:\n`;
    defaultReply += `• **Total Gasto:** ${formatCurrency(summary.totalGasto)} de ${formatCurrency(summary.limite)}\n`;
    defaultReply += `• **Saldo Disponível:** ${formatCurrency(summary.saldoRestante)}\n\n`;
  }
  defaultReply += `Você pode me perguntar coisas como:\n`;
  defaultReply += `• *"Nossa conversa fica salva?"*\n`;
  defaultReply += `• *"Quanto me resta do orçamento?"*\n`;
  defaultReply += `• *"Resumo Pessoal vs Negócio (PF/PJ)"*\n`;
  defaultReply += `• *"Quanto gastei com Alimentação?"*\n`;
  defaultReply += `• *"Como posso economizar este mês?"*`;

  return defaultReply;
}

// --- PERSISTÊNCIA FIRESTORE DAS MENSAGENS DO CHAT ---

export async function saveChatMessageFirestore(userId: string, message: ChatMessage): Promise<void> {
  const ref = doc(db, 'users', userId, 'chat_messages', message.id);
  await setDoc(ref, {
    sender: message.sender,
    text: message.text,
    timestamp: Timestamp.fromDate(message.timestamp),
  });
}

export async function getChatMessagesFirestore(userId: string): Promise<ChatMessage[]> {
  const ref = collection(db, 'users', userId, 'chat_messages');
  const snap = await getDocs(ref);

  const list = snap.docs.map((docSnap) => {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      sender: data.sender,
      text: data.text,
      timestamp: data.timestamp?.toDate ? data.timestamp.toDate() : new Date(),
    };
  });

  return list.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
}

export async function clearChatMessagesFirestore(userId: string): Promise<void> {
  const ref = collection(db, 'users', userId, 'chat_messages');
  const snap = await getDocs(ref);
  const deletePromises = snap.docs.map((d) => deleteDoc(d.ref));
  await Promise.all(deletePromises);
}
