// Shared double-entry balance math, reused by the ledger statement, trial balance,
// profit & loss, and balance sheet reports so the debit/credit-normal-side logic
// only lives in one place.

const NORMAL_BALANCE = {
  asset: 'debit',
  expense: 'debit',
  liability: 'credit',
  income: 'credit',
  capital: 'credit',
};

// Signed opening balance, expressed on the account's normal side (+ve = normal side).
function openingSigned(acc) {
  const normal = NORMAL_BALANCE[acc.account_type];
  const bal = acc.opening_balance || 0;
  return acc.opening_balance_type === normal ? bal : -bal;
}

// SUM(debit)/SUM(credit) per ledger account for posted vouchers in an optional date range.
function getMovements(db, { companyId, from, to }, cb) {
  const conds = ['v.company_id = ?', "v.status = 'posted'"];
  const params = [companyId];
  if (from) { conds.push('v.voucher_date >= ?'); params.push(from); }
  if (to)   { conds.push('v.voucher_date <= ?'); params.push(to); }
  db.all(
    `SELECT vl.ledger_account_id, vl.dr_cr, SUM(vl.amount) as total
     FROM voucher_lines vl JOIN vouchers v ON v.id = vl.voucher_id
     WHERE ${conds.join(' AND ')}
     GROUP BY vl.ledger_account_id, vl.dr_cr`,
    params,
    (err, rows) => {
      if (err) return cb(err);
      const map = {};
      rows.forEach((r) => {
        map[r.ledger_account_id] = map[r.ledger_account_id] || { debit: 0, credit: 0 };
        map[r.ledger_account_id][r.dr_cr] = r.total || 0;
      });
      cb(null, map);
    }
  );
}

function listLedgers(db, companyId, cb) {
  db.all(
    `SELECT la.*, ag.name as group_name, ag.account_type as group_type
     FROM ledger_accounts la JOIN account_groups ag ON ag.id = la.group_id
     WHERE la.company_id = ? ORDER BY ag.sort_order ASC, la.name ASC`,
    [companyId],
    cb
  );
}

// Cumulative balance "as of" a date (opening + all movement up to and including that date).
// Used by Trial Balance and Balance Sheet.
function getBalancesAsOf(db, companyId, asOfDate, cb) {
  listLedgers(db, companyId, (err, ledgers) => {
    if (err) return cb(err);
    getMovements(db, { companyId, to: asOfDate }, (err2, moveMap) => {
      if (err2) return cb(err2);
      const result = ledgers.map((acc) => {
        const normal = NORMAL_BALANCE[acc.account_type];
        const mv = moveMap[acc.id] || { debit: 0, credit: 0 };
        const movementSigned = normal === 'debit' ? mv.debit - mv.credit : mv.credit - mv.debit;
        return { ...acc, balance: openingSigned(acc) + movementSigned };
      });
      cb(null, result);
    });
  });
}

// Net movement only (no opening balance) between from/to — used by Profit & Loss,
// which only cares about income/expense accounts for the period.
function getPeriodMovement(db, companyId, from, to, cb) {
  listLedgers(db, companyId, (err, ledgers) => {
    if (err) return cb(err);
    getMovements(db, { companyId, from, to }, (err2, moveMap) => {
      if (err2) return cb(err2);
      const result = ledgers
        .filter((acc) => acc.account_type === 'income' || acc.account_type === 'expense')
        .map((acc) => {
          const normal = NORMAL_BALANCE[acc.account_type];
          const mv = moveMap[acc.id] || { debit: 0, credit: 0 };
          const balance = normal === 'debit' ? mv.debit - mv.credit : mv.credit - mv.debit;
          return { ...acc, balance };
        });
      cb(null, result);
    });
  });
}

module.exports = { NORMAL_BALANCE, openingSigned, getMovements, listLedgers, getBalancesAsOf, getPeriodMovement };
