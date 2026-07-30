import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { Expense, MonthSummary, Budget, PendingTransaction, ChatMessage, ExpenseCategory, Goal } from '../types';
import { formatCurrency } from './insightService';
import { getCustomGeminiKey } from './aiConfigService';

export interface FinancialContext {
  expenses: Expense[];
  summary: MonthSummary | null;
  budget: Budget | null;
  pendingTransactions: PendingTransaction[];
  nextMonthRecurring?: Expense[];
  goals?: Goal[];
}

// ─────────────────────────────────────────────────────────────────
// MOTOR DE ANÁLISE SEMÂNTICA DE FRASES COMPLETAS (FULL SENTENCE ENGINE)
// ─────────────────────────────────────────────────────────────────

type TimeFrame = 'FUTURE' | 'PRESENT' | 'PAST';
type EntityType = 'COMPANY' | 'PERSONAL' | 'RESERVE' | 'GOALS' | 'BANK' | 'CATEGORY' | 'GENERAL';
type ActionType = 'PREDICTION' | 'TOTAL' | 'ITEMS' | 'STATUS' | 'ADVICE' | 'GREETING' | 'WHOAMI' | 'SAVE';

interface SentenceAnalysis {
  time: TimeFrame;
  entity: EntityType;
  action: ActionType;
  categoryName?: ExpenseCategory;
  raw: string;
}

/** Remove acentos, pontuação e converte para minúscula */
function cleanText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Analisa a frase COMPLETA identificando Tempo, Entidade e Ação sem depender de palavras exatas */
function analyzeSentence(rawText: string): SentenceAnalysis {
  const norm = cleanText(rawText);

  // 1. ANÁLISE DE TEMPO (TimeFrame)
  let time: TimeFrame = 'PRESENT';
  const futureRegex = /(proxim|que vem|futur|amanha|vencer|vencimento|para pagar|pra pagar|a pagar|fatura|mes que vem|proximos)/i;
  const pastRegex = /(passado|anterior|ontem|atras|historico|mes passado)/i;

  if (futureRegex.test(norm)) {
    time = 'FUTURE';
  } else if (pastRegex.test(norm)) {
    time = 'PAST';
  }

  // 2. ANÁLISE DE ENTIDADE (Subject/Entity)
  let entity: EntityType = 'GENERAL';
  if (/(empresa|negocio|pj|brownie|brownies|nr brownies|loja|cnpj)/i.test(norm)) {
    entity = 'COMPANY';
  } else if (/(pessoal|pf|particular|minhas coisas|casa)/i.test(norm)) {
    entity = 'PERSONAL';
  } else if (/(reserva|guardado|emergencia|poupanca|poupança)/i.test(norm)) {
    entity = 'RESERVE';
  } else if (/(meta|metas|objetivo|objetivos|sonho)/i.test(norm)) {
    entity = 'GOALS';
  } else if (/(banco|pluggy|extrato|conciliar|open finance|pendente|transacao)/i.test(norm)) {
    entity = 'BANK';
  }

  // Identifica categoria específica se houver
  const catMap: Record<string, ExpenseCategory> = {
    'alimentacao': 'Alimentação', 'comida': 'Alimentação', 'mercado': 'Alimentação',
    'restaurante': 'Alimentação', 'supermercado': 'Alimentação', 'ifood': 'Alimentação',
    'transporte': 'Transporte', 'uber': 'Transporte', 'gasolina': 'Transporte', 'combustivel': 'Transporte',
    'saude': 'Saúde', 'medico': 'Saúde', 'farmacia': 'Saúde', 'remedio': 'Saúde',
    'moradia': 'Moradia', 'aluguel': 'Moradia', 'agua': 'Moradia', 'luz': 'Moradia', 'energia': 'Moradia',
    'lazer': 'Lazer', 'cinema': 'Lazer', 'viagem': 'Lazer', 'streaming': 'Lazer',
    'fornecedor': 'Fornecedores', 'insumo': 'Fornecedores', 'embalagem': 'Fornecedores',
    'outros': 'Outros',
  };
  let categoryName: ExpenseCategory | undefined = undefined;
  for (const [kw, cat] of Object.entries(catMap)) {
    if (norm.includes(kw)) {
      categoryName = cat;
      entity = 'CATEGORY';
      break;
    }
  }

  // 3. ANÁLISE DE AÇÃO (ActionType)
  let action: ActionType = 'TOTAL';

  if (/^(oi|ola|boa|oba|hello|hi|e ai|e aí)$/i.test(norm)) {
    action = 'GREETING';
  } else if (/(quem e voce|o que voce faz|como funciona|quem voce e)/i.test(norm)) {
    action = 'WHOAMI';
  } else if (/(salvo|salva|historico|grava|apagar|limpar)/i.test(norm)) {
    action = 'SAVE';
  } else if (/(economizar|dica|ajuda|conselho|poupar|reduzir|cortar)/i.test(norm)) {
    action = 'ADVICE';
  } else if (/(quais|quais sao|lista|quais foram|quais sao elas|detalhe|detalhes|mostrar|cada)/i.test(norm)) {
    action = 'ITEMS';
  } else if (/(resta|sobrou|disponivel|livre|limite|orcamento|saldo)/i.test(norm)) {
    action = 'STATUS';
  } else if (time === 'FUTURE' || /(previsao|prever|quanto vou|vai custar|ter que pagar|tenho que pagar|para pagar|pra pagar)/i.test(norm)) {
    action = 'PREDICTION';
  }

  return { time, entity, action, categoryName, raw: rawText };
}

