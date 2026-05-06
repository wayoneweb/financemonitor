const express = require('express');
const router = express.Router();
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const db = require('../database');

function buildFilter(query) {
  const conditions = [];
  const params = [];
  if (query.type) { conditions.push("t.type = ?"); params.push(query.type); }
  if (query.project_id) { conditions.push("t.project_id = ?"); params.push(query.project_id); }
  if (query.category_id) { conditions.push("t.category_id = ?"); params.push(query.category_id); }
  if (query.status) { conditions.push("t.status = ?"); params.push(query.status); }
  if (query.date_from) { conditions.push("t.date >= ?"); params.push(query.date_from); }
  if (query.date_to) { conditions.push("t.date <= ?"); params.push(query.date_to); }
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

    const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="finance-report-${Date.now()}.pdf"`);
    doc.pipe(res);

    // Title
    doc.fontSize(20).fillColor('#1A237E').text('Project Finance Report', { align: 'center' });
    doc.fontSize(10).fillColor('#666').text(`Generated: ${new Date().toLocaleString()}`, { align: 'center' });
    doc.moveDown(0.5);

    // Summary
    let totalIncome = 0, totalExpense = 0;
    rows.forEach((r) => { r.type === 'income' ? totalIncome += r.amount : totalExpense += r.amount; });
    const net = totalIncome - totalExpense;

    doc.fontSize(11).fillColor('#000');
    const summaryY = doc.y;
    doc.roundedRect(40, summaryY, 230, 60, 5).fillAndStroke('#E8F5E9', '#4CAF50');
    doc.fillColor('#2E7D32').text(`Total Income: ₹${totalIncome.toFixed(2)}`, 50, summaryY + 10);
    doc.roundedRect(290, summaryY, 230, 60, 5).fillAndStroke('#FFEBEE', '#F44336');
    doc.fillColor('#C62828').text(`Total Expense: ₹${totalExpense.toFixed(2)}`, 300, summaryY + 10);
    doc.roundedRect(540, summaryY, 230, 60, 5).fillAndStroke(net >= 0 ? '#E3F2FD' : '#FFF3E0', net >= 0 ? '#1976D2' : '#E65100');
    doc.fillColor(net >= 0 ? '#0D47A1' : '#E65100').text(`Net Balance: ₹${net.toFixed(2)}`, 550, summaryY + 10);
    doc.fillColor('#555').text(`Total Records: ${rows.length}`, 550, summaryY + 30);

    doc.moveDown(4);

    // Table header
    const cols = [
      { label: 'Date', width: 70 },
      { label: 'Type', width: 55 },
      { label: 'Title', width: 130 },
      { label: 'Project', width: 100 },
      { label: 'Category', width: 100 },
      { label: 'Amount', width: 70 },
      { label: 'Party/Vendor', width: 110 },
      { label: 'Status', width: 60 },
    ];

    const tableLeft = 40;
    let y = doc.y;

    // Draw header
    doc.rect(tableLeft, y, cols.reduce((s, c) => s + c.width, 0), 20).fill('#1A237E');
    let x = tableLeft;
    doc.fontSize(8).fillColor('#fff');
    cols.forEach((col) => {
      doc.text(col.label, x + 3, y + 5, { width: col.width - 6, ellipsis: true });
      x += col.width;
    });
    y += 20;

    // Draw rows
    rows.forEach((row, i) => {
      if (y > doc.page.height - 80) {
        doc.addPage({ layout: 'landscape' });
        y = 40;
      }
      const isIncome = row.type === 'income';
      const bgColor = i % 2 === 0 ? (isIncome ? '#F1F8E9' : '#FFF3E0') : '#fff';
      doc.rect(tableLeft, y, cols.reduce((s, c) => s + c.width, 0), 18).fill(bgColor);

      x = tableLeft;
      doc.fontSize(7).fillColor(isIncome ? '#2E7D32' : '#C62828');
      const cells = [
        row.date, row.type.toUpperCase(), row.title, row.project_name || '-',
        row.category_name || '-', '₹' + row.amount.toFixed(2), row.party_name || '-', row.status
      ];
      cells.forEach((val, ci) => {
        doc.fillColor(ci <= 0 ? '#555' : ci === 1 ? (isIncome ? '#2E7D32' : '#C62828') : '#333');
        doc.text(String(val || '-'), x + 3, y + 4, { width: cols[ci].width - 6, ellipsis: true });
        x += cols[ci].width;
      });

      // Row border
      doc.moveTo(tableLeft, y + 18).lineTo(tableLeft + cols.reduce((s, c) => s + c.width, 0), y + 18)
        .strokeColor('#E8EAF6').lineWidth(0.5).stroke();
      y += 18;
    });

    doc.end();
  });
});

module.exports = router;
