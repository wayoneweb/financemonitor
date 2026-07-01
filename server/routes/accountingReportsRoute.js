const express = require('express');
const db      = require('../database');
const router  = express.Router();
const { getBalancesAsOf, getPeriodMovement } = require('../lib/ledgerCalc');

const today = () => new Date().toISOString().slice(0, 10);

// ── Report computation ─────────────────────────────────────────

function computeTrialBalance(companyId, asOf, cb) {
  getBalancesAsOf(db, companyId, asOf, (err, ledgers) => {
    if (err) return cb(err);
    let dr_total = 0, cr_total = 0;
    const rows = ledgers.map((a) => {
      const normal = a.account_type === 'asset' || a.account_type === 'expense' ? 'debit' : 'credit';
      const onNormalSide = a.balance >= 0;
      const debit  = onNormalSide === (normal === 'debit') ? Math.abs(a.balance) : 0;
      const credit = onNormalSide === (normal === 'credit') ? Math.abs(a.balance) : 0;
      dr_total += debit; cr_total += credit;
      return { id: a.id, name: a.name, group_name: a.group_name, account_type: a.account_type, debit, credit };
    }).filter(r => r.debit !== 0 || r.credit !== 0);
    cb(null, { rows, dr_total, cr_total, difference: dr_total - cr_total });
  });
}

function computeProfitLoss(companyId, from, to, cb) {
  getPeriodMovement(db, companyId, from, to, (err, ledgers) => {
    if (err) return cb(err);
    const income  = ledgers.filter(a => a.account_type === 'income').map(a => ({ id: a.id, name: a.name, amount: a.balance }));
    const expense = ledgers.filter(a => a.account_type === 'expense').map(a => ({ id: a.id, name: a.name, amount: a.balance }));
    const income_total  = income.reduce((s, a) => s + a.amount, 0);
    const expense_total = expense.reduce((s, a) => s + a.amount, 0);
    cb(null, { income, expense, income_total, expense_total, net_profit: income_total - expense_total });
  });
}

function computeBalanceSheet(companyId, asOf, cb) {
  getBalancesAsOf(db, companyId, asOf, (err, ledgers) => {
    if (err) return cb(err);
    const assets      = ledgers.filter(a => a.account_type === 'asset').map(a => ({ id: a.id, name: a.name, group_name: a.group_name, amount: a.balance }));
    const liabilities = ledgers.filter(a => a.account_type === 'liability').map(a => ({ id: a.id, name: a.name, group_name: a.group_name, amount: a.balance }));
    const capital     = ledgers.filter(a => a.account_type === 'capital').map(a => ({ id: a.id, name: a.name, group_name: a.group_name, amount: a.balance }));

    getPeriodMovement(db, companyId, null, asOf, (err2, plLedgers) => {
      if (err2) return cb(err2);
      const income_total  = plLedgers.filter(a => a.account_type === 'income').reduce((s, a) => s + a.balance, 0);
      const expense_total = plLedgers.filter(a => a.account_type === 'expense').reduce((s, a) => s + a.balance, 0);
      const net_profit = income_total - expense_total;

      const assets_total = assets.reduce((s, a) => s + a.amount, 0);
      const liabilities_total = liabilities.reduce((s, a) => s + a.amount, 0);
      const capital_total = capital.reduce((s, a) => s + a.amount, 0) + net_profit;

      cb(null, {
        assets, liabilities, capital, net_profit,
        assets_total, liabilities_total, capital_total,
        difference: assets_total - (liabilities_total + capital_total),
      });
    });
  });
}

// ── Endpoints ───────────────────────────────────────────────────

router.get('/trial-balance', (req, res) => {
  const { company_id, as_of } = req.query;
  if (!company_id) return res.status(400).json({ error: 'company_id required' });
  computeTrialBalance(company_id, as_of || today(), (err, data) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(data);
  });
});

router.get('/profit-loss', (req, res) => {
  const { company_id, from, to } = req.query;
  if (!company_id) return res.status(400).json({ error: 'company_id required' });
  computeProfitLoss(company_id, from || null, to || today(), (err, data) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(data);
  });
});

