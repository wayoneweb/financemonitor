const express = require('express');
const db      = require('../database');
const router  = express.Router();
const { NORMAL_BALANCE, openingSigned } = require('../lib/ledgerCalc');

// ── Account Groups ─────────────────────────────────────────────

router.get('/groups', (req, res) => {
  const { company_id } = req.query;
  if (!company_id) return res.status(400).json({ error: 'company_id required' });
  db.all(
    `SELECT g.*, (SELECT COUNT(*) FROM ledger_accounts l WHERE l.group_id=g.id) as ledger_count
     FROM account_groups g WHERE g.company_id=? ORDER BY g.sort_order ASC, g.name ASC`,
    [company_id],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows || []);
    }
  );
});

router.post('/groups', (req, res) => {
  const b = req.body;
  if (!b.company_id || !b.name || !b.account_type)
    return res.status(400).json({ error: 'company_id, name and account_type are required.' });
  db.run(
    `INSERT INTO account_groups (company_id, name, account_type, parent_id, sort_order) VALUES (?,?,?,?,?)`,
    [b.company_id, b.name.trim(), b.account_type, b.parent_id || null, parseInt(b.sort_order) || 0],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      db.get('SELECT * FROM account_groups WHERE id=?', [this.lastID], (_e, row) => res.json(row));
    }
  );
});

router.put('/groups/:id', (req, res) => {
  const b = req.body;
  db.get('SELECT * FROM account_groups WHERE id=?', [req.params.id], (err, existing) => {
    if (err || !existing) return res.status(404).json({ error: 'Group not found' });
    if (existing.is_system) return res.status(400).json({ error: 'Cannot modify a default system group.' });
    db.run(
      `UPDATE account_groups SET name=?, parent_id=? WHERE id=?`,
      [b.name || existing.name, b.parent_id !== undefined ? b.parent_id : existing.parent_id, req.params.id],
      (e2) => {
        if (e2) return res.status(500).json({ error: e2.message });
        db.get('SELECT * FROM account_groups WHERE id=?', [req.params.id], (_e, row) => res.json(row));
      }
    );
  });
});

router.delete('/groups/:id', (req, res) => {
  db.get('SELECT * FROM account_groups WHERE id=?', [req.params.id], (err, existing) => {
    if (err || !existing) return res.status(404).json({ error: 'Group not found' });
    if (existing.is_system) return res.status(400).json({ error: 'Cannot delete a default system group.' });
    db.run('DELETE FROM account_groups WHERE id=?', [req.params.id], (e2) => {
      if (e2) return res.status(400).json({ error: 'Group has ledgers or sub-groups under it.' });
      res.json({ success: true });
    });
  });
});

// ── Ledger Accounts ────────────────────────────────────────────

router.get('/ledgers', (req, res) => {
  const { company_id, group_id } = req.query;
  if (!company_id) return res.status(400).json({ error: 'company_id required' });
  const conds = ['l.company_id=?'];
  const params = [company_id];
  if (group_id) { conds.push('l.group_id=?'); params.push(group_id); }
  db.all(
    `SELECT l.*, g.name as group_name FROM ledger_accounts l
     JOIN account_groups g ON g.id=l.group_id
     WHERE ${conds.join(' AND ')} ORDER BY l.name ASC`,
    params,
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows || []);
    }
  );
});

