const express  = require('express');
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const ExcelJS  = require('exceljs');
const PDFDoc   = require('pdfkit');
const db       = require('../database');

const router = express.Router();

// ── Multer ────────────────────────────────────────────────────
const uploadDir = path.join(__dirname, '../uploads/assets');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename:    (_req, file, cb) => cb(null, `asset_${Date.now()}${path.extname(file.originalname).toLowerCase()}`),
});
const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) =>
    file.mimetype.startsWith('image/') ? cb(null, true) : cb(new Error('Images only')),
});

// ── Filter builder ────────────────────────────────────────────
function buildFilter(q) {
  const conds = [], params = [];
  if (q.category)     { conds.push('category = ?');     params.push(q.category); }
  if (q.condition)    { conds.push('condition = ?');     params.push(q.condition); }
  if (q.resale_chance){ conds.push('resale_chance = ?'); params.push(q.resale_chance); }
  if (q.status)       { conds.push('status = ?');        params.push(q.status); }
  if (q.val_min)      { conds.push('current_value >= ?');params.push(parseFloat(q.val_min)); }
  if (q.val_max)      { conds.push('current_value <= ?');params.push(parseFloat(q.val_max)); }
  if (q.search) {
    conds.push('(name LIKE ? OR project LIKE ? OR location LIKE ? OR asset_tag LIKE ?)');
    const s = `%${q.search}%`;
    params.push(s, s, s, s);
  }
  const where = conds.length ? ' WHERE ' + conds.join(' AND ') : '';
  const sortMap = { name:'name', purchase_value:'purchase_value', current_value:'current_value', purchase_date:'purchase_date', condition:'condition', created_at:'created_at' };
  const sort    = sortMap[q.sort] || 'name';
  const dir     = q.dir === 'desc' ? 'DESC' : 'ASC';
  return { where, params, order: ` ORDER BY ${sort} ${dir}` };
}

// ── GET /summary ──────────────────────────────────────────────
router.get('/summary', (req, res) => {
  db.get(
    `SELECT COUNT(*) as total_count,
            SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) as active_count,
            SUM(purchase_value) as total_purchase_value,
            SUM(current_value)  as total_current_value
     FROM assets`, [],
    (err, totals) => {
      if (err) return res.json({ error: err.message });
      db.all(`SELECT category, COUNT(*) as count, SUM(current_value) as total_value FROM assets GROUP BY category ORDER BY count DESC`, [], (_e2, by_category) => {
        db.all(`SELECT condition, COUNT(*) as count FROM assets GROUP BY condition`, [], (_e3, by_condition) => {
          db.all(`SELECT id, name, category, current_value, condition, photo, created_at FROM assets ORDER BY created_at DESC LIMIT 6`, [], (_e4, recent) => {
            res.json({ totals: totals || {}, by_category: by_category || [], by_condition: by_condition || [], recent: recent || [] });
          });
        });
      });
    }
  );
});