router.get('/balance-sheet', (req, res) => {
  const { company_id, as_of } = req.query;
  if (!company_id) return res.status(400).json({ error: 'company_id required' });
  computeBalanceSheet(company_id, as_of || today(), (err, data) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(data);
  });
});

// ── Export helpers (shared styling for all three reports) ──────

function excelReport(res, { title, subtitle, columns, rows, totals, filename }) {
  const ExcelJS = require('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Wayone Business Mate';
  wb.created = new Date();
  const ws = wb.addWorksheet(title.slice(0, 30));
  ws.columns = columns.map((c) => ({ key: c.key, width: c.width || 20 }));

  const t1 = ws.addRow([title]);
  t1.font = { bold: true, size: 16, color: { argb: 'FF0F172A' } };
  ws.mergeCells(1, 1, 1, columns.length);
  if (subtitle) {
    const t2 = ws.addRow([subtitle]);
    t2.font = { size: 10, color: { argb: 'FF475569' } };
    ws.mergeCells(2, 1, 2, columns.length);
  }
  ws.addRow([]);

  const hdr = ws.addRow(columns.map((c) => c.label));
  hdr.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { vertical: 'middle' };
  });

  rows.forEach((r, i) => {
    const row = ws.addRow(columns.map((c) => r[c.key]));
    const bg = i % 2 === 0 ? 'FFFFFFFF' : 'FFF8FAFC';
    row.eachCell({ includeEmpty: true }, (cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }; });
    columns.forEach((c, ci) => { if (c.currency) row.getCell(ci + 1).numFmt = '"Rs."#,##0.00'; });
  });

  if (totals) {
    const tRow = ws.addRow(columns.map((c) => (totals[c.key] !== undefined ? totals[c.key] : '')));
    tRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
    });
    columns.forEach((c, ci) => { if (c.currency) tRow.getCell(ci + 1).numFmt = '"Rs."#,##0.00'; });
  }

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
  wb.xlsx.write(res).then(() => res.end()).catch((e) => res.status(500).json({ error: e.message }));
}

function pdfReport(res, { title, subtitle, columns, rows, totals, filename }) {
  const PDFDocument = require('pdfkit');
  const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.pdf"`);
  doc.pipe(res);

  const PW = 595.28, PH = 841.89, M = 40, CW = PW - M * 2;
  const colWidth = CW / columns.length;

  doc.rect(0, 0, PW, 70).fill('#0f172a');
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(16).text(title, M, 18, { width: CW });
  if (subtitle) doc.fillColor('#93c5fd').font('Helvetica').fontSize(9).text(subtitle, M, 42, { width: CW });

  let y = 90;
  const drawHeader = () => {
    doc.rect(M, y, CW, 20).fill('#1e3a8a');
    columns.forEach((c, i) => doc.fillColor('#e0f2fe').font('Helvetica-Bold').fontSize(8)
      .text(c.label, M + i * colWidth + 4, y + 6, { width: colWidth - 8, align: c.align || 'left' }));
    y += 20;
  };
  drawHeader();

  const fmt = (c, r) => (c.currency ? `Rs.${Number(r[c.key] || 0).toFixed(2)}` : String(r[c.key] ?? ''));

  rows.forEach((r, ri) => {
    if (y + 18 > PH - 50) { doc.addPage(); y = 40; drawHeader(); }
    doc.rect(M, y, CW, 18).fill(ri % 2 === 0 ? '#ffffff' : '#f8fafc');
    columns.forEach((c, i) => doc.fillColor('#1e293b').font('Helvetica').fontSize(8)
      .text(fmt(c, r), M + i * colWidth + 4, y + 5, { width: colWidth - 8, align: c.align || 'left', ellipsis: true }));
    y += 18;
  });

  if (totals) {
    if (y + 20 > PH - 50) { doc.addPage(); y = 40; }
    doc.rect(M, y, CW, 20).fill('#0f172a');
    columns.forEach((c, i) => {
      const val = totals[c.key] !== undefined ? (c.currency ? `Rs.${Number(totals[c.key]).toFixed(2)}` : String(totals[c.key])) : '';
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8).text(val, M + i * colWidth + 4, y + 6, { width: colWidth - 8, align: c.align || 'left' });
    });
    y += 20;
  }

  doc.end();
}

