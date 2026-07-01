const express = require('express');
const router  = express.Router();
const db      = require('../database');

const advanceDate = (dateStr, freq) => {
  if (!dateStr || freq === 'one_time') return null;
  const d = new Date(dateStr + 'T12:00:00');
  if (freq === 'monthly')   d.setMonth(d.getMonth() + 1);
  if (freq === 'quarterly') d.setMonth(d.getMonth() + 3);
  if (freq === 'yearly')    d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
};

// GET /api/investments
router.get('/', (req, res) => {
  db.all(
    `SELECT * FROM investments
     ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'matured' THEN 1 ELSE 2 END,
              maturity_date ASC`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Server error' });
      res.json(rows);
    }
  );
});

// GET /api/investments/reminders  ← must be before /:id
router.get('/reminders', (req, res) => {
  const today  = new Date().toISOString().slice(0, 10);
  const soon7  = new Date(Date.now() +  7 * 86400000).toISOString().slice(0, 10);
  const soon30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

  db.get(
    `SELECT COUNT(*) AS cnt FROM investments
     WHERE status='active' AND payment_frequency!='one_time'
       AND next_payment_date IS NOT NULL AND next_payment_date <= ?`,
    [soon7],
    (e1, due) => {
      db.get(
        `SELECT COUNT(*) AS cnt FROM investments
         WHERE status='active' AND maturity_date IS NOT NULL
           AND maturity_date >= ? AND maturity_date <= ?`,
        [today, soon30],
        (e2, mat) => res.json({ due_soon: due?.cnt || 0, maturing_soon: mat?.cnt || 0 })
      );
    }
  );
});

// POST /api/investments
router.post('/', (req, res) => {
  const {
    title, investment_type, institution, principal_amount,
    expected_return_rate, start_date, maturity_date, maturity_amount,
    current_value, payment_frequency, payment_amount, next_payment_date, notes,
  } = req.body;
  if (!title) return res.status(400).json({ error: 'Title is required' });

  const pa = parseFloat(principal_amount) || 0;

  db.run(
    `INSERT INTO investments
       (title,investment_type,institution,principal_amount,expected_return_rate,
        start_date,maturity_date,maturity_amount,current_value,payment_frequency,
        payment_amount,next_payment_date,total_invested,notes)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [title.trim(), investment_type || 'other', institution || '',
     pa, parseFloat(expected_return_rate) || 0,
     start_date || null, maturity_date || null,
     parseFloat(maturity_amount) || 0,
     parseFloat(current_value) || pa,
     payment_frequency || 'one_time',
     parseFloat(payment_amount) || 0,
     next_payment_date || null, pa, notes || ''],
    function (err) {
      if (err) return res.status(500).json({ error: 'Server error' });
      db.get('SELECT * FROM investments WHERE id=?', [this.lastID], (e, row) => res.status(201).json(row));
    }
  );
});

// PUT /api/investments/:id
router.put('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const allowed = ['title','investment_type','institution','principal_amount','expected_return_rate',
    'start_date','maturity_date','maturity_amount','current_value','payment_frequency',
    'payment_amount','next_payment_date','total_invested','status','notes'];
  const sets = []; const vals = [];
  allowed.forEach(f => { if (req.body[f] !== undefined) { sets.push(`${f}=?`); vals.push(req.body[f]); } });
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });
  sets.push('updated_at=CURRENT_TIMESTAMP'); vals.push(id);
  db.run(`UPDATE investments SET ${sets.join(',')} WHERE id=?`, vals, function (err) {
    if (err) return res.status(500).json({ error: 'Server error' });
    if (!this.changes) return res.status(404).json({ error: 'Not found' });
    db.get('SELECT * FROM investments WHERE id=?', [id], (e, row) => res.json(row));
  });
});

// DELETE /api/investments/:id
router.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  db.run('DELETE FROM investments WHERE id=?', [id], function (err) {
    if (err) return res.status(500).json({ error: 'Server error' });
    if (!this.changes) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  });
});

// GET /api/investments/:id/payments
router.get('/:id/payments', (req, res) => {
  db.all(
    'SELECT * FROM investment_payments WHERE investment_id=? ORDER BY payment_date DESC, id DESC',
    [parseInt(req.params.id, 10)],
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Server error' });
      res.json(rows);
    }
  );
});

// POST /api/investments/:id/payments
router.post('/:id/payments', (req, res) => {
  const invId = parseInt(req.params.id, 10);
  const { payment_date, amount, payment_method, notes } = req.body;
  if (!payment_date || !amount)
    return res.status(400).json({ error: 'Payment date and amount are required' });

  db.get('SELECT * FROM investments WHERE id=?', [invId], (err, inv) => {
    if (err || !inv) return res.status(404).json({ error: 'Investment not found' });

    db.run(
      'INSERT INTO investment_payments (investment_id,payment_date,amount,payment_method,notes) VALUES (?,?,?,?,?)',
      [invId, payment_date, parseFloat(amount), payment_method || 'bank_transfer', notes || ''],
      function (pErr) {
        if (pErr) return res.status(500).json({ error: 'Server error' });

        const newTotal   = (inv.total_invested || 0) + parseFloat(amount);
        const newNextDt  = advanceDate(inv.next_payment_date, inv.payment_frequency);

        db.run(
          `UPDATE investments SET total_invested=?,next_payment_date=?,
           updated_at=CURRENT_TIMESTAMP WHERE id=?`,
          [newTotal, newNextDt, invId],
          (uErr) => {
            if (uErr) return res.status(500).json({ error: 'Server error' });
            db.get('SELECT * FROM investments WHERE id=?', [invId],
              (e, updated) => res.json({ investment: updated, payment_id: this.lastID })
            );
          }
        );
      }
    );
  });
});

module.exports = router;
