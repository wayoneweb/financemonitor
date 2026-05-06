const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../database');

const UPLOAD_DIR = path.join(__dirname, '../uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e6);
    cb(null, unique + path.extname(file.originalname));
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|pdf|doc|docx|xls|xlsx/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype);
    if (ext || mime) cb(null, true);
    else cb(new Error('Only images, PDF, and Office documents are allowed'));
  },
});

const BASE_SQL = `
  SELECT t.*,
    p.name as project_name, p.currency as project_currency,
    c.name as category_name, c.color as category_color
  FROM transactions t
  LEFT JOIN projects p ON p.id = t.project_id
  LEFT JOIN categories c ON c.id = t.category_id
`;

function buildFilter(query) {
  const conditions = [];
  const params = [];
  if (query.type) { conditions.push("t.type = ?"); params.push(query.type); }
  if (query.project_id) { conditions.push("t.project_id = ?"); params.push(query.project_id); }
  if (query.category_id) { conditions.push("t.category_id = ?"); params.push(query.category_id); }
  if (query.status) { conditions.push("t.status = ?"); params.push(query.status); }
  if (query.payment_method) { conditions.push("t.payment_method = ?"); params.push(query.payment_method); }
  if (query.date_from) { conditions.push("t.date >= ?"); params.push(query.date_from); }
  if (query.date_to) { conditions.push("t.date <= ?"); params.push(query.date_to); }
  if (query.search) {
    conditions.push("(t.title LIKE ? OR t.party_name LIKE ? OR t.reference_no LIKE ? OR t.description LIKE ?)");
    const s = `%${query.search}%`;
    params.push(s, s, s, s);
  }
  return { where: conditions.length ? ' WHERE ' + conditions.join(' AND ') : '', params };
}

router.get('/', (req, res) => {
  const { where, params } = buildFilter(req.query);
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, parseInt(req.query.limit) || 20);
  const offset = (page - 1) * limit;

  db.get(`SELECT COUNT(*) as total FROM transactions t ${where}`, params, (err, countRow) => {
    if (err) return res.status(500).json({ error: err.message });
    const sql = `${BASE_SQL} ${where} ORDER BY t.date DESC, t.created_at DESC LIMIT ? OFFSET ?`;
    db.all(sql, [...params, limit, offset], (err2, rows) => {
      if (err2) return res.status(500).json({ error: err2.message });
      res.json({ data: rows, total: countRow.total, page, limit, pages: Math.ceil(countRow.total / limit) });
    });
  });
});

router.get('/summary', (req, res) => {
  const { where, params } = buildFilter(req.query);
  const sql = `
    SELECT
      COALESCE(SUM(CASE WHEN t.type='income' THEN t.amount ELSE 0 END),0) as total_income,
      COALESCE(SUM(CASE WHEN t.type='expense' THEN t.amount ELSE 0 END),0) as total_expense,
      COUNT(*) as count
    FROM transactions t ${where}
  `;
  db.get(sql, params, (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ ...row, net: row.total_income - row.total_expense });
  });
});

router.get('/:id', (req, res) => {
  db.get(`${BASE_SQL} WHERE t.id = ?`, [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Transaction not found' });
    res.json(row);
  });
});