function getCompanyName(companyId, cb) {
  db.get('SELECT name FROM inv_companies WHERE id=?', [companyId], (err, row) => cb(row ? row.name : ''));
}

// ── Export routes ───────────────────────────────────────────────

router.get('/trial-balance/export/:fmt', (req, res) => {
  const { company_id, as_of } = req.query;
  if (!company_id) return res.status(400).json({ error: 'company_id required' });
  computeTrialBalance(company_id, as_of || today(), (err, data) => {
    if (err) return res.status(500).json({ error: err.message });
    getCompanyName(company_id, (companyName) => {
      const columns = [
        { key: 'name', label: 'Ledger Account', width: 32 },
        { key: 'group_name', label: 'Group', width: 22 },
        { key: 'debit', label: 'Debit', width: 16, currency: true, align: 'right' },
        { key: 'credit', label: 'Credit', width: 16, currency: true, align: 'right' },
      ];
      const opts = {
        title: 'Trial Balance', subtitle: `${companyName}  |  As of ${as_of || today()}`,
        columns, rows: data.rows, totals: { name: 'TOTAL', debit: data.dr_total, credit: data.cr_total },
        filename: 'trial-balance',
      };
      req.params.fmt === 'pdf' ? pdfReport(res, opts) : excelReport(res, opts);
    });
  });
});

router.get('/profit-loss/export/:fmt', (req, res) => {
  const { company_id, from, to } = req.query;
  if (!company_id) return res.status(400).json({ error: 'company_id required' });
  computeProfitLoss(company_id, from || null, to || today(), (err, data) => {
    if (err) return res.status(500).json({ error: err.message });
    getCompanyName(company_id, (companyName) => {
      const rows = [
        ...data.income.map((a) => ({ section: 'Income', name: a.name, amount: a.amount })),
        ...data.expense.map((a) => ({ section: 'Expense', name: a.name, amount: a.amount })),
      ];
      const columns = [
        { key: 'section', label: 'Section', width: 14 },
        { key: 'name', label: 'Ledger Account', width: 32 },
        { key: 'amount', label: 'Amount', width: 18, currency: true, align: 'right' },
      ];
      const opts = {
        title: 'Profit & Loss', subtitle: `${companyName}  |  ${from || 'Inception'} to ${to || today()}`,
        columns, rows, totals: { section: 'NET PROFIT', amount: data.net_profit },
        filename: 'profit-loss',
      };
      req.params.fmt === 'pdf' ? pdfReport(res, opts) : excelReport(res, opts);
    });
  });
});

router.get('/balance-sheet/export/:fmt', (req, res) => {
  const { company_id, as_of } = req.query;
  if (!company_id) return res.status(400).json({ error: 'company_id required' });
  computeBalanceSheet(company_id, as_of || today(), (err, data) => {
    if (err) return res.status(500).json({ error: err.message });
    getCompanyName(company_id, (companyName) => {
      const rows = [
        ...data.assets.map((a) => ({ section: 'Asset', name: a.name, group_name: a.group_name, amount: a.amount })),
        ...data.liabilities.map((a) => ({ section: 'Liability', name: a.name, group_name: a.group_name, amount: a.amount })),
        ...data.capital.map((a) => ({ section: 'Capital', name: a.name, group_name: a.group_name, amount: a.amount })),
        { section: 'Capital', name: 'Profit & Loss A/c (current)', group_name: '', amount: data.net_profit },
      ];
      const columns = [
        { key: 'section', label: 'Section', width: 14 },
        { key: 'name', label: 'Ledger Account', width: 30 },
        { key: 'group_name', label: 'Group', width: 20 },
        { key: 'amount', label: 'Amount', width: 18, currency: true, align: 'right' },
      ];
      const opts = {
        title: 'Balance Sheet', subtitle: `${companyName}  |  As of ${as_of || today()}`,
        columns, rows,
        totals: { section: 'Assets = Liab. + Capital', amount: data.assets_total },
        filename: 'balance-sheet',
      };
      req.params.fmt === 'pdf' ? pdfReport(res, opts) : excelReport(res, opts);
    });
  });
});

module.exports = router;
