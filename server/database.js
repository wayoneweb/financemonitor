const sqlite3 = require('sqlite3').verbose();
const path = require('path');

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

  // Seed default credentials (only if not already set)
  db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('admin_username', 'admin')`);
  db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('admin_password', 'Finance@2024')`);

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