// ── GET /export/excel ─────────────────────────────────────────
router.get('/export/excel', async (req, res) => {
  const { where, params, order } = buildFilter(req.query);
  db.all(`SELECT * FROM assets${where}${order}`, params, async (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Finance Monitor';
    wb.created = new Date();
    const ws = wb.addWorksheet('Assets');

    const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7C2D12' } };
    const HEADER_FONT = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };

    ws.columns = [
      { header: '#',               key: 'id',             width: 6  },
      { header: 'Asset Name',      key: 'name',           width: 28 },
      { header: 'Asset Tag',       key: 'asset_tag',      width: 16 },
      { header: 'Category',        key: 'category',       width: 14 },
      { header: 'Project / Dept',  key: 'project',        width: 22 },
      { header: 'Location',        key: 'location',       width: 22 },
      { header: 'Purchase Date',   key: 'purchase_date',  width: 14 },
      { header: 'Purchase Value',  key: 'purchase_value', width: 16 },
      { header: 'Current Value',   key: 'current_value',  width: 16 },
      { header: 'Depreciation',    key: 'depreciation',   width: 16 },
      { header: 'Condition',       key: 'condition',      width: 12 },
      { header: 'Resale Chance',   key: 'resale_chance',  width: 14 },
      { header: 'Status',          key: 'status',         width: 14 },
      { header: 'Notes',           key: 'notes',          width: 30 },
    ];

    ws.getRow(1).eachCell((cell) => {
      cell.fill = HEADER_FILL; cell.font = HEADER_FONT;
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });

    const cap = (s) => (s || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    let totalPurchase = 0, totalCurrent = 0;

    rows.forEach((row, i) => {
      const depr = (row.current_value || 0) - (row.purchase_value || 0);
      totalPurchase += row.purchase_value || 0;
      totalCurrent  += row.current_value  || 0;
      const wsRow = ws.addRow({
        ...row,
        category:     cap(row.category),
        condition:    cap(row.condition),
        resale_chance:cap(row.resale_chance),
        status:       cap(row.status),
        depreciation: depr.toFixed(2),
      });
      const bg = i % 2 === 0 ? 'FFF8EDDB' : 'FFFEF9F0';
      wsRow.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
        cell.alignment = { vertical: 'middle' };
        cell.border = { bottom: { style: 'hair', color: { argb: 'FFE8D5B7' } } };
      });
    });

    ws.addRow([]);
    const r1 = ws.addRow({ name: 'TOTAL PURCHASE VALUE', purchase_value: totalPurchase.toFixed(2) });
    r1.font = { bold: true, color: { argb: 'FF1D4ED8' } };
    const r2 = ws.addRow({ name: 'TOTAL CURRENT VALUE', current_value: totalCurrent.toFixed(2) });
    r2.font = { bold: true, color: { argb: 'FF059669' } };
    const r3 = ws.addRow({ name: 'TOTAL DEPRECIATION', depreciation: (totalPurchase - totalCurrent).toFixed(2) });
    r3.font = { bold: true, color: { argb: 'FFDC2626' } };

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="assets-${Date.now()}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  });
});