// ─────────────────────────────────────────────────────────────────
// GERADOR DINÂMICO DE RESPOSTA SEMÂNTICA
// ─────────────────────────────────────────────────────────────────

function generateSemanticResponse(analysis: SentenceAnalysis, ctx: FinancialContext): string {
  const { time, entity, action, categoryName } = analysis;
  const { expenses, summary, budget, pendingTransactions, nextMonthRecurring, goals } = ctx;

  // 1. CUMPRIMENTOS / SOAT
  if (action === 'GREETING') {
    const hora = new Date().getHours();
    const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
    let r = `${saudacao}! 👋 Sou o **NR Finance AI**.\n\n`;
    if (summary) {
      r += `Até agora você utilizou **${formatCurrency(summary.totalGasto)}** de **${formatCurrency(summary.limite)}** no orçamento deste mês. Saldo livre: **${formatCurrency(summary.saldoRestante)}**.\n\n`;
    }
    r += `Como posso ajudar você agora? Pode perguntar qualquer coisa em linguagem natural! 💬`;
    return r;
  }

  if (action === 'WHOAMI') {
    return `🤖 Sou o **NR Finance AI**, seu assistente virtual de inteligência financeira!\n\nConecto-me em tempo real aos seus dados do app (despesas, teto orçamentário, fundo de reserva, metas, Open Finance do banco) para responder a qualquer pergunta com raciocínio contextual.`;
  }

  if (action === 'SAVE') {
    return `Sim! 💾 **Nossa conversa fica salva automaticamente** no seu perfil Firestore. Você pode fechar o app e navegar entre as telas — quando voltar, suas mensagens estarão salvas aqui!`;
  }

  // 2. PREVISÃO / FUTURO (PRÓXIMO MÊS)
  if (time === 'FUTURE' || action === 'PREDICTION') {
    let recurringList = (nextMonthRecurring && nextMonthRecurring.length > 0)
      ? nextMonthRecurring
      : expenses.filter((e) => e.tipo === 'recorrente');

    let installmentList = expenses.filter(
      (e) => (e.parcelasRestantes ?? 0) > 1 || (e.totalParcelas ?? 0) > 1
    );

    // Filtra por entidade se for especificado (ex: NR Brownies PJ ou Pessoal PF)
    if (entity === 'COMPANY') {
      recurringList = recurringList.filter((e) => e.origem === 'negocio');
      installmentList = installmentList.filter((e) => e.origem === 'negocio');
    } else if (entity === 'PERSONAL') {
      recurringList = recurringList.filter((e) => e.origem === 'pessoal');
      installmentList = installmentList.filter((e) => e.origem === 'pessoal');
    }

    const totalRec = recurringList.reduce((s, e) => s + e.valor, 0);
    const totalInst = installmentList.reduce((s, e) => s + e.valor, 0);
    const totalPrevisto = totalRec + totalInst;

    const labelEntidade = entity === 'COMPANY' ? 'da NR Brownies (PJ)' : entity === 'PERSONAL' ? 'Pessoais (PF)' : 'Gerais';

    if (recurringList.length === 0 && installmentList.length === 0) {
      return `📅 **Previsão de Contas ${labelEntidade} para o Próximo Mês**\n\nNo momento, não há despesas recorrentes ou parceladas registradas para o próximo mês nessa categoria.\n\n💡 Ao cadastrar gastos no botão **+** selecionando **Recorrente** ou **Parcelado**, a previsão futura é atualizada automaticamente!`;
    }

    let r = `📅 **Previsão de Contas ${labelEntidade} para o Próximo Mês**\n\n`;

    if (recurringList.length > 0) {
      r += `🔄 **Despesas Recorrentes (Fixas):**\n`;
      recurringList.forEach((e) => {
        r += `• **${e.nome}** (${e.origem === 'negocio' ? 'PJ' : 'PF'} · *${e.categoria}*): **${formatCurrency(e.valor)}**\n`;
      });
      r += `\n`;
    }

    if (installmentList.length > 0) {
      r += `💳 **Parcelas a Vencer:**\n`;
      installmentList.forEach((e) => {
        const pAtual = e.parcelaNumero ? e.parcelaNumero + 1 : 2;
        const pTot = e.totalParcelas || '?';
        r += `• **${e.nome}** (${e.origem === 'negocio' ? 'PJ' : 'PF'}): **${formatCurrency(e.valor)}** *(Parcela ${pAtual}/${pTot})*\n`;
      });
      r += `\n`;
    }

    r += `💰 **Total Previsto a Pagar Mês que Vem:** **${formatCurrency(totalPrevisto)}**`;
    return r;
  }

  // 3. METAS FINANCEIRAS
  if (entity === 'GOALS') {
    if (!goals || goals.length === 0) {
      return `🎯 Você ainda não cadastrou nenhuma meta financeira. Acesse o botão **Metas** na tela inicial para definir seus objetivos (ex: Viagem, Equipamento, Reserva)!`;
    }
    const active = goals.filter((g) => !g.concluida);
    let r = `🎯 **Progresso das Suas Metas Financeiras (${active.length} ativas)**\n\n`;
    active.forEach((g) => {
      const pct = g.valorMeta > 0 ? (g.valorAtual / g.valorMeta) * 100 : 0;
      const falta = Math.max(0, g.valorMeta - g.valorAtual);
      r += `${g.emoji} **${g.nome}:** **${formatCurrency(g.valorAtual)}** de ${formatCurrency(g.valorMeta)} (${pct.toFixed(0)}%)\n  *Falta guardar:* ${formatCurrency(falta)}\n\n`;
    });
    return r;
  }

  // 4. FUNDO DE RESERVA
  if (entity === 'RESERVE') {
    const valRes = budget?.valorReservado ?? 0;
    const ac = summary?.totalGastoReservadoAcumulado ?? 0;
    return `💰 **Fundo de Reserva / Emergência**\n\n• **Total Guardado:** ${formatCurrency(valRes)}\n• **Já utilizado:** ${formatCurrency(ac)}\n• **Saldo estimado:** ${formatCurrency(Math.max(0, valRes - ac))}`;
  }

  // 5. OPEN FINANCE / BANCO
  if (entity === 'BANK') {
    if (pendingTransactions.length === 0) {
      return `🎉 **Open Finance:** Todas as suas movimentações bancárias (Pluggy) estão conciliadas! Nenhuma transação pendente.`;
    }
    let r = `🏦 **Open Finance (Pluggy) — ${pendingTransactions.length} lançamentos pendentes**\n\n`;
    pendingTransactions.slice(0, 3).forEach((tx) => {
      r += `• **${tx.description}** — ${formatCurrency(tx.amount)} (${tx.bankName})\n`;
    });
    return r;
  }

  // 6. EMPRESA NR BROWNIES (PJ)
  if (entity === 'COMPANY') {
    const companyExp = expenses.filter((e) => e.origem === 'negocio');
    const total = companyExp.reduce((s, e) => s + e.valor, 0);

    if (companyExp.length === 0) {
      return `🏢 Nenhuma despesa da empresa **NR Brownies (PJ)** registrada neste mês.`;
    }

    let r = `🏢 **Gastos da NR Brownies (PJ) este mês:** **${formatCurrency(total)}**\n\n`;
    if (action === 'ITEMS' || companyExp.length <= 8) {
      r += `📋 **Lançamentos:**\n`;
      companyExp.forEach((e) => {
        const dt = new Date(e.data).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        r += `• **${e.nome}** — ${formatCurrency(e.valor)} (*${e.categoria}*, ${dt})\n`;
      });
    } else {
      companyExp.slice(0, 5).forEach((e) => {
        r += `• **${e.nome}** — ${formatCurrency(e.valor)}\n`;
      });
    }
    return r;
  }

  // 7. PESSOAL (PF)
  if (entity === 'PERSONAL') {
    const personalExp = expenses.filter((e) => e.origem === 'pessoal');
    const total = personalExp.reduce((s, e) => s + e.valor, 0);

    if (personalExp.length === 0) {
      return `👤 Nenhuma despesa pessoal (PF) registrada neste mês.`;
    }

    let r = `👤 **Gastos Pessoais (PF) este mês:** **${formatCurrency(total)}**\n\n`;
    if (action === 'ITEMS' || personalExp.length <= 8) {
      r += `📋 **Lançamentos:**\n`;
      personalExp.forEach((e) => {
        const dt = new Date(e.data).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        r += `• **${e.nome}** — ${formatCurrency(e.valor)} (*${e.categoria}*, ${dt})\n`;
      });
    }
    return r;
  }

  // 8. CATEGORIA ESPECÍFICA
  if (entity === 'CATEGORY' && categoryName) {
    const catExp = expenses.filter((e) => e.categoria === categoryName);
    const total = catExp.reduce((s, e) => s + e.valor, 0);
    if (catExp.length === 0) return `📊 Nenhum gasto em **${categoryName}** este mês.`;

    let r = `📊 **Gastos com ${categoryName}:** **${formatCurrency(total)}**\n\n📋 **Lançamentos:**\n`;
    catExp.forEach((e) => {
      r += `• **${e.nome}** (${e.origem === 'negocio' ? 'PJ' : 'PF'}) — ${formatCurrency(e.valor)}\n`;
    });
    return r;
  }

  // 9. STATUS DO ORÇAMENTO
  if (action === 'STATUS') {
    if (!summary) return `Seu orçamento padrão é de R$ 3.000,00. Configure na aba Orçamento!`;
    return `🎯 **Situação do Orçamento**\n\n• **Teto Mensal:** ${formatCurrency(summary.limite)}\n• **Utilizado:** ${formatCurrency(summary.totalGasto)} (${summary.percentualUsado.toFixed(0)}%)\n• **Saldo Disponível:** ${formatCurrency(summary.saldoRestante)}`;
  }

  // 10. CONSELHOS / DICAS
  if (action === 'ADVICE') {
    if (!summary || summary.totalGasto === 0) return `Cadastre suas despesas para receber conselhos personalizados!`;
    const sorted = Object.entries(summary.byCategory).sort((a, b) => b[1] - a[1]);
    const maior = sorted[0];
    let r = `💡 **Dicas para Economizar**\n\n`;
    if (maior) r += `1. **Sua maior categoria é ${maior[0]}:** ${formatCurrency(maior[1])}. Reduzir 15% aqui poupa **${formatCurrency(maior[1] * 0.15)}** por mês!\n`;
    r += `2. **Separe sempre PF e PJ:** Garanta que custos de produção da NR Brownies não fiquem na conta pessoal.\n`;
    return r;
  }

  // 11. PADRÃO / RESUMO DO MÊS ATUAL
  if (!summary || summary.totalGasto === 0) {
    return `📊 Nenhuma despesa registrada ainda neste mês. Toque no botão **+** para adicionar seu primeiro gasto!`;
  }

  let r = `📊 **Resumo do Mês Atual**\n\n`;
  r += `• **Total Gasto:** ${formatCurrency(summary.totalGasto)}\n`;
  r += `• **Teto do Orçamento:** ${formatCurrency(summary.limite)}\n`;
  r += `• **Saldo Livre:** ${formatCurrency(summary.saldoRestante)}\n\n`;
  r += `⚖️ **Divisão:**\n`;
  r += `• 👤 Pessoal (PF): **${formatCurrency(summary.totalPessoal)}**\n`;
  r += `• 🏢 NR Brownies (PJ): **${formatCurrency(summary.totalNegocio)}**`;
  return r;
}

