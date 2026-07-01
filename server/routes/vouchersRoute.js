const express = require('express');
const db      = require('../database');
const router  = express.Router();

const PREFIX = {
  payment: 'PAY', receipt: 'REC', journal: 'JRN', contra: 'CTR',
  sales: 'SAL', purchase: 'PUR', debit_note: 'DRN', credit_note: 'CRN',
};

function nextVoucherNumber(companyId, type, cb) {
  db.get(
    `SELECT COUNT(*) as cnt FROM vouchers WHERE company_id=? AND voucher_type=?`,
    [companyId, type],
    (err, row) => {
      if (err) return cb(err);
      const seq = (row.cnt || 0) + 1;
      cb(null, `${PREFIX[type] || 'VCH'}-${String(seq).padStart(4, '0')}`);
    }
  );
}

router.get('/next-number', (req, res) => {
  const { company_id, type } = req.query;
  if (!company_id || !type || !PREFIX[type])
    return res.status(400).json({ error: 'Valid company_id and type are required.' });
  nextVoucherNumber(company_id, type, (err, voucher_no) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ voucher_no });
  });
});

// ── List / Day Book ────────────────────────────────────────────

router.get('/', (req, res) => {
  const { company_id, voucher_type, from, to, search } = req.query;
  if (!company_id) return res.status(400).json({ error: 'company_id required' });
  const conds = ['v.company_id=?'];
  const params = [company_id];
  if (voucher_type) { conds.push('v.voucher_type=?'); params.push(voucher_type); }
  if (from)         { conds.push('v.voucher_date >= ?'); params.push(from); }
  if (to)           { conds.push('v.voucher_date <= ?'); params.push(to); }
  if (search)       { conds.push('(v.voucher_no LIKE ? OR v.narration LIKE ? OR v.reference_no LIKE ?)');
                       params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
  db.all(
    `SELECT v.*,
       (SELECT GROUP_CONCAT(l.name, ', ') FROM voucher_lines vl JOIN ledger_accounts l ON l.id=vl.ledger_account_id WHERE vl.voucher_id=v.id) as ledger_names
     FROM vouchers v WHERE ${conds.join(' AND ')} ORDER BY v.voucher_date DESC, v.id DESC`,
    params,
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows || []);
    }
  );
});

router.get('/daybook', (req, res) => {
  const { company_id, date, from, to } = req.query;
  if (!company_id) return res.status(400).json({ error: 'company_id required' });
  const conds = ['v.company_id=?', "v.status='posted'"];
  const params = [company_id];
  if (date) { conds.push('v.voucher_date=?'); params.push(date); }
  if (from) { conds.push('v.voucher_date >= ?'); params.push(from); }
  if (to)   { conds.push('v.voucher_date <= ?'); params.push(to); }
  db.all(
    `SELECT v.id as voucher_id, v.voucher_no, v.voucher_type, v.voucher_date, v.narration,
            vl.dr_cr, vl.amount, l.name as ledger_name
     FROM vouchers v JOIN voucher_lines vl ON vl.voucher_id=v.id JOIN ledger_accounts l ON l.id=vl.ledger_account_id
     WHERE ${conds.join(' AND ')}
     ORDER BY v.voucher_date ASC, v.id ASC, vl.sort_order ASC`,
    params,
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows || []);
    }
  );
});

router.get('/:id', (req, res) => {
  db.get('SELECT * FROM vouchers WHERE id=?', [req.params.id], (err, voucher) => {
    if (err || !voucher) return res.status(404).json({ error: 'Voucher not found' });
    db.all(
      `SELECT vl.*, l.name as ledger_name FROM voucher_lines vl
       JOIN ledger_accounts l ON l.id=vl.ledger_account_id
       WHERE vl.voucher_id=? ORDER BY vl.sort_order ASC, vl.id ASC`,
      [req.params.id],
      (e2, lines) => {
        if (e2) return res.status(500).json({ error: e2.message });
        res.json({ ...voucher, lines: lines || [] });
      }
    );
  });
});

// ── Create / Update / Delete ───────────────────────────────────

