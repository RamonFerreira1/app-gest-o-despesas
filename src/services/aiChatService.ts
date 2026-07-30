import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { Expense, MonthSummary, Budget, PendingTransaction, ChatMessage, ExpenseCategory } from '../types';
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
 * ou o Motor de Inteligência Financeira Local de Linguagem Natural.
 */
export async function askFinancialAI(
  prompt: string,
  context: FinancialContext,
  history: ChatMessage[] = []
): Promise<string> {
  if (GEMINI_API_KEY) {
    try {
      const systemContextPrompt = buildSystemContextPrompt(context);
      
      // Monta as mensagens anteriores para manter o contexto da conversa
      const contentsHistory = history.slice(-6).map((msg) => ({
        role: msg.sender === 'user' ? 'user' : 'model',
        parts: [{ text: msg.text }],
      }));

      const res = await fetch(GEMINI_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: systemContextPrompt }],
            },
            ...contentsHistory,
            {
              role: 'user',
              parts: [
                {
                  text: `Pergunta do Usuário: "${prompt}"\n\nResponda em português brasileiro de forma natural, amigável e direta, usando negrito para valores em R$ ou destaques importantes.`,
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

  return processSmartNaturalLanguageQuery(prompt, context, history);
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
    text += `- Lista Completa de Despesas Registradas neste mês (${expenses.length} lançamentos):\n`;
    expenses.forEach((e) => {
      const dataFormatada = new Date(e.data).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      text += `  * [${e.origem.toUpperCase()}] ${e.nome} (${e.categoria}): ${formatCurrency(e.valor)} em ${dataFormatada}\n`;
    });
  }

  return text;
}

/**
 * Motor de Processamento de Linguagem Natural (NLP) Inteligente com suporte a contexto e histórico.
 */
function processSmartNaturalLanguageQuery(
  rawPrompt: string,
  ctx: FinancialContext,
  history: ChatMessage[] = []
): string {
  const { summary, budget, expenses, pendingTransactions } = ctx;
  const rawText = rawPrompt.trim();

  // Limpeza de saudações iniciais ("boa tarde!", "oi", "olá") para extrair a pergunta real
  let cleaned = rawText
    .toLowerCase()
    .replace(/^(boa tarde|bom dia|boa noite|olá|ola|oi|por favor|opa)[\!\,\.\s]+/gi, '')
    .trim();

  if (!cleaned) {
    cleaned = rawText.toLowerCase();
  }

  // Verificação de intenções
  const isGreetingOnly =
    /^(boa tarde|bom dia|boa noite|olá|ola|oi|opa)[\!\.]?$/i.test(rawText);
  const isSaveQuery =
    cleaned.includes('salva') ||
    cleaned.includes('salvo') ||
    cleaned.includes('histórico') ||
    cleaned.includes('historico') ||
    cleaned.includes('grava');
  const isWhoAmI =
    cleaned.includes('quem é você') ||
    cleaned.includes('quem e voce') ||
    cleaned.includes('como funciona') ||
    cleaned.includes('o que você faz') ||
    cleaned.includes('o que voce faz');

  const isCompany =
    cleaned.includes('empresa') ||
    cleaned.includes('negocio') ||
    cleaned.includes('negócio') ||
    cleaned.includes('pj') ||
    cleaned.includes('brownie') ||
    cleaned.includes('brownies');

  const isPersonal =
    cleaned.includes('pessoal') ||
    cleaned.includes('pf') ||
    cleaned.includes('casa') ||
    cleaned.includes('minhas coisas');

  const isItemized =
    cleaned.includes('sem ser total') ||
    cleaned.includes('quais') ||
    cleaned.includes('detalhe') ||
    cleaned.includes('detalhes') ||
    cleaned.includes('lista') ||
    cleaned.includes('compras') ||
    cleaned.includes('extrato') ||
    cleaned.includes('quais foram') ||
    cleaned.includes('quais são') ||
    cleaned.includes('quais sao') ||
    cleaned.includes('quais sao elas');

  // --- CUMPRIMENTO APENAS ---
  if (isGreetingOnly) {
    let reply = `Boa tarde! 👋 Como posso ajudar no gerenciamento das suas finanças pessoais ou da **NR Brownies** hoje?\n\n`;
    if (summary) {
      reply += `Até agora você utilizou **${formatCurrency(summary.totalGasto)}** do seu teto de **${formatCurrency(summary.limite)}**. Restam **${formatCurrency(summary.saldoRestante)}** livres!`;
    }
    return reply;
  }

  // --- HISTÓRICO SALVO ---
  if (isSaveQuery) {
    return `Sim! 💾 **Nossa conversa fica salva automaticamente** na sua conta com total segurança.\n\nVocê pode fechar o aplicativo ou navegar entre as telas e, quando voltar, suas mensagens anteriores continuarão aqui salvas no Firestore! Se quiser reiniciar, basta tocar no ícone da lixeira 🗑️ no topo.`;
  }

  // --- QUEM SOU EU ---
  if (isWhoAmI) {
    return `🤖 Sou o **NR Finance AI**, seu assistente inteligente de finanças!\n\nAnaliso em tempo real seus gastos do mês, teto de orçamento, valor reservado, despesas da NR Brownies (PJ) vs Pessoais (PF) e extrato do Open Finance. Pode me fazer qualquer pergunta sobre seus números!`;
  }

  // --- DETALHAMENTO/LISTA DAS DESPESAS DA EMPRESA (PJ) ---
  if (isCompany) {
    const companyExpenses = expenses.filter((e) => e.origem === 'negocio');
    const totalCompany = companyExpenses.reduce((sum, e) => sum + e.valor, 0);

    if (isItemized || cleaned.includes('sem ser total')) {
      if (companyExpenses.length === 0) {
        return `🏢 Nenhuma despesa individual da empresa **NR Brownies (PJ)** foi registrada neste mês.`;
      }

      let reply = `🏢 **Lançamentos da Empresa (NR Brownies - PJ)**:\n\n`;
      reply += `• **Total Acumulado:** ${formatCurrency(totalCompany)} (${companyExpenses.length} lançamento${companyExpenses.length === 1 ? '' : 's'})\n\n`;
      reply += `📋 **Lista de Despesas:**\n`;
      companyExpenses.forEach((e) => {
        const dt = new Date(e.data).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        reply += `• **${e.nome}**: ${formatCurrency(e.valor)} (*${e.categoria}* em ${dt})\n`;
      });

      return reply;
    }

    // Resumo da empresa + convite a detalhar
    let reply = `🏢 **Gastos da Empresa (NR Brownies - PJ) neste mês**:\n\n`;
    reply += `• **Total Gasto:** ${formatCurrency(totalCompany)}\n`;
    if (summary && summary.totalGasto > 0) {
      const pct = ((totalCompany / summary.totalGasto) * 100).toFixed(1);
      reply += `• **Representa:** ${pct}% do total de despesas do mês.\n`;
    }

    if (companyExpenses.length > 0) {
      reply += `\n📋 **Últimos lançamentos da empresa:**\n`;
      companyExpenses.slice(0, 3).forEach((e) => {
        const dt = new Date(e.data).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        reply += `• ${e.nome}: **${formatCurrency(e.valor)}** (${dt})\n`;
      });
      if (companyExpenses.length > 3) {
        reply += `\n*(Dica: digite "quais são as despesas da empresa" para ver a lista completa!)*`;
      }
    } else {
      reply += `\nNenhuma despesa registrada para o CNPJ/Negócio até o momento.`;
    }

    return reply;
  }

  // --- DETALHAMENTO/LISTA DAS DESPESAS PESSOAIS (PF) ---
  if (isPersonal) {
    const personalExpenses = expenses.filter((e) => e.origem === 'pessoal');
    const totalPersonal = personalExpenses.reduce((sum, e) => sum + e.valor, 0);

    if (isItemized || cleaned.includes('sem ser total')) {
      if (personalExpenses.length === 0) {
        return `👤 Nenhuma despesa pessoal (PF) foi registrada neste mês.`;
      }

      let reply = `👤 **Lançamentos Pessoais (PF)**:\n\n`;
      reply += `• **Total Acumulado:** ${formatCurrency(totalPersonal)} (${personalExpenses.length} lançamento${personalExpenses.length === 1 ? '' : 's'})\n\n`;
      reply += `📋 **Lista de Despesas:**\n`;
      personalExpenses.forEach((e) => {
        const dt = new Date(e.data).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        reply += `• **${e.nome}**: ${formatCurrency(e.valor)} (*${e.categoria}* em ${dt})\n`;
      });

      return reply;
    }

    let reply = `👤 **Gastos Pessoais (PF) neste mês**:\n\n`;
    reply += `• **Total Gasto:** ${formatCurrency(totalPersonal)}\n`;
    if (summary && summary.totalGasto > 0) {
      const pct = ((totalPersonal / summary.totalGasto) * 100).toFixed(1);
      reply += `• **Representa:** ${pct}% do seu total gasto.\n`;
    }

    if (personalExpenses.length > 0) {
      reply += `\n📋 **Últimos lançamentos pessoais:**\n`;
      personalExpenses.slice(0, 3).forEach((e) => {
        const dt = new Date(e.data).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        reply += `• ${e.nome}: **${formatCurrency(e.valor)}** (${dt})\n`;
      });
    }

    return reply;
  }

  // --- CONSULTA POR CATEGORIA ESPECÍFICA ---
  const categoriesList: ExpenseCategory[] = [
    'Alimentação',
    'Transporte',
    'Fornecedores',
    'Moradia',
    'Saúde',
    'Lazer',
    'Outros',
  ];

  for (const cat of categoriesList) {
    const catLower = cat.toLowerCase();
    if (
      cleaned.includes(catLower) ||
      (cat === 'Alimentação' && (cleaned.includes('alimen') || cleaned.includes('comida') || cleaned.includes('mercado'))) ||
      (cat === 'Transporte' && (cleaned.includes('uber') || cleaned.includes('gasolina') || cleaned.includes('combustiv'))) ||
      (cat === 'Moradia' && (cleaned.includes('aluguel') || cleaned.includes('luz') || cleaned.includes('agua')))
    ) {
      const catExpenses = expenses.filter((e) => e.categoria === cat);
      const catTotal = catExpenses.reduce((sum, e) => sum + e.valor, 0);

      let reply = `📊 **Gastos com ${cat}**:\n\n`;
      reply += `• **Total na Categoria:** ${formatCurrency(catTotal)}\n`;

      if (catExpenses.length > 0) {
        reply += `\n📋 **Lançamentos nesta categoria:**\n`;
        catExpenses.forEach((e) => {
          const dt = new Date(e.data).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
          reply += `• **${e.nome}** (${e.origem.toUpperCase()}): ${formatCurrency(e.valor)} (${dt})\n`;
        });
      } else {
        reply += `Nenhuma despesa registrada nesta categoria neste mês.`;
      }
      return reply;
    }
  }

  // --- QUANTO GASTEI / TOTAL GASTO / RESUMO ---
  if (
    cleaned.includes('quanto gastei') ||
    cleaned.includes('total gasto') ||
    cleaned.includes('resumo do mês') ||
    cleaned.includes('resumo dos gastos') ||
    cleaned.includes('gastos')
  ) {
    if (!summary) return 'Você ainda não possui despesas registradas este mês.';

    let reply = `📊 **Resumo de Gastos do Mês**:\n\n`;
    reply += `• **Total Gasto:** ${formatCurrency(summary.totalGasto)}\n`;
    reply += `• **Teto do Orçamento:** ${formatCurrency(summary.limite)}\n`;
    reply += `• **Saldo Disponível:** ${formatCurrency(summary.saldoRestante)}\n\n`;
    reply += `⚖️ **Divisão por Origem:**\n`;
    reply += `• 👤 **Pessoal (PF):** ${formatCurrency(summary.totalPessoal)}\n`;
    reply += `• 🏢 **NR Brownies (PJ):** ${formatCurrency(summary.totalNegocio)}\n`;

    return reply;
  }

  // --- ORÇAMENTO / TETO / QUANTO RESTA ---
  if (
    cleaned.includes('resta') ||
    cleaned.includes('sobra') ||
    cleaned.includes('teto') ||
    cleaned.includes('limite') ||
    cleaned.includes('disponivel') ||
    cleaned.includes('disponível')
  ) {
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
      reply += `💡 Você tem permissão para gastar até **${formatCurrency(mediaDiaria)} por dia** nos próximos ${diasRestantes} dias sem estourar o limite!`;
    } else {
      reply += `⚠️ Seu orçamento mensal esgotou!`;
    }
    return reply;
  }

  // --- VALOR RESERVADO / RESERVA ---
  if (
    cleaned.includes('reserva') ||
    cleaned.includes('reservado') ||
    cleaned.includes('guardado') ||
    cleaned.includes('emergencia')
  ) {
    const valRes = budget?.valorReservado || 0;
    const acumuladoReserva = summary?.totalGastoReservadoAcumulado || 0;

    let reply = `💰 **Valor Reservado & Investimentos**\n\n`;
    reply += `• **Total Guardado na Reserva:** ${formatCurrency(valRes)}\n`;
    reply += `• **Gastos Utilizados da Reserva:** ${formatCurrency(acumuladoReserva)}\n\n`;
    reply += `💡 O dinheiro da reserva não afeta o teto do seu orçamento mensal!`;
    return reply;
  }

  // --- MAIORES DESPESAS ---
  if (cleaned.includes('maior') || cleaned.includes('maiores') || cleaned.includes('onde gastei mais')) {
    if (expenses.length === 0) return 'Nenhuma despesa registrada ainda.';

    const sorted = [...expenses].sort((a, b) => b.valor - a.valor);
    let reply = `🏆 **Suas Maiores Despesas do Mês**:\n\n`;
    sorted.slice(0, 5).forEach((e, idx) => {
      const dt = new Date(e.data).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      reply += `${idx + 1}. **${e.nome}** (${e.origem.toUpperCase()} - *${e.categoria}*): **${formatCurrency(e.valor)}** em ${dt}\n`;
    });

    return reply;
  }

  // RESPOSTA PADRÃO INTELIGENTE COM CONTEXTO COMPLETO
  let reply = `Compreendi sua pergunta! 🤖\n\n`;
  if (summary) {
    reply += `Aqui estão os números atuais das suas finanças:\n`;
    reply += `• **Total Gasto:** ${formatCurrency(summary.totalGasto)} de ${formatCurrency(summary.limite)}\n`;
    reply += `• **Uso Pessoal (PF):** ${formatCurrency(summary.totalPessoal)}\n`;
    reply += `• **NR Brownies (PJ):** ${formatCurrency(summary.totalNegocio)}\n`;
    reply += `• **Saldo Livre:** ${formatCurrency(summary.saldoRestante)}\n\n`;
  }
  reply += `Você pode me pedir:\n`;
  reply += `• *"Quanto gastei na minha empresa esse mês?"*\n`;
  reply += `• *"Quais foram as despesas da empresa sem ser o total?"*\n`;
  reply += `• *"Quanto gastei com Alimentação?"*\n`;
  reply += `• *"Qual foi a minha maior despesa?"*`;

  return reply;
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