// ─────────────────────────────────────────────────────────────────
// INTERFACE PÚBLICA & INTEGRAÇÃO COM REAL LLM (GEMINI)
// ─────────────────────────────────────────────────────────────────

function buildSystemContextPrompt(ctx: FinancialContext): string {
  const { summary, budget, expenses, pendingTransactions, nextMonthRecurring, goals } = ctx;
  const mes = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  let text = `Você é o **NR Finance AI**, assistente de inteligência financeira do app **NRFinance** (para finanças pessoais PF e do negócio NR Brownies PJ).\n`;
  text += `Responda de forma extremamente natural, inteligente, empática e direta, exatamente como o ChatGPT ou Gemini.\n`;
  text += `Use negrito para valores em R$. Use tópicos e emojis quando apropriado.\n`;
  text += `DIFERENCIE CUIDADOSAMENTE O TEMPO:\n`;
  text += `- "Este mês" / "agora" / "já gastei" = Mês atual (${mes})\n`;
  text += `- "Próximo mês" / "mês que vem" / "faturas a pagar" / "previsão" = Previsão de contas futuras (recorrentes e parcelas)\n\n`;
  text += `DADOS FINANCEIROS EM TEMPO REAL:\n`;

  if (budget) {
    text += `- Teto Orçamentário Mensal: ${formatCurrency(budget.limite)}\n`;
    text += `- Renda Mensal Informada: ${formatCurrency(budget.rendaMensal)}\n`;
    text += `- Fundo de Reserva Guardado: ${formatCurrency(budget.valorReservado || 0)}\n`;
  }

  if (summary) {
    text += `- Total Gasto no Mês Atual: ${formatCurrency(summary.totalGasto)}\n`;
    text += `- Saldo Restante Livre: ${formatCurrency(summary.saldoRestante)} (${(100 - summary.percentualUsado).toFixed(1)}% livre)\n`;
    text += `- Total Pessoal (PF): ${formatCurrency(summary.totalPessoal)}\n`;
    text += `- Total NR Brownies (PJ): ${formatCurrency(summary.totalNegocio)}\n`;
    text += `- Gastos por Categoria:\n`;
    Object.entries(summary.byCategory).forEach(([cat, val]) => {
      text += `  * ${cat}: ${formatCurrency(val)}\n`;
    });
  }

  if (nextMonthRecurring && nextMonthRecurring.length > 0) {
    text += `- Previsão de Contas Recorrentes para o Próximo Mês (${nextMonthRecurring.length} despesas fixas):\n`;
    nextMonthRecurring.forEach((e) => {
      text += `  * [${e.origem.toUpperCase()}] ${e.nome} (${e.categoria}): ${formatCurrency(e.valor)}\n`;
    });
  }

  if (goals && goals.length > 0) {
    text += `- Metas Financeiras Cadastradas:\n`;
    goals.forEach((g) => {
      text += `  * ${g.emoji} ${g.nome}: ${formatCurrency(g.valorAtual)} de ${formatCurrency(g.valorMeta)} (${g.concluida ? 'Concluída' : 'Ativa'})\n`;
    });
  }

  if (pendingTransactions.length > 0) {
    text += `- Movimentações Bancárias Importadas do Banco (Open Finance): ${pendingTransactions.length} pendentes.\n`;
  }

  if (expenses.length > 0) {
    text += `- Lista das Despesas do Mês Atual (${expenses.length} lançamentos):\n`;
    expenses.forEach((e) => {
      const dataFormatada = new Date(e.data).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      const parc = e.totalParcelas ? ` (Parcela ${e.parcelaNumero || 1}/${e.totalParcelas})` : '';
      text += `  * [${e.origem.toUpperCase()}] ${e.nome}${parc} (${e.categoria}): ${formatCurrency(e.valor)} em ${dataFormatada}\n`;
    });
  }

  return text;
}

