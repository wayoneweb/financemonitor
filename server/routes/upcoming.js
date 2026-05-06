const express = require('express');
const router = express.Router();
const db = require('../database');

// Auto-mark overdue before any read
function markOverdue(cb) {
  db.run(
    `UPDATE upcoming SET status='overdue'
     WHERE status='pending' AND due_date < date('now')`,
    cb
  );
}

// GET / — list all upcoming
router.get('/', (req, res) => {
  const { type, project_id, status, range } = req.query;
  let where = [];
  let params = [];

  if (type)       { where.push("u.type = ?");       params.push(type); }
  if (project_id) { where.push("u.project_id = ?"); params.push(project_id); }
  if (status)     { where.push("u.status = ?");     params.push(status); }
  if (range === '7')  { where.push("u.due_date <= date('now','+7 days')");  }
  if (range === '30') { where.push("u.due_date <= date('now','+30 days')"); }

  const sql = `
    SELECT u.*, p.name as project_name, c.name as category_name, c.color as category_color
    FROM upcoming u
    LEFT JOIN projects p ON p.id = u.project_id
    LEFT JOIN categories c ON c.id = u.category_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY u.due_date ASC, u.created_at DESC`;

  markOverdue(() => {
    db.all(sql, params, (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    });
  });
});

// GET /summary — counts and totals for dashboard
router.get('/summary', (req, res) => {
  markOverdue(() => {
    const queries = {
      overdue: `SELECT COUNT(*) as count, COALESCE(SUM(amount),0) as amount
                FROM upcoming WHERE status='overdue'`,
      week_income: `SELECT COALESCE(SUM(amount),0) as amount FROM upcoming
                    WHERE status='pending' AND type='income'
                    AND due_date BETWEEN date('now') AND date('now','+7 days')`,
      week_expense: `SELECT COALESCE(SUM(amount),0) as amount FROM upcoming
                     WHERE status='pending' AND type='expense'
                     AND due_date BETWEEN date('now') AND date('now','+7 days')`,
      month_income: `SELECT COALESCE(SUM(amount),0) as amount FROM upcoming
                     WHERE status='pending' AND type='income'
                     AND due_date BETWEEN date('now') AND date('now','+30 days')`,
      month_expense: `SELECT COALESCE(SUM(amount),0) as amount FROM upcoming
                      WHERE status='pending' AND type='expense'
                      AND due_date BETWEEN date('now') AND date('now','+30 days')`,
      today: `SELECT u.*, p.name as project_name FROM upcoming u
              LEFT JOIN projects p ON p.id = u.project_id
              WHERE u.due_date = date('now') AND u.status != 'paid'
              ORDER BY u.type`,
      upcoming7: `SELECT u.*, p.name as project_name FROM upcoming u
                  LEFT JOIN projects p ON p.id = u.project_id
                  WHERE u.status IN ('pending','overdue')
                  AND u.due_date <= date('now','+7 days')
                  ORDER BY u.due_date ASC LIMIT 10`,
    };

    const result = {};
    const keys = Object.keys(queries);
    let done = 0;
    const check = () => { if (++done === keys.length) res.json(result); };

    keys.forEach((key) => {
      const single = ['overdue','week_income','week_expense','month_income','month_expense'].includes(key);
      db[single ? 'get' : 'all'](queries[key], [], (err, rows) => {
        result[key] = err ? (single ? null : []) : rows;
        check();
      });
    });
  });
});

// POST / — create
router.post('/', (req, res) => {
  const { title, amount, type, project_id, category_id, due_date, recurrence, notes } = req.body;
  if (!title || !amount || !type || !due_date)
    return res.status(400).json({ error: 'title, amount, type, due_date required' });

  db.run(
    `INSERT INTO upcoming (title,amount,type,project_id,category_id,due_date,recurrence,notes)
     VALUES (?,?,?,?,?,?,?,?)`,
    [title, amount, type, project_id || null, category_id || null, due_date, recurrence || 'none', notes || ''],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      db.get('SELECT u.*, p.name as project_name, c.name as category_name FROM upcoming u LEFT JOIN projects p ON p.id=u.project_id LEFT JOIN categories c ON c.id=u.category_id WHERE u.id=?', [this.lastID], (e, row) => {
        res.status(201).json(row);
      });
    }
  );
});

// PUT /:id — update
router.put('/:id', (req, res) => {
  const { title, amount, type, project_id, category_id, due_date, recurrence, notes, status } = req.body;
  db.run(
    `UPDATE upcoming SET title=?,amount=?,type=?,project_id=?,category_id=?,due_date=?,recurrence=?,notes=?,status=?
     WHERE id=?`,
    [title, amount, type, project_id || null, category_id || null, due_date, recurrence || 'none', notes || '', status || 'pending', req.params.id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      if (!this.changes) return res.status(404).json({ error: 'Not found' });
      res.json({ success: true });
    }
  );
});

// PATCH /:id/pay — mark as paid (optionally creates a real transaction)
router.patch('/:id/pay', (req, res) => {
  db.get('SELECT * FROM upcoming WHERE id=?', [req.params.id], (err, row) => {
    if (err || !row) return res.status(404).json({ error: 'Not found' });

    db.run('UPDATE upcoming SET status=? WHERE id=?', ['paid', req.params.id], (e) => {
      if (e) return res.status(500).json({ error: e.message });

      // Create actual transaction
      db.run(
        `INSERT INTO transactions (project_id,category_id,type,title,amount,date,notes,status)
         VALUES (?,?,?,?,?,date('now'),?,?)`,
        [row.project_id, row.category_id, row.type, row.title, row.amount,
         row.notes || '', 'confirmed'],
        (te) => res.json({ success: true, txn_created: !te })
      );
    });
  });
});

// DELETE /:id
router.delete('/:id', (req, res) => {
  db.run('DELETE FROM upcoming WHERE id=?', [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    if (!this.changes) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  });
});

module.exports = router;