// ── GET /export/pdf ───────────────────────────────────────────
router.get('/export/pdf', (req, res) => {
  const { where, params, order } = buildFilter(req.query);
  db.all(`SELECT * FROM assets${where}${order}`, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    const doc   = new PDFDoc({ size: 'A4', layout: 'landscape', margin: 0, autoFirstPage: true });
    // A4 Landscape: 841.89 x 595.28 pt  |  1 inch = 72 pt
    const M     = 72;
    const pageW = doc.page.width;   // 841.89
    const pageH = doc.page.height;  // 595.28
    const contW = pageW - M * 2;    // 697.89

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="assets-${Date.now()}.pdf"`);
    doc.pipe(res);

    const fmt = (n) => 'Rs. ' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const cap = (s) => (s || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

    let totalPurchase = 0, totalCurrent = 0;
    rows.forEach(r => { totalPurchase += r.purchase_value || 0; totalCurrent += r.current_value || 0; });
    const totalDepr = totalPurchase - totalCurrent;

    // ── Full-bleed banner ─────────────────────────────────────
    const BANNER_H = 68;
    doc.rect(0, 0, pageW, BANNER_H).fill('#451a03');

    // Left: title + meta (respects left margin)
    doc.fillColor('#fff').font('Helvetica-Bold').fontSize(16)
       .text('Asset Management Report', M, 14, { width: contW * 0.50, lineBreak: false });
    doc.fillColor('rgba(255,255,255,0.55)').font('Helvetica').fontSize(8)
       .text(`Generated: ${new Date().toLocaleString('en-IN')}   |   Assets: ${rows.length}`, M, 38, { width: contW * 0.50 });

    // Right: 3 summary values (right-aligned to right margin)
    const BW = 95;
    const rightStart = pageW - M - BW * 3 - 12;
    [
      { label: 'TOTAL PURCHASE', val: fmt(totalPurchase),        fg: '#fed7aa' },
      { label: 'CURRENT VALUE',  val: fmt(totalCurrent),         fg: '#6ee7b7' },
      { label: 'DEPRECIATION',   val: fmt(Math.abs(totalDepr)), fg: totalDepr > 0 ? '#fca5a5' : '#6ee7b7' },
    ].forEach((item, i) => {
      const x = rightStart + i * (BW + 6);
      doc.fillColor(item.fg).font('Helvetica-Bold').fontSize(7).text(item.label, x, 14, { width: BW, lineBreak: false });
      doc.fillColor('#fff').font('Helvetica-Bold').fontSize(10).text(item.val,   x, 26, { width: BW, lineBreak: false });
    });

    let y = BANNER_H + 12;

    // ── Summary cards ─────────────────────────────────────────
    const cardW = (contW - 18) / 4;
    [
      { label: 'Total Assets',   val: String(rows.length),      bg: '#fef3c7', fg: '#92400e' },
      { label: 'Purchase Value', val: fmt(totalPurchase),        bg: '#dbeafe', fg: '#1e40af' },
      { label: 'Current Value',  val: fmt(totalCurrent),         bg: '#d1fae5', fg: '#065f46' },
      { label: 'Depreciation',   val: fmt(Math.abs(totalDepr)), bg: totalDepr > 0 ? '#fee2e2' : '#d1fae5', fg: totalDepr > 0 ? '#991b1b' : '#065f46' },
    ].forEach((card, i) => {
      const cx = M + i * (cardW + 6);
      doc.roundedRect(cx, y, cardW, 44, 4).fill(card.bg);
      doc.fillColor(card.fg).font('Helvetica-Bold').fontSize(7)
         .text(card.label.toUpperCase(), cx + 8, y + 7, { width: cardW - 16, lineBreak: false });
      doc.fillColor(card.fg).font('Helvetica-Bold').fontSize(11)
         .text(card.val, cx + 8, y + 19, { width: cardW - 16, lineBreak: false });
    });

    y += 56;

    // ── Table — columns sum to contW (697) ────────────────────
    const cols = [
      { label: '#',             w: 22  },
      { label: 'Asset Name',    w: 125 },
      { label: 'Tag / Serial',  w: 62  },
      { label: 'Category',      w: 58  },
      { label: 'Project',       w: 72  },
      { label: 'Location',      w: 68  },
      { label: 'Purchase Val.', w: 70  },
      { label: 'Current Val.',  w: 70  },
      { label: 'Condition',     w: 55  },
      { label: 'Resale',        w: 48  },
      { label: 'Status',        w: 47  },
    ]; // 22+125+62+58+72+68+70+70+55+48+47 = 697

    const ROW_H = 18;
    const condColors = { excellent: '#15803d', good: '#16a34a', fair: '#d97706', poor: '#ea580c', damaged: '#dc2626' };
    const rsColors   = { high: '#15803d', medium: '#1d4ed8', low: '#d97706', none: '#64748b' };
    const stColors   = { active: '#059669', under_repair: '#d97706', disposed: '#64748b', sold: '#7c3aed' };

    const drawHeader = (hy) => {
      doc.rect(M, hy, contW, 20).fill('#451a03');
      let cx = M;
      doc.fillColor('#fed7aa').font('Helvetica-Bold').fontSize(7);
      cols.forEach(col => {
        doc.text(col.label, cx + 3, hy + 5, { width: col.w - 6, lineBreak: false });
        cx += col.w;
      });
      return hy + 20;
    };

    y = drawHeader(y);

    rows.forEach((row, i) => {
      // New page if row won't fit (1-inch bottom margin)
      if (y + ROW_H > pageH - M) {
        doc.addPage({ size: 'A4', layout: 'landscape', margin: 0 });
        y = M;
        y = drawHeader(y);
      }

      const bg = i % 2 === 0 ? '#fff7ed' : '#ffffff';
      doc.rect(M, y, contW, ROW_H).fill(bg);
      doc.strokeColor('#e8d5b7').lineWidth(0.3)
         .moveTo(M, y + ROW_H).lineTo(M + contW, y + ROW_H).stroke();

      const cells = [
        { val: String(i + 1),            color: '#94a3b8'                                },
        { val: row.name || '-',          color: '#1e293b',  bold: true                  },
        { val: row.asset_tag || '-',     color: '#64748b'                                },
        { val: cap(row.category) || '-', color: '#475569'                                },
        { val: row.project  || '-',      color: '#475569'                                },
        { val: row.location || '-',      color: '#475569'                                },
        { val: fmt(row.purchase_value),  color: '#1d4ed8'                                },
        { val: fmt(row.current_value),   color: '#059669'                                },
        { val: cap(row.condition),       color: condColors[row.condition]   || '#475569' },
        { val: cap(row.resale_chance),   color: rsColors[row.resale_chance] || '#475569' },
        { val: cap(row.status),          color: stColors[row.status]        || '#475569' },
      ];

      let cx = M;
      cells.forEach((cell, ci) => {
        doc.fillColor(cell.color).font(cell.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(7)
           .text(String(cell.val), cx + 3, y + 4, { width: cols[ci].w - 6, lineBreak: false, ellipsis: true });
        cx += cols[ci].w;
      });

      y += ROW_H;
    });

    if (rows.length === 0) {
      doc.fillColor('#94a3b8').font('Helvetica').fontSize(11)
         .text('No assets found for the selected filters.', M, y + 20, { width: contW, align: 'center' });
    }

    // ── Footer (within bottom margin) ─────────────────────────
    doc.fillColor('#94a3b8').font('Helvetica').fontSize(7)
       .text('Finance Monitor  —  Asset Management Report  —  Confidential', M, pageH - 24, { width: contW, align: 'center' });

    doc.end();
  });
});

// ── GET / (list) ──────────────────────────────────────────────
router.get('/', (req, res) => {
  const { where, params, order } = buildFilter(req.query);
  db.all(`SELECT * FROM assets${where}${order}`, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

// ── POST / (create) ───────────────────────────────────────────
router.post('/', upload.single('photo'), (req, res) => {
  const b = req.body;
  if (!b.name || !String(b.name).trim()) return res.status(400).json({ error: 'Asset name is required.' });
  const photo = req.file ? `assets/${req.file.filename}` : '';
  db.run(
    `INSERT INTO assets (name,asset_tag,category,project,location,purchase_date,purchase_value,current_value,condition,resale_chance,photo,status,notes)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [b.name.trim(), b.asset_tag||'', b.category||'other', b.project||'', b.location||'',
     b.purchase_date||null, parseFloat(b.purchase_value)||0, parseFloat(b.current_value)||0,
     b.condition||'good', b.resale_chance||'medium', photo, b.status||'active', b.notes||''],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      db.get('SELECT * FROM assets WHERE id=?', [this.lastID], (_e, row) => res.json(row));
    }
  );
});

