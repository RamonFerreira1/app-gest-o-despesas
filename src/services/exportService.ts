import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import { MonthlyReport } from './reportsService';
import { MonthSummary, Budget } from '../types';
import { formatCurrency } from './insightService';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

function generateHTML(
  reports: MonthlyReport[],
  summary: MonthSummary | null,
  budget: Budget | null
): string {
  const now = format(new Date(), "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
  const mesAtual = format(new Date(), "MMMM 'de' yyyy", { locale: ptBR });

  const catRows = summary
    ? Object.entries(summary.byCategory)
        .sort((a, b) => b[1] - a[1])
        .map(
          ([cat, val]) => `
      <tr>
        <td>${cat}</td>
        <td>${formatCurrency(val)}</td>
        <td>${summary.totalGasto > 0 ? ((val / summary.totalGasto) * 100).toFixed(1) : 0}%</td>
      </tr>`
        )
        .join('')
    : '';

  const historyRows = reports
    .map(
      (r) => `
    <tr>
      <td style="text-transform:capitalize">${r.month}</td>
      <td>${formatCurrency(r.total)}</td>
      <td>${formatCurrency(r.totalPessoal)}</td>
      <td>${formatCurrency(r.totalNegocio)}</td>
    </tr>`
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, Arial, sans-serif; background: #0A0A0F; color: #fff; padding: 32px; }
    h1 { font-size: 28px; font-weight: 800; color: #00E676; margin-bottom: 4px; }
    h2 { font-size: 18px; font-weight: 700; color: #fff; margin: 24px 0 12px; border-left: 4px solid #00E676; padding-left: 12px; }
    p.subtitle { font-size: 14px; color: #8A8AA0; margin-bottom: 32px; }
    .cards { display: flex; gap: 16px; margin-bottom: 32px; }
    .card { flex: 1; background: #13131A; border-radius: 16px; padding: 20px; border: 1px solid #1E1E2E; }
    .card-label { font-size: 12px; color: #8A8AA0; margin-bottom: 4px; }
    .card-value { font-size: 22px; font-weight: 800; }
    table { width: 100%; border-collapse: collapse; background: #13131A; border-radius: 12px; overflow: hidden; }
    th { background: #1C1C26; color: #8A8AA0; font-size: 12px; font-weight: 600; text-align: left; padding: 10px 16px; }
    td { padding: 10px 16px; border-bottom: 1px solid #1E1E2E; font-size: 14px; color: #fff; }
    tr:last-child td { border-bottom: none; }
    .green { color: #00E676; font-weight: 700; }
    .danger { color: #FF4D4D; font-weight: 700; }
    .footer { margin-top: 32px; text-align: center; font-size: 12px; color: #55556A; }
  </style>
</head>
<body>
  <h1>📊 NRFinance — Relatório Financeiro</h1>
  <p class="subtitle">Gerado em ${now} • ${mesAtual}</p>

  <div class="cards">
    <div class="card">
      <div class="card-label">Total Gasto (Mês Atual)</div>
      <div class="card-value ${(summary?.totalGasto ?? 0) > (budget?.limite ?? 0) ? 'danger' : 'green'}">${formatCurrency(summary?.totalGasto ?? 0)}</div>
    </div>
    <div class="card">
      <div class="card-label">Teto Mensal</div>
      <div class="card-value">${formatCurrency(budget?.limite ?? 0)}</div>
    </div>
    <div class="card">
      <div class="card-label">Saldo Disponível</div>
      <div class="card-value ${(summary?.saldoRestante ?? 0) >= 0 ? 'green' : 'danger'}">${formatCurrency(summary?.saldoRestante ?? 0)}</div>
    </div>
  </div>

  <div class="cards">
    <div class="card">
      <div class="card-label">Pessoal (PF)</div>
      <div class="card-value" style="color:#4D9FFF">${formatCurrency(summary?.totalPessoal ?? 0)}</div>
    </div>
    <div class="card">
      <div class="card-label">NR Brownies (PJ)</div>
      <div class="card-value" style="color:#AB47BC">${formatCurrency(summary?.totalNegocio ?? 0)}</div>
    </div>
    <div class="card">
      <div class="card-label">Fundo de Reserva</div>
      <div class="card-value" style="color:#00E676">${formatCurrency(budget?.valorReservado ?? 0)}</div>
    </div>
  </div>

  ${catRows ? `
  <h2>Gastos por Categoria (Mês Atual)</h2>
  <table>
    <thead><tr><th>Categoria</th><th>Total</th><th>%</th></tr></thead>
    <tbody>${catRows}</tbody>
  </table>` : ''}

  ${historyRows ? `
  <h2>Histórico Mensal</h2>
  <table>
    <thead>
      <tr><th>Mês</th><th>Total</th><th>Pessoal (PF)</th><th>NR Brownies (PJ)</th></tr>
    </thead>
    <tbody>${historyRows}</tbody>
  </table>` : ''}

  <div class="footer">Relatório gerado pelo NRFinance • Dados pessoais e confidenciais</div>
</body>
</html>`;
}

export async function exportReportToPDF(
  reports: MonthlyReport[],
  summary: MonthSummary | null,
  budget: Budget | null
): Promise<void> {
  const html = generateHTML(reports, summary, budget);

  if (Platform.OS === 'web') {
    // Na web, abre em nova aba
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    return;
  }

  const { uri } = await Print.printToFileAsync({ html, base64: false });

  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: 'Compartilhar Relatório NRFinance',
      UTI: '.pdf',
    });
  }
}
