// Default Chart of Accounts seeded for every company the first time it's used.
const DEFAULT_GROUPS = [
  { name: 'Fixed Assets',        type: 'asset',     parent: null },
  { name: 'Investments',         type: 'asset',     parent: null },
  { name: 'Current Assets',      type: 'asset',     parent: null },
  { name: 'Sundry Debtors',      type: 'asset',     parent: 'Current Assets' },
  { name: 'Loans (Liability)',   type: 'liability', parent: null },
  { name: 'Current Liabilities', type: 'liability', parent: null },
  { name: 'Sundry Creditors',    type: 'liability', parent: 'Current Liabilities' },
  { name: 'Duties & Taxes',      type: 'liability', parent: 'Current Liabilities' },
  { name: 'Capital Account',     type: 'capital',   parent: null },
  { name: 'Reserves & Surplus',  type: 'capital',   parent: null },
  { name: 'Sales Accounts',      type: 'income',    parent: null },
  { name: 'Indirect Income',     type: 'income',    parent: null },
  { name: 'Purchase Accounts',   type: 'expense',   parent: null },
  { name: 'Direct Expenses',     type: 'expense',   parent: null },
  { name: 'Indirect Expenses',   type: 'expense',   parent: null },
];

const DEFAULT_LEDGERS = [
  { name: 'Cash-in-Hand', group: 'Current Assets', type: 'asset' },
];

// Seeds default groups + ledgers for a company, but only if it has none yet.
function seedDefaultsForCompany(db, companyId, done) {
  db.get('SELECT COUNT(*) as cnt FROM account_groups WHERE company_id=?', [companyId], (err, row) => {
    if (err) return done && done(err);
    if (row && row.cnt > 0) return done && done(null);

    const byName = {};
    const insertGroup = (i) => {
      if (i >= DEFAULT_GROUPS.length) return insertLedgers();
      const g = DEFAULT_GROUPS[i];
      const parentId = g.parent ? (byName[g.parent] || null) : null;
      db.run(
        `INSERT INTO account_groups (company_id, name, account_type, parent_id, is_system, sort_order) VALUES (?,?,?,?,1,?)`,
        [companyId, g.name, g.type, parentId, i],
        function (e) {
          if (e) return done && done(e);
          byName[g.name] = this.lastID;
          insertGroup(i + 1);
        }
      );
    };

    const insertLedgers = () => {
      let i = 0;
      const next = () => {
        if (i >= DEFAULT_LEDGERS.length) return done && done(null);
        const l = DEFAULT_LEDGERS[i];
        const groupId = byName[l.group];
        db.run(
          `INSERT INTO ledger_accounts (company_id, group_id, name, account_type, opening_balance, opening_balance_type)
           VALUES (?,?,?,?,0,'debit')`,
          [companyId, groupId, l.name, l.type],
          (e) => { i++; if (e) return done && done(e); next(); }
        );
      };
      next();
    };

    insertGroup(0);
  });
}

module.exports = { seedDefaultsForCompany, DEFAULT_GROUPS, DEFAULT_LEDGERS };
