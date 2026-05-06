const express = require('express');
const router = express.Router();
const multer = require('multer');
const ExcelJS = require('exceljs');
const db = require('../database');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function normalize(val) {
  if (val === null || val === undefined) return '';
  if (typeof val === 'object' && val.text !== undefined) return val.text;
  return String(val).trim();
}

function resolveProject(name) {
  return new Promise((resolve) => {
    if (!name) return resolve(null);
    db.get('SELECT id FROM projects WHERE name = ? COLLATE NOCASE', [name], (err, row) => {
      if (row) return resolve(row.id);
      // auto-create project
      db.run('INSERT INTO projects (name) VALUES (?)', [name], function(err2) {
        resolve(err2 ? null : this.lastID);
      });
    });
  });
}

function resolveCategory(name, type) {
  return new Promise((resolve) => {
    if (!name) return resolve(null);
    db.get('SELECT id FROM categories WHERE name = ? AND type = ? COLLATE NOCASE', [name, type], (err, row) => {
      if (row) return resolve(row.id);
      db.run('INSERT INTO categories (name, type, color) VALUES (?, ?, ?)',
        [name, type, type === 'income' ? '#27ae60' : '#e74c3c'],
        function(err2) { resolve(err2 ? null : this.lastID); });
    });
  });
}

router.post('/excel', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  try {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(req.file.buffer);
    const ws = wb.getWorksheet(1);

    const headers = [];
    ws.getRow(1).eachCell({ includeEmpty: true }, (cell) => {
      headers.push(normalize(cell.value).toLowerCase().replace(/[^a-z0-9]/g, '_'));
    });

    const rows = [];
    ws.eachRow({ includeEmpty: false }, (row, rowNum) => {
      if (rowNum === 1) return;
      const obj = {};
      row.eachCell({ includeEmpty: true }, (cell, colNum) => {
        obj[headers[colNum - 1]] = normalize(cell.value);
      });
      rows.push(obj);
    });

    // Validate required fields
    const errors = [];
    const valid = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const rowNum = i + 2;
      const type = normalize(r['type__income_expense_'] || r['type'] || '').toLowerCase();
      const title = normalize(r['title_'] || r['title'] || '');
      const amountRaw = normalize(r['amount_'] || r['amount'] || '');
      const date = normalize(r['date__yyyy_mm_dd_'] || r['date'] || '');
      const amount = parseFloat(amountRaw);

      if (!['income', 'expense'].includes(type)) {
        errors.push({ row: rowNum, error: `Invalid type: "${type}" (must be income or expense)` }); continue;
      }
      if (!title) { errors.push({ row: rowNum, error: 'Title is required' }); continue; }
      if (isNaN(amount) || amount <= 0) { errors.push({ row: rowNum, error: 'Invalid amount' }); continue; }
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) { errors.push({ row: rowNum, error: 'Invalid date format (YYYY-MM-DD required)' }); continue; }

      valid.push({
        type, title, amount, date,
        project_name: normalize(r['project_name'] || ''),
        category_name: normalize(r['category_name'] || ''),
        currency: 'INR',
        payment_method: normalize(r['payment_method'] || '') || 'cash',
        party_name: normalize(r['party___vendor_name'] || r['party_name'] || ''),
        reference_no: normalize(r['reference_no_'] || r['reference_no'] || ''),
        tax_amount: parseFloat(normalize(r['tax_amount'] || '')) || 0,
        discount: parseFloat(normalize(r['discount'] || '')) || 0,
        status: normalize(r['status__confirmed_pending_'] || r['status'] || '') || 'confirmed',
        description: normalize(r['description'] || ''),
        notes: normalize(r['notes'] || ''),
      });
    }

    // Preview mode — return parsed data without inserting
    if (req.query.preview === 'true') {
      return res.json({ valid, errors, total: rows.length });
    }

    // Insert mode
    let inserted = 0;
    for (const r of valid) {
      const project_id = await resolveProject(r.project_name);
      const category_id = await resolveCategory(r.category_name, r.type);
      await new Promise((resolve, reject) => {
        db.run(
          `INSERT INTO transactions (project_id, category_id, type, title, description, amount, currency,
            date, reference_no, payment_method, party_name, tax_amount, discount, notes, status)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [project_id, category_id, r.type, r.title, r.description, r.amount, r.currency,
           r.date, r.reference_no, r.payment_method, r.party_name, r.tax_amount, r.discount,
           r.notes, r.status],
          function(err) { if (err) reject(err); else { inserted++; resolve(); } }
        );
      });
    }

    res.json({ message: `Imported ${inserted} transactions`, inserted, errors, total: rows.length });
  } catch (e) {
    console.error('Import error:', e);
    res.status(500).json({ error: 'Failed to parse Excel file: ' + e.message });
  }
});

module.exports = router;
