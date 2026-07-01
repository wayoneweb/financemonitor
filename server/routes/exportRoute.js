const express = require('express');
const router = express.Router();
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const db = require('../database');

function buildFilter(query) {
  const conditions = [];
  const params = [];
  if (query.type)           { conditions.push("t.type = ?");           params.push(query.type); }
  if (query.project_id)     { conditions.push("t.project_id = ?");     params.push(query.project_id); }
  if (query.category_id)    { conditions.push("t.category_id = ?");    params.push(query.category_id); }
  if (query.status)         { conditions.push("t.status = ?");         params.push(query.status); }
  if (query.payment_method) { conditions.push("t.payment_method = ?"); params.push(query.payment_method); }
  if (query.date_from)      { conditions.push("t.date >= ?");          params.push(query.date_from); }
  if (query.date_to)        { conditions.push("t.date <= ?");          params.push(query.date_to); }
  if (query.search) {
    conditions.push("(t.title LIKE ? OR t.party_name LIKE ? OR t.reference_no LIKE ?)");
    const s = `%${query.search}%`;
    params.push(s, s, s);
  }
  return { where: conditions.length ? ' WHERE ' + conditions.join(' AND ') : '', params };
}

const FETCH_SQL = `
  SELECT t.id, t.date, t.type, t.title, t.description, t.amount, t.currency,
    t.reference_no, t.payment_method, t.party_name, t.tax_amount, t.discount,
    t.notes, t.status, t.attachment_name, t.created_at,
    p.name as project_name, c.name as category_name
  FROM transactions t
  LEFT JOIN projects p ON p.id = t.project_id
  LEFT JOIN categories c ON c.id = t.category_id
`;