router.post('/', upload.single('attachment'), (req, res) => {
  const {
    project_id, category_id, type, title, description, amount, currency,
    date, reference_no, payment_method, party_name, tax_amount, discount, notes, status
  } = req.body;

  if (!type || !title || !amount || !date)
    return res.status(400).json({ error: 'type, title, amount, date are required' });

  const attachment_path = req.file ? req.file.filename : '';
  const attachment_name = req.file ? req.file.originalname : '';
  const attachment_type = req.file ? req.file.mimetype : '';

  const sql = `INSERT INTO transactions
    (project_id, category_id, type, title, description, amount, currency, date,
     reference_no, payment_method, party_name, tax_amount, discount, notes,
     attachment_path, attachment_name, attachment_type, status)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;
  const vals = [
    project_id||null, category_id||null, type, title.trim(), description||'',
    parseFloat(amount), currency||'USD', date, reference_no||'',
    payment_method||'cash', party_name||'', parseFloat(tax_amount)||0,
    parseFloat(discount)||0, notes||'', attachment_path, attachment_name,
    attachment_type, status||'confirmed'
  ];

  db.run(sql, vals, function(err) {
    if (err) return res.status(500).json({ error: err.message });
    db.get(`${BASE_SQL} WHERE t.id = ?`, [this.lastID], (e, row) => res.status(201).json(row));
  });
});

router.put('/:id', upload.single('attachment'), (req, res) => {
  db.get(`${BASE_SQL} WHERE t.id = ?`, [req.params.id], (err, existing) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!existing) return res.status(404).json({ error: 'Transaction not found' });

    const {
      project_id, category_id, type, title, description, amount, currency,
      date, reference_no, payment_method, party_name, tax_amount, discount, notes, status
    } = req.body;

    let attachment_path = existing.attachment_path;
    let attachment_name = existing.attachment_name;
    let attachment_type = existing.attachment_type;

    if (req.file) {
      // Delete old file if replacing
      if (existing.attachment_path) {
        const oldFile = path.join(UPLOAD_DIR, existing.attachment_path);
        if (fs.existsSync(oldFile)) fs.unlinkSync(oldFile);
      }
      attachment_path = req.file.filename;
      attachment_name = req.file.originalname;
      attachment_type = req.file.mimetype;
    }

    const sql = `UPDATE transactions SET
      project_id=?, category_id=?, type=?, title=?, description=?, amount=?, currency=?,
      date=?, reference_no=?, payment_method=?, party_name=?, tax_amount=?, discount=?,
      notes=?, attachment_path=?, attachment_name=?, attachment_type=?, status=?,
      updated_at=CURRENT_TIMESTAMP WHERE id=?`;
    const vals = [
      project_id!==undefined?project_id:existing.project_id,
      category_id!==undefined?category_id:existing.category_id,
      type||existing.type, title?title.trim():existing.title,
      description!==undefined?description:existing.description,
      amount!==undefined?parseFloat(amount):existing.amount,
      currency||existing.currency, date||existing.date,
      reference_no!==undefined?reference_no:existing.reference_no,
      payment_method||existing.payment_method,
      party_name!==undefined?party_name:existing.party_name,
      tax_amount!==undefined?parseFloat(tax_amount):existing.tax_amount,
      discount!==undefined?parseFloat(discount):existing.discount,
      notes!==undefined?notes:existing.notes,
      attachment_path, attachment_name, attachment_type,
      status||existing.status, req.params.id
    ];

    db.run(sql, vals, function(err2) {
      if (err2) return res.status(500).json({ error: err2.message });
      db.get(`${BASE_SQL} WHERE t.id = ?`, [req.params.id], (e, row) => res.json(row));
    });
  });
});

router.delete('/:id', (req, res) => {
  db.get('SELECT attachment_path FROM transactions WHERE id = ?', [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Not found' });
    db.run('DELETE FROM transactions WHERE id = ?', [req.params.id], function(err2) {
      if (err2) return res.status(500).json({ error: err2.message });
      if (row.attachment_path) {
        const f = path.join(UPLOAD_DIR, row.attachment_path);
        if (fs.existsSync(f)) fs.unlinkSync(f);
      }
      res.json({ message: 'Deleted', id: Number(req.params.id) });
    });
  });
});

// Remove attachment only
router.delete('/:id/attachment', (req, res) => {
  db.get('SELECT attachment_path FROM transactions WHERE id = ?', [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Not found' });
    if (row.attachment_path) {
      const f = path.join(UPLOAD_DIR, row.attachment_path);
      if (fs.existsSync(f)) fs.unlinkSync(f);
    }
    db.run("UPDATE transactions SET attachment_path='', attachment_name='', attachment_type='' WHERE id=?",
      [req.params.id], () => res.json({ message: 'Attachment removed' }));
  });
});

module.exports = router;
