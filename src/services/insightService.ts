import { Expense, Budget, InsightData, MonthSummary } from '../types';

export function calcMonthSummary(expenses: Expense[], budget: Budget): MonthSummary {
  const totalGasto = expenses.reduce((sum, e) => sum + e.valor, 0);
  const totalPessoal = expenses
    .filter((e) => e.origem === 'pessoal')
    .reduce((sum, e) => sum + e.valor, 0);
  const totalNegocio = expenses
    .filter((e) => e.origem === 'negocio')
    .reduce((sum, e) => sum + e.valor, 0);

  const byCategory: Record<string, number> = {};
  expenses.forEach((e) => {
    byCategory[e.categoria] = (byCategory[e.categoria] ?? 0) + e.valor;
  });

  const percentualUsado = budget.limite > 0 ? (totalGasto / budget.limite) * 100 : 0;
  const saldoRestante = budget.limite - totalGasto;

  return {
    totalGasto,
    totalPessoal,
    totalNegocio,
    byCategory,
    limite: budget.limite,
    percentualUsado,
    saldoRestante,
  };
}

export function generateInsights(
  summary: MonthSummary,
  nextMonthRecurring: Expense[],
  budget: Budget
): InsightData[] {
  const insights: InsightData[] = [];

  // ── Alerta 80% ───────────────────────────────────────────────────
  if (summary.percentualUsado >= 100) {
    insights.push({
      type: 'danger',
      icon: 'warning',
      title: '🚨 Limite Ultrapassado!',
      message: `Você ultrapassou o teto mensal de ${formatCurrency(budget.limite)}. Revise seus gastos imediatamente.`,
    });
  } else if (summary.percentualUsado >= 80) {
    insights.push({
      type: 'warning',
      icon: 'alert-circle',
      title: '⚠️ Atenção ao Limite',
      message: `Você já usou ${summary.percentualUsado.toFixed(0)}% do seu teto. Restam apenas ${formatCurrency(summary.saldoRestante)}.`,
    });
  }

  // ── Custo fixo do próximo mês ─────────────────────────────────────
  if (nextMonthRecurring.length > 0) {
    const totalNextMonth = nextMonthRecurring.reduce((sum, e) => sum + e.valor, 0);
    insights.push({
      type: 'info',
      icon: 'calendar',
      title: '📅 Custos do Próximo Mês',
      message: `Com base nas suas despesas recorrentes, você já começa o próximo mês com ${formatCurrency(totalNextMonth)} em custos fixos.`,
    });
  }

  // ── Sugestão de Reserva (20% da renda) ───────────────────────────
  if (budget.rendaMensal > 0) {
    const sobra = budget.rendaMensal - summary.totalGasto;
    if (sobra > 0) {
      const reservaSugerida = sobra * 0.2;
      insights.push({
        type: 'success',
        icon: 'trending-up',
        title: '💰 Sugestão de Reserva',
        message: `Com base na sua renda e gastos atuais, sugerimos guardar ${formatCurrency(reservaSugerida)} este mês (20% da sobra).`,
      });
    }
  }

  // ── Parabéns se tudo bem ──────────────────────────────────────────
  if (insights.length === 0 && summary.percentualUsado < 60) {
    insights.push({
      type: 'success',
      icon: 'checkmark-circle',
      title: '✅ Finanças Saudáveis',
      message: `Ótimo controle! Você usou apenas ${summary.percentualUsado.toFixed(0)}% do seu limite mensal.`,
    });
  }

  return insights;
}

export function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