// ─── Excel Export ────────────────────────────────────────────────────────────
router.get('/excel', async (req, res) => {
  const { where, params } = buildFilter(req.query);
  const sql = `${FETCH_SQL} ${where} ORDER BY t.date DESC, t.created_at DESC`;

  db.all(sql, params, async (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Finance Monitor';
    wb.created = new Date();

    const ws = wb.addWorksheet('Transactions');

    // Header style
    const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A237E' } };
    const headerFont = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };

    ws.columns = [
      { header: '#', key: 'id', width: 6 },
      { header: 'Date', key: 'date', width: 13 },
      { header: 'Type', key: 'type', width: 10 },
      { header: 'Title', key: 'title', width: 30 },
      { header: 'Project', key: 'project_name', width: 22 },
      { header: 'Category', key: 'category_name', width: 22 },
      { header: 'Amount (₹)', key: 'amount', width: 14 },
      { header: 'Tax (₹)', key: 'tax_amount', width: 10 },
      { header: 'Discount', key: 'discount', width: 10 },
      { header: 'Net Amount (₹)', key: 'net', width: 14 },
      { header: 'Payment Method', key: 'payment_method', width: 18 },
      { header: 'Party / Vendor', key: 'party_name', width: 24 },
      { header: 'Reference No.', key: 'reference_no', width: 18 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Description', key: 'description', width: 30 },
      { header: 'Notes', key: 'notes', width: 30 },
      { header: 'Attachment', key: 'attachment_name', width: 24 },
      { header: 'Created At', key: 'created_at', width: 20 },
    ];

    // Style header row
    ws.getRow(1).eachCell((cell) => {
      cell.fill = headerFill;
      cell.font = headerFont;
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FF9FA8DA' } } };
    });

    let totalIncome = 0, totalExpense = 0;

    rows.forEach((row, i) => {
      const net = row.amount + (row.tax_amount || 0) - (row.discount || 0);
      const isIncome = row.type === 'income';
      if (isIncome) totalIncome += row.amount; else totalExpense += row.amount;

      const wsRow = ws.addRow({
        ...row,
        type: row.type.charAt(0).toUpperCase() + row.type.slice(1),
        payment_method: (row.payment_method || '').replace(/_/g, ' '),
        net: net.toFixed(2),
        status: row.status.charAt(0).toUpperCase() + row.status.slice(1),
      });

      wsRow.eachCell((cell) => {
        cell.alignment = { vertical: 'middle', wrapText: true };
        cell.border = { bottom: { style: 'hair', color: { argb: 'FFE8EAF6' } } };
      });

      // Color income/expense rows
      const rowFill = isIncome
        ? { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F8E9' } }
        : { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCE4EC' } };
      if (i % 2 === 0) wsRow.eachCell((c) => { c.fill = rowFill; });
    });

    // Summary rows
    ws.addRow([]);
    const sumRow = ws.addRow({ title: 'TOTAL INCOME', amount: totalIncome });
    sumRow.font = { bold: true, color: { argb: 'FF2E7D32' } };
    const expRow = ws.addRow({ title: 'TOTAL EXPENSE', amount: totalExpense });
    expRow.font = { bold: true, color: { argb: 'FFC62828' } };
    const netRow = ws.addRow({ title: 'NET BALANCE', amount: totalIncome - totalExpense });
    netRow.font = { bold: true, size: 12 };

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="finance-report-${Date.now()}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  });
});

// ─── Excel Template ──────────────────────────────────────────────────────────
router.get('/template', async (req, res) => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Import Template');

  ws.columns = [
    { header: 'Type (income/expense)*', key: 'type', width: 22 },
    { header: 'Title*', key: 'title', width: 30 },
    { header: 'Amount*', key: 'amount', width: 12 },
    { header: 'Date* (YYYY-MM-DD)', key: 'date', width: 20 },
    { header: 'Project Name', key: 'project_name', width: 22 },
    { header: 'Category Name', key: 'category_name', width: 22 },
    { header: 'Payment Method', key: 'payment_method', width: 18 },
    { header: 'Party / Vendor Name', key: 'party_name', width: 24 },
    { header: 'Reference No.', key: 'reference_no', width: 18 },
    { header: 'Tax Amount', key: 'tax_amount', width: 12 },
    { header: 'Discount', key: 'discount', width: 10 },
    { header: 'Status (confirmed/pending)', key: 'status', width: 24 },
    { header: 'Description', key: 'description', width: 30 },
    { header: 'Notes', key: 'notes', width: 30 },
  ];

  const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A237E' } };
  ws.getRow(1).eachCell((cell) => {
    cell.fill = headerFill;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { horizontal: 'center' };
  });

  // Sample rows
  ws.addRow({ type: 'income', title: 'Project Revenue Q1', amount: 50000, date: '2026-01-15',
    project_name: 'Website Redesign', category_name: 'Project Revenue',
    payment_method: 'bank_transfer', party_name: 'Client Name',
    reference_no: 'INV-001', tax_amount: 0, discount: 0, status: 'confirmed',
    description: 'First milestone payment', notes: '' });
  ws.addRow({ type: 'expense', title: 'Software License', amount: 2999, date: '2026-01-20',
    project_name: 'Website Redesign', category_name: 'Software / Licenses',
    payment_method: 'upi', party_name: 'Vendor Name',
    reference_no: 'EXP-001', tax_amount: 299, discount: 0, status: 'confirmed',
    description: 'Annual subscription', notes: '' });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="finance-import-template.xlsx"');
  await wb.xlsx.write(res);
  res.end();
});

// ─── PDF Export ──────────────────────────────────────────────────────────────
router.get('/pdf', (req, res) => {
  const { where, params } = buildFilter(req.query);
  const sql = `${FETCH_SQL} ${where} ORDER BY t.date DESC, t.created_at DESC`;

  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 0, autoFirstPage: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="finance-report-${Date.now()}.pdf"`);
    doc.pipe(res);

    // Helvetica (built-in) has no Rs glyph — use "Rs." prefix throughout
    const fmt = (n) => 'Rs. ' + Number(n || 0).toFixed(2);

    // A4 Landscape: 841.89 x 595.28 pt  |  1 inch = 72 pt
    const M     = 72;
    const pageW = doc.page.width;   // 841.89
    const pageH = doc.page.height;  // 595.28
    const contW = pageW - M * 2;    // 697.89

    // ── Totals ────────────────────────────────────────────────
    let totalIncome = 0, totalExpense = 0;
    rows.forEach((r) => { r.type === 'income' ? totalIncome += r.amount : totalExpense += r.amount; });
    const net = totalIncome - totalExpense;

    // ── Full-bleed banner ─────────────────────────────────────
    const BANNER_H = 64;
    doc.rect(0, 0, pageW, BANNER_H).fill('#1e1b4b');

    // Left: title + meta (respects left margin)
    doc.fillColor('#fff').font('Helvetica-Bold').fontSize(16)
       .text('Finance Report', M, 14, { width: contW * 0.52, lineBreak: false });
    doc.fillColor('rgba(255,255,255,0.55)').font('Helvetica').fontSize(8)
       .text(
         `Generated: ${new Date().toLocaleString('en-IN')}   |   Records: ${rows.length}`,
         M, 36, { width: contW * 0.52 }
       );

    // Right: 3 summary totals, right-aligned to right margin
    const BW   = 82;  // each block width
    const netX  = pageW - M - BW;
    const expX  = netX - BW - 6;
    const incX  = expX - BW - 6;
    [
      { label: 'INCOME',  val: fmt(totalIncome),  x: incX, lc: '#a5f3fc', vc: '#6ee7b7' },
      { label: 'EXPENSE', val: fmt(totalExpense), x: expX, lc: '#fca5a5', vc: '#f87171' },
      { label: 'NET',     val: fmt(net),           x: netX, lc: net >= 0 ? '#bfdbfe' : '#fde68a', vc: net >= 0 ? '#93c5fd' : '#fcd34d' },
    ].forEach(({ label, val, x, lc, vc }) => {
      doc.fillColor(lc).font('Helvetica-Bold').fontSize(7).text(label, x, 14, { width: BW, lineBreak: false });
      doc.fillColor(vc).font('Helvetica-Bold').fontSize(11).text(val,   x, 26, { width: BW, lineBreak: false });
    });

    let y = BANNER_H + 12;

    // ── Summary Cards ─────────────────────────────────────────
    const cards = [
      { label: 'Total Income',  value: fmt(totalIncome),  bg: '#dcfce7', fg: '#15803d' },
      { label: 'Total Expense', value: fmt(totalExpense), bg: '#fee2e2', fg: '#b91c1c' },
      { label: 'Net Balance',   value: fmt(net),          bg: net >= 0 ? '#dbeafe' : '#fef3c7', fg: net >= 0 ? '#1d4ed8' : '#b45309' },
      { label: 'Total Records', value: String(rows.length), bg: '#f3e8ff', fg: '#7e22ce' },
    ];
    const cardW = (contW - 12) / 4;
    cards.forEach((card, i) => {
      const cx = M + i * (cardW + 4);
      doc.roundedRect(cx, y, cardW, 44, 4).fill(card.bg);
      doc.fillColor(card.fg).font('Helvetica-Bold').fontSize(7)
         .text(card.label.toUpperCase(), cx + 8, y + 7, { width: cardW - 16, lineBreak: false });
      doc.fillColor(card.fg).font('Helvetica-Bold').fontSize(12)
         .text(card.value, cx + 8, y + 19, { width: cardW - 16, lineBreak: false });
    });

    y += 56;

    // ── Table — columns sum to contW (697) ────────────────────
    const cols = [
      { label: 'Date',         w: 62  },
      { label: 'Type',         w: 44  },
      { label: 'Title',        w: 128 },
      { label: 'Project',      w: 82  },
      { label: 'Category',     w: 82  },
      { label: 'Amount (Rs.)', w: 84  },
      { label: 'Party/Vendor', w: 90  },
      { label: 'Method',       w: 70  },
      { label: 'Status',       w: 55  },
    ]; // 62+44+128+82+82+84+90+70+55 = 697

    const ROW_H = 19;

    const drawHeader = (hy) => {
      doc.rect(M, hy, contW, 22).fill('#1e1b4b');
      let cx = M;
      doc.fillColor('#e0e7ff').font('Helvetica-Bold').fontSize(7.5);
      cols.forEach((col) => {
        doc.text(col.label, cx + 4, hy + 7, { width: col.w - 8, lineBreak: false });
        cx += col.w;
      });
      return hy + 22;
    };

    y = drawHeader(y);

    rows.forEach((row, i) => {
      // New page if row won't fit (1-inch bottom margin)
      if (y + ROW_H > pageH - M) {
        doc.addPage({ size: 'A4', layout: 'landscape', margin: 0 });
        y = M;
        y = drawHeader(y);
      }

      const isIncome = row.type === 'income';
      const rowBg = i % 2 === 0 ? (isIncome ? '#f0fdf4' : '#fff5f5') : '#ffffff';
      doc.rect(M, y, contW, ROW_H).fill(rowBg);
      doc.strokeColor('#e2e8f0').lineWidth(0.3)
         .moveTo(M, y + ROW_H).lineTo(M + contW, y + ROW_H).stroke();

      const amtNet = Number(row.amount || 0) + Number(row.tax_amount || 0) - Number(row.discount || 0);
      const cells = [
        { val: row.date || '-',                                color: '#475569' },
        { val: row.type.toUpperCase(),                         color: isIncome ? '#16a34a' : '#dc2626' },
        { val: row.title || '-',                               color: '#1e293b' },
        { val: row.project_name || '-',                        color: '#475569' },
        { val: row.category_name || '-',                       color: '#475569' },
        { val: fmt(amtNet),                                    color: isIncome ? '#15803d' : '#b91c1c' },
        { val: row.party_name || '-',                          color: '#475569' },
        { val: (row.payment_method || '-').replace(/_/g, ' '), color: '#475569' },
        { val: row.status || '-',                              color: '#475569' },
      ];

      let cx = M;
      doc.font('Helvetica').fontSize(7.5);
      cells.forEach((cell, ci) => {
        doc.fillColor(cell.color)
           .text(String(cell.val || '-'), cx + 4, y + 5, {
             width: cols[ci].w - 8,
             lineBreak: false,
             ellipsis: true,
           });
        cx += cols[ci].w;
      });

      y += ROW_H;
    });

    if (rows.length === 0) {
      doc.fillColor('#94a3b8').font('Helvetica').fontSize(11)
         .text('No transactions found for the selected filters.', M, y + 20, { width: contW, align: 'center' });
    }

    // ── Footer (within bottom margin) ─────────────────────────
    doc.fillColor('#94a3b8').font('Helvetica').fontSize(7)
       .text(
         'Finance Monitor  —  Confidential Report',
         M, pageH - 24, { width: contW, align: 'center' }
       );

    doc.end();
  });
});

module.exports = router;