// ── PUT /:id (update) ─────────────────────────────────────────
router.put('/:id', upload.single('photo'), (req, res) => {
  const { id } = req.params;
  const b = req.body;
  db.get('SELECT photo FROM assets WHERE id=?', [id], (err, existing) => {
    if (err || !existing) return res.status(404).json({ error: 'Asset not found' });
    let photo = existing.photo;
    if (req.file) {
      if (photo) { const op = path.join(__dirname, '../uploads', photo); if (fs.existsSync(op)) fs.unlinkSync(op); }
      photo = `assets/${req.file.filename}`;
    }
    if (b.remove_photo === 'true' && photo) {
      const op = path.join(__dirname, '../uploads', photo); if (fs.existsSync(op)) fs.unlinkSync(op);
      photo = '';
    }
    db.run(
      `UPDATE assets SET name=?,asset_tag=?,category=?,project=?,location=?,purchase_date=?,purchase_value=?,current_value=?,condition=?,resale_chance=?,photo=?,status=?,notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,
      [b.name.trim(), b.asset_tag||'', b.category||'other', b.project||'', b.location||'',
       b.purchase_date||null, parseFloat(b.purchase_value)||0, parseFloat(b.current_value)||0,
       b.condition||'good', b.resale_chance||'medium', photo, b.status||'active', b.notes||'', id],
      (err2) => {
        if (err2) return res.status(500).json({ error: err2.message });
        db.get('SELECT * FROM assets WHERE id=?', [id], (_e, row) => res.json(row));
      }
    );
  });
});

// ── DELETE /:id ───────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  db.get('SELECT photo FROM assets WHERE id=?', [req.params.id], (err, row) => {
    if (row && row.photo) { const p = path.join(__dirname,'../uploads',row.photo); if(fs.existsSync(p)) fs.unlinkSync(p); }
    db.run('DELETE FROM assets WHERE id=?', [req.params.id], (e2) => {
      if (e2) return res.status(500).json({ error: e2.message });
      res.json({ success: true });
    });
  });
});

module.exports = router;