router.post('/ledgers', (req, res) => {
  const b = req.body;
  if (!b.company_id || !b.name || !b.group_id)
    return res.status(400).json({ error: 'company_id, name and group_id are required.' });
  db.get('SELECT account_type FROM account_groups WHERE id=?', [b.group_id], (err, group) => {
    if (err || !group) return res.status(400).json({ error: 'Invalid group_id.' });
    db.run(
      `INSERT INTO ledger_accounts
         (company_id, group_id, code, name, account_type, opening_balance, opening_balance_type, opening_date,
          linked_bank_account_id, gstin, party_type, address, phone, email, notes)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [b.company_id, b.group_id, b.code||'', b.name.trim(), group.account_type,
       parseFloat(b.opening_balance)||0, b.opening_balance_type||'debit', b.opening_date||null,
       b.linked_bank_account_id||null, b.gstin||'', b.party_type||'', b.address||'', b.phone||'', b.email||'', b.notes||''],
      function (e2) {
        if (e2) return res.status(500).json({ error: e2.message });
        db.get('SELECT * FROM ledger_accounts WHERE id=?', [this.lastID], (_e, row) => res.json(row));
      }
    );
  });
});

router.put('/ledgers/:id', (req, res) => {
  const b = req.body;
  db.run(
    `UPDATE ledger_accounts SET code=?, name=?, opening_balance=?, opening_balance_type=?, opening_date=?,
       linked_bank_account_id=?, gstin=?, party_type=?, address=?, phone=?, email=?, is_active=?, notes=?,
       updated_at=CURRENT_TIMESTAMP WHERE id=?`,
    [b.code||'', b.name||'', parseFloat(b.opening_balance)||0, b.opening_balance_type||'debit', b.opening_date||null,
     b.linked_bank_account_id||null, b.gstin||'', b.party_type||'', b.address||'', b.phone||'', b.email||'',
     b.is_active !== undefined ? (b.is_active ? 1 : 0) : 1, b.notes||'', req.params.id],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      db.get('SELECT * FROM ledger_accounts WHERE id=?', [req.params.id], (_e, row) => res.json(row));
    }
  );
});

router.delete('/ledgers/:id', (req, res) => {
  db.run('DELETE FROM ledger_accounts WHERE id=?', [req.params.id], (err) => {
    if (err) return res.status(400).json({ error: 'This ledger has voucher entries and cannot be deleted.' });
    res.json({ success: true });
  });
});

// ── Ledger Statement (running balance, like a bank statement) ──

router.get('/ledgers/:id/statement', (req, res) => {
  const { from, to } = req.query;
  const id = req.params.id;
  db.get('SELECT * FROM ledger_accounts WHERE id=?', [id], (err, acc) => {
    if (err || !acc) return res.status(404).json({ error: 'Ledger not found' });

    const computePrior = (cb) => {
      if (!from) return cb(null, { debit: 0, credit: 0 });
      db.all(
        `SELECT vl.dr_cr, SUM(vl.amount) as total FROM voucher_lines vl
         JOIN vouchers v ON v.id=vl.voucher_id
         WHERE v.company_id=? AND v.status='posted' AND vl.ledger_account_id=? AND v.voucher_date < ?
         GROUP BY vl.dr_cr`,
        [acc.company_id, id, from],
        (e, rows) => {
          if (e) return cb(e);
          const prior = { debit: 0, credit: 0 };
          (rows||[]).forEach(r => { prior[r.dr_cr] = r.total || 0; });
          cb(null, prior);
        }
      );
    };

    computePrior((e1, prior) => {
      if (e1) return res.status(500).json({ error: e1.message });
      const normal = NORMAL_BALANCE[acc.account_type];
      const priorMovement = normal === 'debit' ? prior.debit - prior.credit : prior.credit - prior.debit;
      const opening = openingSigned(acc) + priorMovement;

      const conds = ['v.company_id=?', "v.status='posted'", 'vl.ledger_account_id=?'];
      const params = [acc.company_id, id];
      if (from) { conds.push('v.voucher_date >= ?'); params.push(from); }
      if (to)   { conds.push('v.voucher_date <= ?'); params.push(to); }

      db.all(
        `SELECT vl.id, vl.dr_cr, vl.amount, vl.narration as line_narration,
                v.id as voucher_id, v.voucher_no, v.voucher_type, v.voucher_date, v.narration
         FROM voucher_lines vl JOIN vouchers v ON v.id=vl.voucher_id
         WHERE ${conds.join(' AND ')}
         ORDER BY v.voucher_date ASC, v.id ASC`,
        params,
        (e2, rows) => {
          if (e2) return res.status(500).json({ error: e2.message });
          let running = opening;
          const lines = (rows||[]).map(r => {
            const delta = normal === 'debit'
              ? (r.dr_cr === 'debit' ? r.amount : -r.amount)
              : (r.dr_cr === 'credit' ? r.amount : -r.amount);
            running += delta;
            return { ...r, running_balance: running };
          });
          res.json({ ledger: acc, opening_balance: opening, closing_balance: running, lines });
        }
      );
    });
  });
});

module.exports = router;
