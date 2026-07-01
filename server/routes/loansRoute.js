const express = require('express');
const router  = express.Router();
const db      = require('../database');

const addMonths = (dateStr, n) => {
  if (!dateStr) return null;
  const d = new Date(dateStr + 'T12:00:00');
  d.setMonth(d.getMonth() + n);
  return d.toISOString().slice(0, 10);
};

// GET /api/loans
router.get('/', (req, res) => {
  db.all(
    `SELECT * FROM loans
     ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END,
              next_due_date ASC`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Server error' });
      res.json(rows);
    }
  );
});

// GET /api/loans/reminders  ← must be before /:id
router.get('/reminders', (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const soon  = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  db.get(
    "SELECT COUNT(*) AS cnt FROM loans WHERE status='active' AND next_due_date < ?",
    [today],
    (e1, ov) => {
      db.get(
        "SELECT COUNT(*) AS cnt FROM loans WHERE status='active' AND next_due_date >= ? AND next_due_date <= ?",
        [today, soon],
        (e2, ds) => res.json({ overdue: ov?.cnt || 0, due_soon: ds?.cnt || 0 })
      );
    }
  );
});

// POST /api/loans
router.post('/', (req, res) => {
  const {
    title, lender, loan_type, principal_amount, interest_rate,
    tenure_months, emi_amount, start_date, next_due_date,
    outstanding_balance, account_no, notes,
  } = req.body;
  if (!title || !principal_amount)
    return res.status(400).json({ error: 'Title and principal amount are required' });

  const balance = outstanding_balance != null ? parseFloat(outstanding_balance) : parseFloat(principal_amount);

  db.run(
    `INSERT INTO loans
       (title,lender,loan_type,principal_amount,interest_rate,tenure_months,
        emi_amount,start_date,next_due_date,outstanding_balance,account_no,notes)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [title.trim(), lender || '', loan_type || 'personal',
     parseFloat(principal_amount), parseFloat(interest_rate) || 0, parseInt(tenure_months) || 0,
     parseFloat(emi_amount) || 0, start_date || null, next_due_date || null,
     balance, account_no || '', notes || ''],
    function (err) {
      if (err) return res.status(500).json({ error: 'Server error' });
      db.get('SELECT * FROM loans WHERE id=?', [this.lastID], (e, row) => res.status(201).json(row));
    }
  );
});

// PUT /api/loans/:id
router.put('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const allowed = ['title','lender','loan_type','principal_amount','interest_rate','tenure_months',
    'emi_amount','start_date','next_due_date','outstanding_balance','total_paid','account_no','status','notes'];
  const sets = []; const vals = [];
  allowed.forEach(f => { if (req.body[f] !== undefined) { sets.push(`${f}=?`); vals.push(req.body[f]); } });
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });
  sets.push('updated_at=CURRENT_TIMESTAMP'); vals.push(id);
  db.run(`UPDATE loans SET ${sets.join(',')} WHERE id=?`, vals, function (err) {
    if (err) return res.status(500).json({ error: 'Server error' });
    if (!this.changes) return res.status(404).json({ error: 'Not found' });
    db.get('SELECT * FROM loans WHERE id=?', [id], (e, row) => res.json(row));
  });
});

// DELETE /api/loans/:id
router.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  db.run('DELETE FROM loans WHERE id=?', [id], function (err) {
    if (err) return res.status(500).json({ error: 'Server error' });
    if (!this.changes) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  });
});

// GET /api/loans/:id/payments
router.get('/:id/payments', (req, res) => {
  db.all(
    'SELECT * FROM loan_payments WHERE loan_id=? ORDER BY payment_date DESC, id DESC',
    [parseInt(req.params.id, 10)],
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Server error' });
      res.json(rows);
    }
  );
});

// POST /api/loans/:id/payments
router.post('/:id/payments', (req, res) => {
  const loanId = parseInt(req.params.id, 10);
  const { payment_date, amount, payment_method, receipt_no, notes } = req.body;
  if (!payment_date || !amount)
    return res.status(400).json({ error: 'Payment date and amount are required' });

  db.get('SELECT * FROM loans WHERE id=?', [loanId], (err, loan) => {
    if (err || !loan) return res.status(404).json({ error: 'Loan not found' });

    db.run(
      `INSERT INTO loan_payments (loan_id,payment_date,amount,payment_method,receipt_no,notes)
       VALUES (?,?,?,?,?,?)`,
      [loanId, payment_date, parseFloat(amount),
       payment_method || 'bank_transfer', receipt_no || '', notes || ''],
      function (pErr) {
        if (pErr) return res.status(500).json({ error: 'Server error' });

        // Amortised principal reduction
        const monthlyRate = (parseFloat(loan.interest_rate) || 0) / 12 / 100;
        const interest    = monthlyRate > 0 ? (loan.outstanding_balance || 0) * monthlyRate : 0;
        const principal   = Math.max(0, parseFloat(amount) - interest);
        const newBalance  = Math.max(0, (loan.outstanding_balance || 0) - principal);
        const newPaid     = (loan.total_paid || 0) + parseFloat(amount);
        const newDue      = addMonths(loan.next_due_date, 1);
        const newStatus   = newBalance < 1 ? 'closed' : 'active';

        db.run(
          `UPDATE loans SET outstanding_balance=?,total_paid=?,next_due_date=?,
           status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,
          [newBalance, newPaid, newDue, newStatus, loanId],
          (uErr) => {
            if (uErr) return res.status(500).json({ error: 'Server error' });
            db.get('SELECT * FROM loans WHERE id=?', [loanId],
              (e, updated) => res.json({ loan: updated, payment_id: this.lastID })
            );
          }
        );
      }
    );
  });
});

module.exports = router;