export async function askFinancialAI(
  prompt: string,
  context: FinancialContext,
  history: ChatMessage[] = []
): Promise<string> {
  // 1. Tenta obter a Chave do Gemini (Chave enviada na página de Configurações pelo usuário OU variável de ambiente)
  const apiKey = getCustomGeminiKey() || process.env.EXPO_PUBLIC_GEMINI_API_KEY || '';

  if (apiKey) {
    const models = [
      'gemini-flash-latest',
      'gemini-2.5-flash-lite',
      'gemini-3.5-flash',
      'gemini-3.6-flash',
      'gemini-2.0-flash',
      'gemini-1.5-flash',
    ];

    for (const model of models) {
      try {
        const systemContextPrompt = buildSystemContextPrompt(context);
        const contentsHistory = history.slice(-6).map((msg) => ({
          role: msg.sender === 'user' ? 'user' : 'model',
          parts: [{ text: msg.text }],
        }));

        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [
                { role: 'user', parts: [{ text: systemContextPrompt }] },
                ...contentsHistory,
                { role: 'user', parts: [{ text: prompt }] },
              ],
            }),
          }
        );

        if (res.ok) {
          const data = await res.json();
          const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (candidateText) return candidateText.trim();
        }
      } catch (err) {
        console.warn(`Tentativa Gemini (${model}) falhou:`, err);
      }
    }
  }

  // 2. Motor de Análise Semântica de Frases Completas (Executado se a chave não estiver ativa)
  const analysis = analyzeSentence(prompt);
  return generateSemanticResponse(analysis, context);
}

// ─────────────────────────────────────────────────────────────────
// PERSISTÊNCIA FIRESTORE
// ─────────────────────────────────────────────────────────────────

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
  const list = snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
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
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
}