function validateLines(lines) {
  if (!Array.isArray(lines) || lines.length < 2) return 'A voucher needs at least two lines.';
  let debit = 0, credit = 0;
  for (const l of lines) {
    if (!l.ledger_account_id || !l.dr_cr || !(parseFloat(l.amount) > 0))
      return 'Each line needs a ledger, dr/cr side, and a positive amount.';
    if (l.dr_cr === 'debit') debit += parseFloat(l.amount); else credit += parseFloat(l.amount);
  }
  if (Math.abs(debit - credit) > 0.01)
    return `Voucher is not balanced: Debit ${debit.toFixed(2)} vs Credit ${credit.toFixed(2)}.`;
  return null;
}

function insertLines(voucherId, lines, cb) {
  const stmt = db.prepare(
    `INSERT INTO voucher_lines (voucher_id, ledger_account_id, dr_cr, amount, narration, sort_order) VALUES (?,?,?,?,?,?)`
  );
  let i = 0, failed = null;
  lines.forEach((l, idx) => {
    stmt.run([voucherId, l.ledger_account_id, l.dr_cr, parseFloat(l.amount), l.narration || '', idx], (err) => {
      if (err) failed = err;
      i++;
      if (i === lines.length) { stmt.finalize(); cb(failed); }
    });
  });
}

router.post('/', (req, res) => {
  const b = req.body;
  if (!b.company_id || !b.voucher_type || !b.voucher_date)
    return res.status(400).json({ error: 'company_id, voucher_type and voucher_date are required.' });
  if (!PREFIX[b.voucher_type]) return res.status(400).json({ error: 'Invalid voucher_type.' });
  const lineError = validateLines(b.lines);
  if (lineError) return res.status(400).json({ error: lineError });

  const total = b.lines.filter(l => l.dr_cr === 'debit').reduce((s, l) => s + parseFloat(l.amount), 0);

  const proceed = (voucher_no) => {
    db.run(
      `INSERT INTO vouchers (company_id, voucher_type, voucher_no, voucher_date, reference_no, narration, total_amount, status)
       VALUES (?,?,?,?,?,?,?,'posted')`,
      [b.company_id, b.voucher_type, voucher_no, b.voucher_date, b.reference_no||'', b.narration||'', total],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });
        const voucherId = this.lastID;
        insertLines(voucherId, b.lines, (lineErr) => {
          if (lineErr) {
            db.run('DELETE FROM vouchers WHERE id=?', [voucherId]);
            return res.status(500).json({ error: lineErr.message });
          }
          db.get('SELECT * FROM vouchers WHERE id=?', [voucherId], (_e, row) => res.json(row));
        });
      }
    );
  };

  if (b.voucher_no && String(b.voucher_no).trim()) proceed(b.voucher_no.trim());
  else nextVoucherNumber(b.company_id, b.voucher_type, (err, voucher_no) => {
    if (err) return res.status(500).json({ error: err.message });
    proceed(voucher_no);
  });
});

router.put('/:id', (req, res) => {
  const b = req.body;
  const lineError = validateLines(b.lines);
  if (lineError) return res.status(400).json({ error: lineError });
  const total = b.lines.filter(l => l.dr_cr === 'debit').reduce((s, l) => s + parseFloat(l.amount), 0);

  db.run(
    `UPDATE vouchers SET voucher_date=?, reference_no=?, narration=?, total_amount=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
    [b.voucher_date, b.reference_no||'', b.narration||'', total, req.params.id],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      db.run('DELETE FROM voucher_lines WHERE voucher_id=?', [req.params.id], (e2) => {
        if (e2) return res.status(500).json({ error: e2.message });
        insertLines(req.params.id, b.lines, (lineErr) => {
          if (lineErr) return res.status(500).json({ error: lineErr.message });
          db.get('SELECT * FROM vouchers WHERE id=?', [req.params.id], (_e, row) => res.json(row));
        });
      });
    }
  );
});

router.delete('/:id', (req, res) => {
  db.run('DELETE FROM vouchers WHERE id=?', [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

module.exports = router;
