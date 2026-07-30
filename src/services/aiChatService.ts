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

const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY || '';
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

export interface FinancialContext {
  expenses: Expense[];
  summary: MonthSummary | null;
  budget: Budget | null;
  pendingTransactions: PendingTransaction[];
  nextMonthRecurring?: Expense[];
  goals?: Goal[];
}

// ─────────────────────────────────────────────────────────────────
// NORMALIZAÇÃO DE TEXTO
// ─────────────────────────────────────────────────────────────────

/** Remove acentos, converte para minúscula, remove pontuação e saudações iniciais */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/[^\w\s]/g, ' ')        // remove pontuação
    .replace(/\b(bom dia|boa tarde|boa noite|ola|oi|opa|ei|hey|boa|por favor|pfv|pf)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Verifica se o texto contém qualquer um dos tokens fornecidos (palavras inteiras ou trechos) */
function has(text: string, ...tokens: string[]): boolean {
  return tokens.some((t) => {
    if (t.includes(' ')) return text.includes(t);
    return new RegExp(`\\b${t}\\b`).test(text);
  });
}

// ─────────────────────────────────────────────────────────────────
// SISTEMA DE INTENÇÕES COM PONTUAÇÃO (INTENT SCORING ENGINE)
// ─────────────────────────────────────────────────────────────────

type Intent =
  | 'greeting'
  | 'whoami'
  | 'save_query'
  | 'upcoming_bills'   // Próximo mês / Faturas a vencer / Contas a pagar futuro
  | 'today_expenses'   // Gastos de hoje
  | 'installments'     // Parcelamentos ativos
  | 'goals'            // Metas financeiras
  | 'summary'          // Resumo do mês atual
  | 'budget_status'    // Situação do orçamento / Saldo restante
  | 'company_expenses' // Gastos PJ (NR Brownies)
  | 'personal_expenses'// Gastos PF (Pessoal)
  | 'category_expenses'// Gastos por Categoria
  | 'reserve'          // Fundo de Reserva
  | 'bank_transactions'// Open Finance / Pluggy
  | 'tips'             // Dicas para economizar
  | 'biggest_expense'  // Maiores despesas
  | 'recurring'        // Despesas recorrentes
  | 'income'           // Renda e balanço
  | 'monthly_trend';   // Evolução mensal

interface IntentScore {
  intent: Intent;
  score: number;
}

function detectIntent(norm: string): Intent {
  const scores: IntentScore[] = [];

  const add = (intent: Intent, points: number) => {
    const existing = scores.find((s) => s.intent === intent);
    if (existing) existing.score += points;
    else scores.push({ intent, score: points });
  };

  // 1. GREETING
  if (/^(oi|ola|boa|oba|hello|hi|e ai|e aí)$/.test(norm.trim())) add('greeting', 100);

  // 2. WHO AM I
  if (has(norm, 'voce', 'tu')) {
    if (has(norm, 'quem', 'o que', 'como funciona', 'qual', 'me fala')) add('whoami', 80);
    if (has(norm, 'pode fazer', 'faz', 'capaz')) add('whoami', 60);
  }

  // 3. SAVE / HISTORY
  if (has(norm, 'salva', 'salvo', 'salvar', 'grava', 'guardada', 'historico', 'conversa fica', 'apaga', 'apagar', 'limpar')) add('save_query', 80);

  // 4. UPCOMING BILLS / NEXT MONTH (PRÓXIMO MÊS) — Alta Prioridade
  const isFutureTime = has(norm, 'proximo mes', 'proximos mes', 'mes que vem', 'proxima fatura', 'fatura que vem', 'proximas contas', 'mes seguinte', 'futuro');
  const isPayAction = has(norm, 'pagar', 'tenho para pagar', 'tenho pra pagar', 'a pagar', 'vencer', 'vencimento', 'contas');
  
  if (isFutureTime || (isPayAction && (norm.includes('mes') || norm.includes('que vem') || norm.includes('proxim')))) {
    add('upcoming_bills', 130);
  } else if (has(norm, 'tenho para pagar', 'tenho pra pagar', 'contas a pagar', 'contas que vem')) {
    add('upcoming_bills', 100);
  }

  // 5. TODAY EXPENSES
  if (has(norm, 'hoje') && has(norm, 'gastei', 'gasto', 'gastos', 'compras', 'quanto', 'total')) {
    add('today_expenses', 110);
  }

  // 6. INSTALLMENTS
  if (has(norm, 'parcela', 'parcelas', 'parcelado', 'prestacao', 'prestacoes', 'cartao parcelado')) {
    add('installments', 100);
  }

  // 7. GOALS
  if (has(norm, 'meta', 'metas', 'objetivo', 'objetivos', 'sonho', 'sonhos', 'quanto falta para a meta')) {
    add('goals', 100);
  }

  // 8. SUMMARY / TOTAL SPENT (MÊS ATUAL)
  if (has(norm, 'gastei', 'gasto', 'gastar', 'gastando', 'gastos', 'total', 'resumo', 'relatorio', 'balanço', 'balanco', 'situacao', 'situação')) {
    if (!isFutureTime) add('summary', 40);
  }
  if (has(norm, 'este mes', 'esse mes', 'mes atual', 'agora') && !isFutureTime) {
    add('summary', 30);
  }

  // 9. BUDGET / LIMIT
  if (has(norm, 'resta', 'restante', 'sobrou', 'sobra', 'disponivel', 'disponível', 'livre', 'sobrado')) add('budget_status', 60);
  if (has(norm, 'orcamento', 'orçamento', 'teto', 'limite')) add('budget_status', 50);
  if (has(norm, 'ainda posso', 'posso gastar', 'gastei demais', 'excedi', 'estourei')) add('budget_status', 70);

  // 10. COMPANY / NR BROWNIES
  if (has(norm, 'empresa', 'negocio', 'negócio', 'pj', 'brownie', 'brownies', 'nr brownies', 'cnpj')) add('company_expenses', 60);

  // 11. PERSONAL
  if (has(norm, 'pessoal', 'pf', 'particular', 'minha vida', 'uso proprio')) add('personal_expenses', 60);

  // 12. CATEGORY
  const catWords = ['alimentacao', 'comida', 'mercado', 'restaurante', 'supermercado', 'ifood',
    'transporte', 'uber', 'gasolina', 'combustivel', 'onibus', 'metro',
    'saude', 'medico', 'farmacia', 'remedio', 'consulta', 'exame',
    'moradia', 'aluguel', 'agua', 'luz', 'energia', 'internet', 'condominio',
    'lazer', 'cinema', 'show', 'viagem', 'passeio', 'streaming', 'netflix',
    'fornecedor', 'insumo', 'materia prima', 'embalagem',
    'outros', 'outros gastos', 'diverso'];
  if (catWords.some((w) => has(norm, w))) add('category_expenses', 80);
  if (has(norm, 'categoria', 'categorias', 'por categoria', 'por tipo')) add('category_expenses', 70);

  // 13. RESERVE
  if (has(norm, 'reserva', 'reservado', 'guardado', 'emergencia', 'poupanca', 'poupança', 'investimento', 'guardar', 'economizado')) add('reserve', 80);

  // 14. BANK / PLUGGY
  if (has(norm, 'banco', 'extrato', 'pluggy', 'pendente', 'open finance', 'conciliar', 'conciliacao', 'importado', 'lancamento bancario', 'pix recebido', 'transacao')) add('bank_transactions', 80);

  // 15. TIPS / SAVE MONEY
  if (has(norm, 'economizar', 'economizo', 'dica', 'conselho', 'ajuda', 'sugestao', 'sugestão', 'como poupar', 'reduzir', 'cortar', 'gastar menos')) add('tips', 80);

  // 16. BIGGEST EXPENSE
  if (has(norm, 'maior', 'maiores', 'mais caro', 'mais cara', 'mais gastei', 'mais gastou', 'topo', 'principal')) add('biggest_expense', 80);

  // 17. RECURRING
  if (has(norm, 'recorrente', 'recorrentes', 'fixo', 'fixos', 'mensalidade', 'mensal', 'todo mes', 'assinatura', 'assinaturas')) add('recurring', 80);

  // 18. INCOME
  if (has(norm, 'renda', 'salario', 'salário', 'receita', 'ganho', 'ganha', 'entrou', 'recebei', 'recebimento')) add('income', 80);

  // 19. TREND / HISTORY
  if (has(norm, 'comparar', 'comparacao', 'mes passado', 'meses anteriores', 'tendencia', 'tendência', 'evolucao')) add('monthly_trend', 80);

  // Se não teve nenhum ponto, dar um fallback de summary
  if (scores.length === 0) add('summary', 10);

  scores.sort((a, b) => b.score - a.score);
  return scores[0].intent;
}

// ─────────────────────────────────────────────────────────────────
// GERADORES DE RESPOSTA (HANDLERS)
// ─────────────────────────────────────────────────────────────────

function replyGreeting(norm: string, ctx: FinancialContext): string {
  const hora = new Date().getHours();
  const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
  let r = `${saudacao}! 👋 Sou o **NR Finance AI**, seu assistente financeiro.\n\n`;
  if (ctx.summary) {
    r += `Hoje você utilizou **${formatCurrency(ctx.summary.totalGasto)}** de **${formatCurrency(ctx.summary.limite)}** disponíveis. Saldo livre: **${formatCurrency(ctx.summary.saldoRestante)}**.\n\n`;
  }
  r += `Como posso ajudar? Pode perguntar qualquer coisa sobre seus gastos, contas do próximo mês, orçamento ou a NR Brownies! 💬`;
  return r;
}

function replyWhoAmI(): string {
  return `🤖 Sou o **NR Finance AI** — seu assistente financeiro pessoal e empresarial!\n\n**O que posso fazer por você:**\n• Prever contas e faturas para o próximo mês\n• Informar quanto você gastou e quanto ainda tem disponível\n• Acompanhar o progresso das suas Metas Financeiras\n• Detalhar gastos por categoria (Alimentação, Transporte, etc.)\n• Comparar despesas Pessoais (PF) vs. NR Brownies (PJ)\n• Mostrar o saldo do seu fundo de reserva\n• Listar transações importadas do banco (Open Finance)\n• Dar dicas personalizadas para economizar\n\nPode me perguntar em linguagem natural, como se estivesse falando com um amigo! 😊`;
}

function replySaveQuery(): string {
  return `Sim! 💾 **Nossa conversa fica salva automaticamente** na sua conta.\n\nVocê pode fechar o app, mudar de tela e voltar — as mensagens estarão aqui! Para apagar o histórico, toque na **lixeira 🗑️** no canto superior direito do chat.`;
}

function replyUpcomingBills(norm: string, ctx: FinancialContext): string {
  const { expenses, nextMonthRecurring } = ctx;

  // 1. Recorrentes para o próximo mês
  const recurringList = (nextMonthRecurring && nextMonthRecurring.length > 0)
    ? nextMonthRecurring
    : expenses.filter((e) => e.tipo === 'recorrente');

  // 2. Parcelamentos com parcelas restantes
  const installmentList = expenses.filter(
    (e) => (e.parcelasRestantes ?? 0) > 1 || (e.totalParcelas ?? 0) > 1
  );

  const totalRecurring = recurringList.reduce((s, e) => s + e.valor, 0);
  const totalInstallments = installmentList.reduce((s, e) => s + e.valor, 0);
  const totalPrevisto = totalRecurring + totalInstallments;

  if (recurringList.length === 0 && installmentList.length === 0) {
    return `📅 **Previsão de Contas para o Próximo Mês**\n\nNo momento, você não tem despesas recorrentes ou parceladas cadastradas para o próximo mês.\n\n💡 Ao cadastrar uma despesa no **+** marcando como **"Recorrente"** ou **"Parcelada"**, o sistema calculará automaticamente o valor a pagar nos próximos meses!`;
  }

  let r = `📅 **Previsão de Contas para o Próximo Mês**\n\n`;

  if (recurringList.length > 0) {
    r += `🔄 **Despesas Recorrentes (Fixo):**\n`;
    recurringList.forEach((e) => {
      r += `• **${e.nome}** (${e.origem === 'negocio' ? 'PJ' : 'PF'} · *${e.categoria}*): **${formatCurrency(e.valor)}**\n`;
    });
    r += `\n`;
  }

  if (installmentList.length > 0) {
    r += `💳 **Próximas Parcelas a Vencer:**\n`;
    installmentList.forEach((e) => {
      const pAtual = e.parcelaNumero ? e.parcelaNumero + 1 : 2;
      const pTotal = e.totalParcelas || '?';
      r += `• **${e.nome}** (${e.origem === 'negocio' ? 'PJ' : 'PF'}): **${formatCurrency(e.valor)}** *(Parcela ${pAtual}/${pTotal})*\n`;
    });
    r += `\n`;
  }

  r += `💰 **Total Previsto para Pagar no Próximo Mês:** **${formatCurrency(totalPrevisto)}**`;
  return r;
}

function replyTodayExpenses(ctx: FinancialContext): string {
  const { expenses } = ctx;
  const today = new Date();

  const todayExp = expenses.filter((e) => {
    const d = new Date(e.data);
    return (
      d.getDate() === today.getDate() &&
      d.getMonth() === today.getMonth() &&
      d.getFullYear() === today.getFullYear()
    );
  });

  const total = todayExp.reduce((s, e) => s + e.valor, 0);

  if (todayExp.length === 0) {
    return `📆 **Gastos de Hoje:** Você ainda não registrou nenhuma despesa hoje (${today.toLocaleDateString('pt-BR')})! 🎉`;
  }

  let r = `📆 **Gastos de Hoje (${today.toLocaleDateString('pt-BR')}):** **${formatCurrency(total)}**\n\n📋 **Lançamentos:**\n`;
  todayExp.forEach((e) => {
    r += `• **${e.nome}** (${e.origem === 'negocio' ? 'PJ' : 'PF'} · *${e.categoria}*) — **${formatCurrency(e.valor)}**\n`;
  });
  return r;
}

function replyInstallments(ctx: FinancialContext): string {
  const { expenses } = ctx;
  const installmentExp = expenses.filter((e) => (e.totalParcelas ?? 0) > 1);

  if (installmentExp.length === 0) {
    return `💳 Você não possui despesas parceladas registradas no momento.`;
  }

  const total = installmentExp.reduce((s, e) => s + e.valor, 0);

  let r = `💳 **Despesas Parceladas (${installmentExp.length} itens — ${formatCurrency(total)}/mês)**\n\n`;
  installmentExp.forEach((e) => {
    const pNum = e.parcelaNumero ?? 1;
    const pTot = e.totalParcelas ?? 1;
    const rest = e.parcelasRestantes ?? (pTot - pNum);
    r += `• **${e.nome}** — ${formatCurrency(e.valor)} *(Parcela ${pNum} de ${pTot} · Restam ${rest})*\n`;
  });
  return r;
}

function replyGoals(ctx: FinancialContext): string {
  const { goals } = ctx;

  if (!goals || goals.length === 0) {
    return `🎯 Você ainda não possui metas financeiras cadastradas!\n\nAcesse o botão **Metas** no topo da tela Início para criar seu primeiro objetivo (ex: Viagem, Equipamentos para NR Brownies, Reserva).`;
  }

  const activeGoals = goals.filter((g) => !g.concluida);
  if (activeGoals.length === 0) {
    return `🎉 Todas as suas metas foram concluídas! Crie novas metas na tela **Metas**.`;
  }

  let r = `🎯 **Suas Metas Financeiras Ativas (${activeGoals.length})**\n\n`;
  activeGoals.forEach((g) => {
    const pct = g.valorMeta > 0 ? (g.valorAtual / g.valorMeta) * 100 : 0;
    const falta = Math.max(0, g.valorMeta - g.valorAtual);
    r += `${g.emoji} **${g.nome}:** **${formatCurrency(g.valorAtual)}** de ${formatCurrency(g.valorMeta)} (${pct.toFixed(0)}%)\n`;
    r += `  *Falta guardar:* ${formatCurrency(falta)}\n\n`;
  });
  return r;
}

function replySummary(ctx: FinancialContext): string {
  const { summary } = ctx;
  if (!summary || summary.totalGasto === 0) {
    return `📊 Nenhuma despesa registrada ainda neste mês. Toque no **+** para adicionar sua primeira despesa!`;
  }
  let r = `📊 **Resumo do Mês Atual**\n\n`;
  r += `• **Total Gasto:** ${formatCurrency(summary.totalGasto)}\n`;
  r += `• **Teto do Orçamento:** ${formatCurrency(summary.limite)}\n`;
  r += `• **Saldo Disponível:** ${formatCurrency(summary.saldoRestante)}\n`;
  r += `• **Orçamento usado:** ${summary.percentualUsado.toFixed(0)}%\n\n`;
  r += `⚖️ **Por Origem:**\n`;
  r += `• 👤 Pessoal (PF): **${formatCurrency(summary.totalPessoal)}**\n`;
  r += `• 🏢 NR Brownies (PJ): **${formatCurrency(summary.totalNegocio)}**`;
  if (summary.totalGasto > summary.limite) {
    r += `\n\n⚠️ **Atenção:** orçamento excedido em **${formatCurrency(summary.totalGasto - summary.limite)}**!`;
  }
  return r;
}

function replyBudgetStatus(ctx: FinancialContext): string {
  const { summary } = ctx;
  if (!summary) return `Seu teto padrão é de **R$ 3.000,00**. Configure nas Configurações!`;
  const diasNoMes = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
  const diasRestantes = Math.max(1, diasNoMes - new Date().getDate());
  const mediaDiaria = summary.saldoRestante > 0 ? summary.saldoRestante / diasRestantes : 0;

  let r = `🎯 **Situação do Orçamento**\n\n`;
  r += `• **Teto Definido:** ${formatCurrency(summary.limite)}\n`;
  r += `• **Utilizado:** ${formatCurrency(summary.totalGasto)} (${summary.percentualUsado.toFixed(0)}%)\n`;
  r += `• **Disponível:** ${formatCurrency(summary.saldoRestante)}\n\n`;

  if (summary.saldoRestante > 0) {
    r += `💡 Você tem **${diasRestantes} dias** restantes no mês e pode gastar até **${formatCurrency(mediaDiaria)}/dia** sem estourar o limite!`;
  } else if (summary.saldoRestante < 0) {
    r += `⚠️ Você estourou o orçamento em **${formatCurrency(Math.abs(summary.saldoRestante))}**. Evite novos gastos não essenciais!`;
  } else {
    r += `✅ Você utilizou exatamente seu orçamento!`;
  }
  return r;
}

function replyCompanyExpenses(norm: string, ctx: FinancialContext): string {
  const { expenses, summary } = ctx;
  const companyExp = expenses.filter((e) => e.origem === 'negocio');
  const total = companyExp.reduce((s, e) => s + e.valor, 0);

  const wantsList = has(norm, 'quais', 'lista', 'detalhe', 'detalhes', 'cada', 'nome', 'tudo', 'mostrar', 'mostra', 'sem ser total', 'especific', 'individual', 'item', 'itens');

  if (companyExp.length === 0) {
    return `🏢 Nenhuma despesa da empresa **NR Brownies (PJ)** registrada neste mês.`;
  }

  let r = `🏢 **Gastos da NR Brownies (PJ) este mês:** **${formatCurrency(total)}**\n`;
  if (summary && summary.totalGasto > 0) {
    r += `*(${((total / summary.totalGasto) * 100).toFixed(0)}% do total de gastos)*\n`;
  }

  if (wantsList || companyExp.length <= 10) {
    r += `\n📋 **Lançamentos:**\n`;
    companyExp.forEach((e) => {
      const dt = new Date(e.data).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      r += `• **${e.nome}** — ${formatCurrency(e.valor)} (*${e.categoria}*, ${dt})\n`;
    });
  } else {
    r += `\n📋 **Últimos 5 lançamentos:**\n`;
    companyExp.slice(0, 5).forEach((e) => {
      const dt = new Date(e.data).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      r += `• **${e.nome}** — ${formatCurrency(e.valor)} (${dt})\n`;
    });
    r += `\n_(${companyExp.length - 5} lançamentos adicionais não exibidos)_`;
  }
  return r;
}

function replyPersonalExpenses(norm: string, ctx: FinancialContext): string {
  const { expenses, summary } = ctx;
  const personalExp = expenses.filter((e) => e.origem === 'pessoal');
  const total = personalExp.reduce((s, e) => s + e.valor, 0);

  const wantsList = has(norm, 'quais', 'lista', 'detalhe', 'detalhes', 'cada', 'nome', 'tudo', 'mostrar', 'mostra', 'sem ser total', 'especific', 'individual', 'item', 'itens');

  if (personalExp.length === 0) {
    return `👤 Nenhuma despesa pessoal (PF) registrada neste mês.`;
  }

  let r = `👤 **Gastos Pessoais (PF) este mês:** **${formatCurrency(total)}**\n`;
  if (summary && summary.totalGasto > 0) {
    r += `*(${((total / summary.totalGasto) * 100).toFixed(0)}% do total de gastos)*\n`;
  }

  if (wantsList || personalExp.length <= 10) {
    r += `\n📋 **Lançamentos:**\n`;
    personalExp.forEach((e) => {
      const dt = new Date(e.data).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      r += `• **${e.nome}** — ${formatCurrency(e.valor)} (*${e.categoria}*, ${dt})\n`;
    });
  } else {
    r += `\n📋 **Últimos 5 lançamentos:**\n`;
    personalExp.slice(0, 5).forEach((e) => {
      const dt = new Date(e.data).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      r += `• **${e.nome}** — ${formatCurrency(e.valor)} (${dt})\n`;
    });
  }
  return r;
}

function replyCategoryExpenses(norm: string, ctx: FinancialContext): string {
  const { expenses, summary } = ctx;

  const catMap: Record<string, ExpenseCategory> = {
    'alimentacao': 'Alimentação', 'comida': 'Alimentação', 'mercado': 'Alimentação',
    'restaurante': 'Alimentação', 'supermercado': 'Alimentação', 'ifood': 'Alimentação',
    'transporte': 'Transporte', 'uber': 'Transporte', 'gasolina': 'Transporte',
    'combustivel': 'Transporte', 'onibus': 'Transporte', 'metro': 'Transporte', 'carro': 'Transporte',
    'saude': 'Saúde', 'medico': 'Saúde', 'farmacia': 'Saúde', 'remedio': 'Saúde',
    'consulta': 'Saúde', 'exame': 'Saúde', 'hospital': 'Saúde',
    'moradia': 'Moradia', 'aluguel': 'Moradia', 'agua': 'Moradia', 'luz': 'Moradia',
    'energia': 'Moradia', 'internet': 'Moradia', 'condominio': 'Moradia', 'casa': 'Moradia',
    'lazer': 'Lazer', 'cinema': 'Lazer', 'show': 'Lazer', 'viagem': 'Lazer',
    'passeio': 'Lazer', 'streaming': 'Lazer', 'netflix': 'Lazer', 'spotify': 'Lazer',
    'fornecedor': 'Fornecedores', 'insumo': 'Fornecedores', 'materia': 'Fornecedores', 'embalagem': 'Fornecedores',
    'outros': 'Outros',
  };

  let targetCategory: ExpenseCategory | null = null;
  for (const [word, cat] of Object.entries(catMap)) {
    if (has(norm, word)) { targetCategory = cat; break; }
  }

  if (!targetCategory) {
    if (!summary || Object.keys(summary.byCategory).length === 0) {
      return `📊 Nenhum gasto por categoria registrado ainda neste mês.`;
    }
    const totalGeral = summary.totalGasto;
    let r = `📊 **Gastos por Categoria (mês atual):**\n\n`;
    const sorted = Object.entries(summary.byCategory).sort((a, b) => b[1] - a[1]);
    sorted.forEach(([cat, val]) => {
      const pct = totalGeral > 0 ? ((val / totalGeral) * 100).toFixed(0) : 0;
      r += `• **${cat}:** ${formatCurrency(val)} (${pct}%)\n`;
    });
    return r;
  }

  const catExp = expenses.filter((e) => e.categoria === targetCategory);
  const catTotal = catExp.reduce((s, e) => s + e.valor, 0);

  if (catExp.length === 0) {
    return `📊 Nenhum gasto em **${targetCategory}** este mês.`;
  }

  let r = `📊 **Gastos com ${targetCategory}:** **${formatCurrency(catTotal)}**\n\n`;
  r += `📋 **Lançamentos:**\n`;
  catExp.forEach((e) => {
    const dt = new Date(e.data).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    r += `• **${e.nome}** (${e.origem === 'negocio' ? 'PJ' : 'PF'}) — ${formatCurrency(e.valor)} em ${dt}\n`;
  });
  return r;
}

function replyReserve(ctx: FinancialContext): string {
  const { budget, summary } = ctx;
  const valRes = budget?.valorReservado ?? 0;
  const acumulado = summary?.totalGastoReservadoAcumulado ?? 0;
  let r = `💰 **Fundo de Reserva / Emergência**\n\n`;
  r += `• **Total Guardado:** ${formatCurrency(valRes)}\n`;
  r += `• **Já utilizado da reserva:** ${formatCurrency(acumulado)}\n`;
  r += `• **Saldo da reserva estimado:** ${formatCurrency(Math.max(0, valRes - acumulado))}\n\n`;
  r += `💡 O fundo de reserva é protegido — gastos marcados como "Reserva" **não** afetam seu teto mensal!`;
  return r;
}

function replyBankTransactions(ctx: FinancialContext): string {
  const { pendingTransactions } = ctx;
  if (pendingTransactions.length === 0) {
    return `🎉 **Open Finance:** Todas as movimentações bancárias estão conciliadas!\n\nNenhuma transação pendente de aprovação no momento.`;
  }
  const n = pendingTransactions.length;
  let r = `🏦 **Open Finance (Pluggy) — ${n} lançamento${n > 1 ? 's' : ''} pendente${n > 1 ? 's' : ''}**\n\n`;
  r += `Acesse a tela **Início** para revisar e categorizar cada lançamento bancário importado com 1 clique.\n\n`;
  const topTxs = pendingTransactions.slice(0, 3);
  topTxs.forEach((tx) => {
    const dt = new Date(tx.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    r += `• **${tx.description}** — ${formatCurrency(tx.amount)} (${tx.bankName}, ${dt})\n`;
  });
  if (n > 3) r += `\n...e mais ${n - 3} lançamentos.`;
  return r;
}

function replyTips(ctx: FinancialContext): string {
  const { summary, expenses } = ctx;
  if (!summary || summary.totalGasto === 0) return `Cadastre suas despesas primeiro para que eu possa sugerir como economizar!`;

  const sorted = Object.entries(summary.byCategory).sort((a, b) => b[1] - a[1]);
  const maiorCat = sorted[0];
  const economy15 = maiorCat ? maiorCat[1] * 0.15 : 0;

  let r = `💡 **Dicas para Economizar este mês**\n\n`;
  if (maiorCat) {
    r += `1. **Foco em ${maiorCat[0]}:** Sua maior categoria, com **${formatCurrency(maiorCat[1])}**. Cortar 15% aqui economiza **${formatCurrency(economy15)}/mês**!\n`;
  }
  if (summary.percentualUsado > 75) {
    r += `2. **Atenção ao orçamento:** Você já usou ${summary.percentualUsado.toFixed(0)}% do teto. Priorize gastos essenciais!\n`;
  }
  if (summary.totalNegocio > 0) {
    r += `3. **Separe caixas:** Mantenha os custos da **NR Brownies (PJ)** separados para não confundir com gastos pessoais.\n`;
  }
  const recurring = expenses.filter((e) => e.tipo === 'recorrente');
  if (recurring.length > 0) {
    const totalRec = recurring.reduce((s, e) => s + e.valor, 0);
    r += `4. **Revise recorrências:** Você tem **${recurring.length} despesa${recurring.length > 1 ? 's' : ''} recorrente${recurring.length > 1 ? 's'  : ''}** totalizando **${formatCurrency(totalRec)}**. Alguma pode ser cancelada?`;
  }
  return r;
}

function replyBiggestExpense(ctx: FinancialContext): string {
  const { expenses } = ctx;
  if (expenses.length === 0) return `Nenhuma despesa registrada neste mês ainda.`;
  const sorted = [...expenses].sort((a, b) => b.valor - a.valor);
  let r = `🏆 **Maiores Despesas do Mês**\n\n`;
  sorted.slice(0, 5).forEach((e, i) => {
    const dt = new Date(e.data).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    r += `${i + 1}. **${e.nome}** (${e.origem === 'negocio' ? 'PJ' : 'PF'} · *${e.categoria}*) — **${formatCurrency(e.valor)}** em ${dt}\n`;
  });
  return r;
}

function replyRecurring(ctx: FinancialContext): string {
  const { expenses } = ctx;
  const recurring = expenses.filter((e) => e.tipo === 'recorrente');
  if (recurring.length === 0) return `Nenhuma despesa recorrente registrada neste mês.`;
  const total = recurring.reduce((s, e) => s + e.valor, 0);
  let r = `🔄 **Despesas Recorrentes (${recurring.length} itens — ${formatCurrency(total)} total)**\n\n`;
  recurring.forEach((e) => {
    r += `• **${e.nome}** — ${formatCurrency(e.valor)} (*${e.categoria}*, ${e.origem === 'negocio' ? 'PJ' : 'PF'})\n`;
  });
  return r;
}

function replyIncome(ctx: FinancialContext): string {
  const { budget, summary } = ctx;
  const renda = budget?.rendaMensal ?? 0;
  const gasto = summary?.totalGasto ?? 0;
  const sobra = renda - gasto;
  let r = `💵 **Renda e Balanço Financeiro**\n\n`;
  r += `• **Renda Mensal Informada:** ${formatCurrency(renda)}\n`;
  r += `• **Total Gasto:** ${formatCurrency(gasto)}\n`;
  r += `• **Balanço:** ${sobra >= 0 ? `✅ Sobram **${formatCurrency(sobra)}**` : `⚠️ Déficit de **${formatCurrency(Math.abs(sobra))}**`}\n\n`;
  if (renda === 0) r += `💡 Configure sua renda mensal na aba **Orçamento** para ver seu balanço completo!`;
  return r;
}

function replyMonthlyTrend(ctx: FinancialContext): string {
  return `📈 Para comparar seus gastos mês a mês, acesse a aba **Relatórios** na barra inferior!\n\nLá você pode ver:\n• Gráfico de evolução dos últimos 3, 6 ou 12 meses\n• Ranking de categorias no período\n• Comparativo Pessoal (PF) vs. NR Brownies (PJ)`;
}

// ─────────────────────────────────────────────────────────────────
// MOTOR PRINCIPAL
// ─────────────────────────────────────────────────────────────────

function processSmartNaturalLanguageQuery(
  rawPrompt: string,
  ctx: FinancialContext,
  history: ChatMessage[] = []
): string {
  const norm = normalize(rawPrompt);

  // Detecta intenção com pontuação
  const intent = detectIntent(norm);

  switch (intent) {
    case 'greeting':        return replyGreeting(norm, ctx);
    case 'whoami':          return replyWhoAmI();
    case 'save_query':      return replySaveQuery();
    case 'upcoming_bills':  return replyUpcomingBills(norm, ctx);
    case 'today_expenses':  return replyTodayExpenses(ctx);
    case 'installments':    return replyInstallments(ctx);
    case 'goals':           return replyGoals(ctx);
    case 'summary':         return replySummary(ctx);
    case 'budget_status':   return replyBudgetStatus(ctx);
    case 'company_expenses':return replyCompanyExpenses(norm, ctx);
    case 'personal_expenses': return replyPersonalExpenses(norm, ctx);
    case 'category_expenses': return replyCategoryExpenses(norm, ctx);
    case 'reserve':         return replyReserve(ctx);
    case 'bank_transactions': return replyBankTransactions(ctx);
    case 'tips':            return replyTips(ctx);
    case 'biggest_expense': return replyBiggestExpense(ctx);
    case 'recurring':       return replyRecurring(ctx);
    case 'income':          return replyIncome(ctx);
    case 'monthly_trend':   return replyMonthlyTrend(ctx);
    default:                return replySummary(ctx);
  }
}

// ─────────────────────────────────────────────────────────────────
// INTERFACE PÚBLICA & PROMPT SYSTEM PARA LLM
// ─────────────────────────────────────────────────────────────────

function buildSystemContextPrompt(ctx: FinancialContext): string {
  const { summary, budget, expenses, pendingTransactions, nextMonthRecurring, goals } = ctx;
  const mes = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  let text = `Você é o **NR Finance AI**, o assistente virtual de inteligência financeira do aplicativo **NRFinance** (para uso pessoal e do negócio NR Brownies e Bolos).\n`;
  text += `Responda SEMPRE em português brasileiro, de forma natural, amigável e direta.\n`;
  text += `Use negrito para valores em R$. Use bullet points e emojis para organizar respostas longas.\n`;
  text += `Atenção aos termos temporais: "este mês" refere-se ao mês atual (${mes}), "próximo mês" ou "mês que vem" refere-se à previsão de contas futuras/recorrentes/parcelas.\n\n`;
  text += `Contexto Financeiro Atual (${mes}):\n`;

  if (budget) {
    text += `- Teto de Gastos Mensais: ${formatCurrency(budget.limite)}\n`;
    text += `- Renda Mensal Informada: ${formatCurrency(budget.rendaMensal)}\n`;
    text += `- Valor Reservado Total: ${formatCurrency(budget.valorReservado || 0)}\n`;
  }

  if (summary) {
    text += `- Total Gasto no Mês Atual: ${formatCurrency(summary.totalGasto)}\n`;
    text += `- Saldo Restante do Teto: ${formatCurrency(summary.saldoRestante)} (${(100 - summary.percentualUsado).toFixed(1)}% livre)\n`;
    text += `- Gastos Pessoais (PF): ${formatCurrency(summary.totalPessoal)}\n`;
    text += `- Gastos do Negócio NR Brownies (PJ): ${formatCurrency(summary.totalNegocio)}\n`;
    text += `- Gastos por Categoria:\n`;
    Object.entries(summary.byCategory).forEach(([cat, val]) => {
      text += `  * ${cat}: ${formatCurrency(val)}\n`;
    });
  }

  if (nextMonthRecurring && nextMonthRecurring.length > 0) {
    text += `- Previsão de Despesas Recorrentes para o Próximo Mês (${nextMonthRecurring.length} itens):\n`;
    nextMonthRecurring.forEach((e) => {
      text += `  * [${e.origem.toUpperCase()}] ${e.nome} (${e.categoria}): ${formatCurrency(e.valor)}\n`;
    });
  }

  if (goals && goals.length > 0) {
    text += `- Metas Financeiras Ativas (${goals.length} metas):\n`;
    goals.forEach((g) => {
      text += `  * ${g.emoji} ${g.nome}: ${formatCurrency(g.valorAtual)} de ${formatCurrency(g.valorMeta)}\n`;
    });
  }

  if (pendingTransactions.length > 0) {
    text += `- Movimentações Bancárias Pendentes (Pluggy): ${pendingTransactions.length} lançamentos.\n`;
  }

  if (expenses.length > 0) {
    text += `- Todas as Despesas do Mês Atual (${expenses.length} lançamentos):\n`;
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
  // Tenta Gemini API se a chave estiver configurada
  if (GEMINI_API_KEY) {
    try {
      const systemContextPrompt = buildSystemContextPrompt(context);
      const contentsHistory = history.slice(-6).map((msg) => ({
        role: msg.sender === 'user' ? 'user' : 'model',
        parts: [{ text: msg.text }],
      }));

      const res = await fetch(GEMINI_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            { role: 'user', parts: [{ text: systemContextPrompt }] },
            ...contentsHistory,
            { role: 'user', parts: [{ text: `${prompt}` }] },
          ],
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (candidateText) return candidateText.trim();
      }
    } catch (err) {
      console.warn('Gemini API indisponível, utilizando o motor local de IA:', err);
    }
  }

  // Motor de Inteligência Financeira Local de Linguagem Natural
  return processSmartNaturalLanguageQuery(prompt, context, history);
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
