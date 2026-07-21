const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const crypto = require('crypto');

const DB_PATH = path.join(__dirname, 'finance.db');

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) console.error('DB connect error:', err.message);
  else console.log('Connected to SQLite:', DB_PATH);
});

db.serialize(() => {
  db.run('PRAGMA foreign_keys = ON');

  db.run(`CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    client TEXT DEFAULT '',
    start_date DATE,
    end_date DATE,
    budget REAL DEFAULT 0,
    currency TEXT DEFAULT 'INR',
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    color TEXT DEFAULT '#667eea',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER,
    category_id INTEGER,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    amount REAL NOT NULL,
    currency TEXT DEFAULT 'INR',
    date DATE NOT NULL,
    reference_no TEXT DEFAULT '',
    payment_method TEXT DEFAULT 'cash',
    party_name TEXT DEFAULT '',
    tax_amount REAL DEFAULT 0,
    discount REAL DEFAULT 0,
    notes TEXT DEFAULT '',
    attachment_path TEXT DEFAULT '',
    attachment_name TEXT DEFAULT '',
    attachment_type TEXT DEFAULT '',
    status TEXT DEFAULT 'confirmed',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`);

  // Seed default admin username (only if not already set)
  db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('admin_username', 'admin')`);

  db.run(`CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    username   TEXT NOT NULL UNIQUE,
    password   TEXT NOT NULL,
    role       TEXT NOT NULL DEFAULT 'staff' CHECK(role IN ('admin','staff','accountant')),
    is_active  INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Seed first admin from settings if users table is empty.
  // Password is either ADMIN_PASSWORD from the environment or a freshly
  // generated random one — never a fixed value baked into the source.
  db.get('SELECT COUNT(*) as cnt FROM users', [], (err, row) => {
    if (err || row.cnt > 0) return;
    db.get("SELECT value FROM settings WHERE key='admin_username'", [], (e1, u) => {
      const uname = (u && u.value) ? u.value : 'admin';
      const pwd = process.env.ADMIN_PASSWORD || crypto.randomBytes(9).toString('base64');
      db.run('INSERT INTO users (username,password,role) VALUES (?,?,?)', [uname, pwd, 'admin'], () => {
        console.log('================================================');
        console.log(' Seeded admin user:', uname);
        console.log(' Generated password:', pwd);
        console.log(' Save this now — it will not be shown again. Log in and change it immediately.');
        console.log('================================================');
      });
    });
  });

  db.run(`CREATE TABLE IF NOT EXISTS upcoming (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    amount REAL NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('income','expense')),
    project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    due_date DATE NOT NULL,
    recurrence TEXT DEFAULT 'none',
    notes TEXT DEFAULT '',
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending','paid','overdue')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS loans (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    title               TEXT NOT NULL,
    lender              TEXT DEFAULT '',
    loan_type           TEXT DEFAULT 'personal' CHECK(loan_type IN ('personal','home','car','business','education','other')),
    principal_amount    REAL NOT NULL,
    interest_rate       REAL DEFAULT 0,
    tenure_months       INTEGER DEFAULT 0,
    emi_amount          REAL DEFAULT 0,
    start_date          DATE,
    next_due_date       DATE,
    outstanding_balance REAL DEFAULT 0,
    total_paid          REAL DEFAULT 0,
    account_no          TEXT DEFAULT '',
    status              TEXT DEFAULT 'active' CHECK(status IN ('active','closed')),
    notes               TEXT DEFAULT '',
    created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS loan_payments (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    loan_id        INTEGER NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
    payment_date   DATE NOT NULL,
    amount         REAL NOT NULL,
    payment_method TEXT DEFAULT 'bank_transfer',
    receipt_no     TEXT DEFAULT '',
    notes          TEXT DEFAULT '',
    created_at     DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS investments (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    title                TEXT NOT NULL,
    investment_type      TEXT DEFAULT 'other' CHECK(investment_type IN ('mutual_fund','fd','rd','stocks','ppf','nps','gold','real_estate','other')),
    institution          TEXT DEFAULT '',
    principal_amount     REAL DEFAULT 0,
    expected_return_rate REAL DEFAULT 0,
    start_date           DATE,
    maturity_date        DATE,
    maturity_amount      REAL DEFAULT 0,
    current_value        REAL DEFAULT 0,
    payment_frequency    TEXT DEFAULT 'one_time' CHECK(payment_frequency IN ('one_time','monthly','quarterly','yearly')),
    payment_amount       REAL DEFAULT 0,
    next_payment_date    DATE,
    total_invested       REAL DEFAULT 0,
    status               TEXT DEFAULT 'active' CHECK(status IN ('active','matured','withdrawn')),
    notes                TEXT DEFAULT '',
    created_at           DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at           DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS investment_payments (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    investment_id INTEGER NOT NULL REFERENCES investments(id) ON DELETE CASCADE,
    payment_date  DATE NOT NULL,
    amount        REAL NOT NULL,
    payment_method TEXT DEFAULT 'bank_transfer',
    notes         TEXT DEFAULT '',
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS assets (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    name           TEXT NOT NULL,
    asset_tag      TEXT DEFAULT '',
    category       TEXT DEFAULT 'other' CHECK(category IN ('electronics','furniture','vehicle','equipment','property','tools','other')),
    project        TEXT DEFAULT '',
    location       TEXT DEFAULT '',
    purchase_date  DATE,
    purchase_value REAL DEFAULT 0,
    current_value  REAL DEFAULT 0,
    condition      TEXT DEFAULT 'good' CHECK(condition IN ('excellent','good','fair','poor','damaged')),
    resale_chance  TEXT DEFAULT 'medium' CHECK(resale_chance IN ('high','medium','low','none')),
    photo          TEXT DEFAULT '',
    status         TEXT DEFAULT 'active' CHECK(status IN ('active','under_repair','disposed','sold')),
    notes          TEXT DEFAULT '',
    created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at     DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS bank_accounts (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    account_name   TEXT NOT NULL,
    bank_name      TEXT DEFAULT '',
    account_no     TEXT DEFAULT '',
    account_type   TEXT DEFAULT 'savings' CHECK(account_type IN ('savings','current','fixed','overdraft')),
    branch         TEXT DEFAULT '',
    ifsc           TEXT DEFAULT '',
    opening_balance REAL DEFAULT 0,
    color          TEXT DEFAULT '#3b82f6',
    is_active      INTEGER DEFAULT 1,
    notes          TEXT DEFAULT '',
    created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at     DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS bank_statement_lines (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id     INTEGER NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
    txn_date       DATE NOT NULL,
    description    TEXT DEFAULT '',
    reference_no   TEXT DEFAULT '',
    debit          REAL DEFAULT 0,
    credit         REAL DEFAULT 0,
    balance        REAL,
    is_reconciled  INTEGER DEFAULT 0,
    notes          TEXT DEFAULT '',
    created_at     DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS bank_reconciliation_sessions (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id         INTEGER NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
    period_from        DATE NOT NULL,
    period_to          DATE NOT NULL,
    opening_balance    REAL DEFAULT 0,
    statement_closing  REAL DEFAULT 0,
    cleared_balance    REAL DEFAULT 0,
    difference         REAL DEFAULT 0,
    cleared_count      INTEGER DEFAULT 0,
    outstanding_count  INTEGER DEFAULT 0,
    status             TEXT DEFAULT 'completed' CHECK(status IN ('in_progress','completed')),
    notes              TEXT DEFAULT '',
    created_at         DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // ── Invoice / Quotation system ────────────────────────────────
  db.run(`CREATE TABLE IF NOT EXISTS inv_companies (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    address     TEXT DEFAULT '',
    city        TEXT DEFAULT '',
    state       TEXT DEFAULT '',
    pincode     TEXT DEFAULT '',
    country     TEXT DEFAULT 'India',
    phone       TEXT DEFAULT '',
    email       TEXT DEFAULT '',
    website     TEXT DEFAULT '',
    gstin       TEXT DEFAULT '',
    pan         TEXT DEFAULT '',
    logo        TEXT DEFAULT '',
    bank_name   TEXT DEFAULT '',
    bank_ac     TEXT DEFAULT '',
    bank_ifsc   TEXT DEFAULT '',
    bank_branch TEXT DEFAULT '',
    is_default  INTEGER DEFAULT 0,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS invoices (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    inv_number       TEXT NOT NULL,
    doc_type         TEXT DEFAULT 'invoice',
    template         TEXT DEFAULT 'modern-blue',
    company_id       INTEGER REFERENCES inv_companies(id) ON DELETE SET NULL,
    from_name        TEXT DEFAULT '',
    from_address     TEXT DEFAULT '',
    from_city        TEXT DEFAULT '',
    from_state       TEXT DEFAULT '',
    from_pincode     TEXT DEFAULT '',
    from_phone       TEXT DEFAULT '',
    from_email       TEXT DEFAULT '',
    from_gstin       TEXT DEFAULT '',
    from_logo        TEXT DEFAULT '',
    from_bank_name   TEXT DEFAULT '',
    from_bank_ac     TEXT DEFAULT '',
    from_bank_ifsc   TEXT DEFAULT '',
    from_bank_branch TEXT DEFAULT '',
    to_name          TEXT DEFAULT '',
    to_address       TEXT DEFAULT '',
    to_city          TEXT DEFAULT '',
    to_state         TEXT DEFAULT '',
    to_pincode       TEXT DEFAULT '',
    to_phone         TEXT DEFAULT '',
    to_email         TEXT DEFAULT '',
    to_gstin         TEXT DEFAULT '',
    date             TEXT DEFAULT '',
    due_date         TEXT DEFAULT '',
    valid_until      TEXT DEFAULT '',
    po_number        TEXT DEFAULT '',
    currency         TEXT DEFAULT 'INR',
    subtotal         REAL DEFAULT 0,
    tax_label        TEXT DEFAULT 'GST',
    tax_rate         REAL DEFAULT 0,
    tax_amount       REAL DEFAULT 0,
    discount         REAL DEFAULT 0,
    discount_type    TEXT DEFAULT 'amount',
    shipping         REAL DEFAULT 0,
    total            REAL DEFAULT 0,
    amount_paid      REAL DEFAULT 0,
    balance_due      REAL DEFAULT 0,
    notes            TEXT DEFAULT '',
    terms            TEXT DEFAULT '',
    status           TEXT DEFAULT 'draft',
    is_project_inv   INTEGER DEFAULT 0,
    project_id       INTEGER REFERENCES projects(id) ON DELETE SET NULL,
    payment_mode     TEXT DEFAULT '',
    payment_date     TEXT DEFAULT '',
    payment_ref      TEXT DEFAULT '',
    txn_created      INTEGER DEFAULT 0,
    created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at       DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS invoice_items (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id  INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    description TEXT DEFAULT '',
    details     TEXT DEFAULT '',
    hsn_sac     TEXT DEFAULT '',
    qty         REAL DEFAULT 1,
    unit        TEXT DEFAULT 'pcs',
    rate        REAL DEFAULT 0,
    tax_rate    REAL DEFAULT 0,
    amount      REAL DEFAULT 0,
    sort_order  INTEGER DEFAULT 0
  )`);

  // ── HR / Staff / Payroll tables ──────────────────────────────
  db.run(`CREATE TABLE IF NOT EXISTS staff (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id           TEXT DEFAULT '',
    name                  TEXT NOT NULL DEFAULT '',
    photo                 TEXT DEFAULT '',
    designation           TEXT DEFAULT '',
    department            TEXT DEFAULT '',
    date_of_joining       DATE DEFAULT '',
    date_of_birth         DATE DEFAULT '',
    gender                TEXT DEFAULT '',
    phone                 TEXT DEFAULT '',
    email                 TEXT DEFAULT '',
    address               TEXT DEFAULT '',
    city                  TEXT DEFAULT '',
    state                 TEXT DEFAULT '',
    pincode               TEXT DEFAULT '',
    bank_name             TEXT DEFAULT '',
    bank_account          TEXT DEFAULT '',
    bank_ifsc             TEXT DEFAULT '',
    emergency_contact     TEXT DEFAULT '',
    emergency_phone       TEXT DEFAULT '',
    notes                 TEXT DEFAULT '',
    status                TEXT DEFAULT 'active',
    created_at            DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at            DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS staff_projects (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    staff_id   INTEGER NOT NULL,
    project_id INTEGER NOT NULL,
    role       TEXT DEFAULT '',
    from_date  DATE DEFAULT '',
    to_date    DATE DEFAULT '',
    is_primary INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(staff_id, project_id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS staff_salary (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    staff_id     INTEGER NOT NULL UNIQUE,
    basic        REAL DEFAULT 0,
    hra_pct      REAL DEFAULT 0,
    da_pct       REAL DEFAULT 0,
    ta_fixed     REAL DEFAULT 0,
    other_fixed  REAL DEFAULT 0,
    pf_pct       REAL DEFAULT 12,
    esi_pct      REAL DEFAULT 0.75,
    working_days INTEGER DEFAULT 26,
    effective_from DATE DEFAULT '',
    updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS attendance (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    staff_id   INTEGER NOT NULL,
    date       DATE NOT NULL,
    status     TEXT DEFAULT 'present',
    notes      TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(staff_id, date)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS payroll (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    staff_id          INTEGER NOT NULL,
    project_id        INTEGER,
    month             INTEGER NOT NULL,
    year              INTEGER NOT NULL,
    working_days      REAL DEFAULT 0,
    present_days      REAL DEFAULT 0,
    absent_days       REAL DEFAULT 0,
    leave_days        REAL DEFAULT 0,
    half_days         REAL DEFAULT 0,
    paid_days         REAL DEFAULT 0,
    basic             REAL DEFAULT 0,
    hra               REAL DEFAULT 0,
    da                REAL DEFAULT 0,
    ta                REAL DEFAULT 0,
    other_allowance   REAL DEFAULT 0,
    gross             REAL DEFAULT 0,
    pf_deduction      REAL DEFAULT 0,
    esi_deduction     REAL DEFAULT 0,
    advance_deduction REAL DEFAULT 0,
    other_deduction   REAL DEFAULT 0,
    total_deduction   REAL DEFAULT 0,
    net_salary        REAL DEFAULT 0,
    status            TEXT DEFAULT 'draft',
    payment_date      DATE DEFAULT '',
    payment_mode      TEXT DEFAULT '',
    notes             TEXT DEFAULT '',
    txn_created       INTEGER DEFAULT 0,
    created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(staff_id, month, year)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS staff_advances (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    staff_id          INTEGER NOT NULL,
    project_id        INTEGER,
    amount            REAL DEFAULT 0,
    date              DATE DEFAULT '',
    reason            TEXT DEFAULT '',
    monthly_deduction REAL DEFAULT 0,
    balance           REAL DEFAULT 0,
    status            TEXT DEFAULT 'active',
    created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at        DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Safe column additions to projects (ignore error if column already exists)
  const safeAlter = (sql) => db.run(sql, () => {});
  safeAlter(`ALTER TABLE projects ADD COLUMN company_id INTEGER`);
  safeAlter(`ALTER TABLE projects ADD COLUMN client_address TEXT DEFAULT ''`);
  safeAlter(`ALTER TABLE projects ADD COLUMN client_email TEXT DEFAULT ''`);
  safeAlter(`ALTER TABLE projects ADD COLUMN client_phone TEXT DEFAULT ''`);
  safeAlter(`ALTER TABLE projects ADD COLUMN client_gstin TEXT DEFAULT ''`);

  // Accounting-specific columns on the existing company/letterhead table —
  // inv_companies already has name/address/GSTIN/PAN/bank details, so it
  // doubles as the "Company" master for the accounting module too.
  safeAlter(`ALTER TABLE inv_companies ADD COLUMN fiscal_year_start_month INTEGER DEFAULT 4`);
  safeAlter(`ALTER TABLE inv_companies ADD COLUMN books_begin_date DATE`);
  safeAlter(`ALTER TABLE inv_companies ADD COLUMN is_active INTEGER DEFAULT 1`);

  // ── Accounting: Chart of Accounts / Vouchers / Ledger ─────────
  db.run(`CREATE TABLE IF NOT EXISTS account_groups (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id   INTEGER NOT NULL REFERENCES inv_companies(id) ON DELETE CASCADE,
    name         TEXT NOT NULL,
    account_type TEXT NOT NULL CHECK(account_type IN ('asset','liability','income','capital','expense')),
    parent_id    INTEGER REFERENCES account_groups(id) ON DELETE SET NULL,
    is_system    INTEGER DEFAULT 0,
    sort_order   INTEGER DEFAULT 0,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS ledger_accounts (
    id                     INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id             INTEGER NOT NULL REFERENCES inv_companies(id) ON DELETE CASCADE,
    group_id               INTEGER NOT NULL REFERENCES account_groups(id) ON DELETE RESTRICT,
    code                   TEXT DEFAULT '',
    name                   TEXT NOT NULL,
    account_type           TEXT NOT NULL CHECK(account_type IN ('asset','liability','income','capital','expense')),
    opening_balance        REAL DEFAULT 0,
    opening_balance_type   TEXT DEFAULT 'debit' CHECK(opening_balance_type IN ('debit','credit')),
    opening_date           DATE,
    linked_bank_account_id INTEGER REFERENCES bank_accounts(id) ON DELETE SET NULL,
    gstin                  TEXT DEFAULT '',
    party_type             TEXT DEFAULT '',
    address                TEXT DEFAULT '',
    phone                  TEXT DEFAULT '',
    email                  TEXT DEFAULT '',
    is_active              INTEGER DEFAULT 1,
    notes                  TEXT DEFAULT '',
    created_at             DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at             DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(company_id, name)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS vouchers (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id            INTEGER NOT NULL REFERENCES inv_companies(id) ON DELETE CASCADE,
    voucher_type          TEXT NOT NULL CHECK(voucher_type IN ('payment','receipt','journal','contra','sales','purchase','debit_note','credit_note')),
    voucher_no            TEXT NOT NULL,
    voucher_date          DATE NOT NULL,
    reference_no          TEXT DEFAULT '',
    narration             TEXT DEFAULT '',
    total_amount          REAL DEFAULT 0,
    status                TEXT DEFAULT 'posted' CHECK(status IN ('draft','posted','cancelled')),
    linked_invoice_id     INTEGER REFERENCES invoices(id) ON DELETE SET NULL,
    linked_transaction_id INTEGER REFERENCES transactions(id) ON DELETE SET NULL,
    created_by            INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at            DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at            DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(company_id, voucher_type, voucher_no)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS voucher_lines (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    voucher_id        INTEGER NOT NULL REFERENCES vouchers(id) ON DELETE CASCADE,
    ledger_account_id INTEGER NOT NULL REFERENCES ledger_accounts(id) ON DELETE RESTRICT,
    dr_cr             TEXT NOT NULL CHECK(dr_cr IN ('debit','credit')),
    amount            REAL NOT NULL,
    narration         TEXT DEFAULT '',
    sort_order        INTEGER DEFAULT 0
  )`);

  // Ensure at least one company exists, and every company has default
  // Chart of Accounts groups + a Cash-in-Hand ledger seeded.
  const { seedDefaultsForCompany } = require('./lib/accountingSeed');
  db.get('SELECT COUNT(*) as cnt FROM inv_companies', [], (err, row) => {
    if (err) return;
    const seedAllCompanies = () => {
      db.all('SELECT id FROM inv_companies', [], (e2, rows) => {
        if (e2 || !rows) return;
        rows.forEach((r) => seedDefaultsForCompany(db, r.id, () => {}));
      });
    };
    if (row.cnt === 0) {
      db.run(
        `INSERT INTO inv_companies (name, country, is_default) VALUES ('My Company', 'India', 1)`,
        function (e3) {
          if (e3) return;
          seedDefaultsForCompany(db, this.lastID, () => {});
        }
      );
    } else {
      seedAllCompanies();
    }
  });

  // Seed default categories if empty
  db.get('SELECT COUNT(*) as cnt FROM categories', [], (err, row) => {
    if (err || row.cnt > 0) return;
    const incomeCategories = [
      ['Project Revenue', 'income', '#27ae60'],
      ['Consulting Fees', 'income', '#2ecc71'],
      ['Advance Payment', 'income', '#1abc9c'],
      ['Milestone Payment', 'income', '#16a085'],
      ['Bonus / Incentive', 'income', '#3498db'],
      ['Reimbursement', 'income', '#2980b9'],
      ['Other Income', 'income', '#8e44ad'],
    ];
    const expenseCategories = [
      ['Labor / Salaries', 'expense', '#e74c3c'],
      ['Materials & Supplies', 'expense', '#c0392b'],
      ['Equipment Rental', 'expense', '#e67e22'],
      ['Software / Licenses', 'expense', '#d35400'],
      ['Travel & Transport', 'expense', '#f39c12'],
      ['Utilities', 'expense', '#f1c40f'],
      ['Office Rent', 'expense', '#e91e63'],
      ['Marketing & Ads', 'expense', '#9c27b0'],
      ['Legal & Compliance', 'expense', '#673ab7'],
      ['Bank Charges', 'expense', '#607d8b'],
      ['Taxes & Duties', 'expense', '#795548'],
      ['Miscellaneous', 'expense', '#95a5a6'],
    ];
    const all = [...incomeCategories, ...expenseCategories];
    const stmt = db.prepare('INSERT INTO categories (name, type, color) VALUES (?, ?, ?)');
    all.forEach(([name, type, color]) => stmt.run(name, type, color));
    stmt.finalize();
    console.log('Seeded default categories.');
  });
});

module.exports = db;
