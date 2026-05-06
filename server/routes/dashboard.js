const express = require('express');
const router = express.Router();
const db = require('../database');

router.get('/stats', (req, res) => {
  const queries = {
    overall: `SELECT
      COALESCE(SUM(CASE WHEN type='income' THEN amount ELSE 0 END),0) as total_income,
      COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END),0) as total_expense,
      COUNT(*) as total_transactions
    FROM transactions WHERE status != 'cancelled'`,

    projects: `SELECT COUNT(*) as total, SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) as active FROM projects`,

    loss_projects: `SELECT p.id, p.name,
      COALESCE(SUM(CASE WHEN t.type='income'  THEN t.amount ELSE 0 END),0) as income,
      COALESCE(SUM(CASE WHEN t.type='expense' THEN t.amount ELSE 0 END),0) as expense,
      COALESCE(SUM(CASE WHEN t.type='income'  THEN t.amount ELSE 0 END),0) -
      COALESCE(SUM(CASE WHEN t.type='expense' THEN t.amount ELSE 0 END),0) as net
    FROM projects p
    LEFT JOIN transactions t ON t.project_id = p.id AND t.status != 'cancelled'
    GROUP BY p.id HAVING net < 0 ORDER BY net ASC`,

    by_project: `SELECT p.name, p.id,
      COALESCE(SUM(CASE WHEN t.type='income' THEN t.amount ELSE 0 END),0) as income,
      COALESCE(SUM(CASE WHEN t.type='expense' THEN t.amount ELSE 0 END),0) as expense
    FROM projects p LEFT JOIN transactions t ON t.project_id = p.id AND t.status != 'cancelled'
    GROUP BY p.id ORDER BY income DESC LIMIT 8`,

    daily_projects: `SELECT p.id, p.name,
      COALESCE(SUM(CASE WHEN t.type='income'  THEN t.amount ELSE 0 END),0) as today_income,
      COALESCE(SUM(CASE WHEN t.type='expense' THEN t.amount ELSE 0 END),0) as today_expense,
      COUNT(t.id) as txn_count
    FROM projects p
    LEFT JOIN transactions t ON t.project_id = p.id
      AND t.status != 'cancelled'
      AND date(t.date) = date('now')
    GROUP BY p.id
    HAVING txn_count > 0
    ORDER BY (today_income + today_expense) DESC`,

    monthly: `SELECT strftime('%Y-%m', date) as month,
      COALESCE(SUM(CASE WHEN type='income' THEN amount ELSE 0 END),0) as income,
      COALESCE(SUM(CASE WHEN type='expense' THEN amount ELSE 0 END),0) as expense
    FROM transactions WHERE status != 'cancelled' AND date >= date('now', '-12 months')
    GROUP BY month ORDER BY month`,

    by_category: `SELECT c.name, c.color, t.type,
      COALESCE(SUM(t.amount),0) as total
    FROM categories c
    LEFT JOIN transactions t ON t.category_id = c.id AND t.status != 'cancelled'
    GROUP BY c.id HAVING total > 0 ORDER BY total DESC LIMIT 10`,

    recent: `SELECT t.*, p.name as project_name, c.name as category_name, c.color as category_color
    FROM transactions t
    LEFT JOIN projects p ON p.id = t.project_id
    LEFT JOIN categories c ON c.id = t.category_id
    ORDER BY t.created_at DESC LIMIT 10`,

    pending: `SELECT COUNT(*) as count, COALESCE(SUM(amount),0) as amount
    FROM transactions WHERE status='pending'`,

    upcoming_snap: `SELECT
      COUNT(CASE WHEN status='overdue' THEN 1 END) as overdue_count,
      COALESCE(SUM(CASE WHEN status='overdue' THEN amount ELSE 0 END),0) as overdue_amount,
      COALESCE(SUM(CASE WHEN type='income' AND status='pending'
        AND due_date <= date('now','+30 days') THEN amount ELSE 0 END),0) as upcoming_income,
      COALESCE(SUM(CASE WHEN type='expense' AND status='pending'
        AND due_date <= date('now','+30 days') THEN amount ELSE 0 END),0) as upcoming_expense
    FROM upcoming`,
  };

  // Auto-mark overdue first
  db.run(`UPDATE upcoming SET status='overdue' WHERE status='pending' AND due_date < date('now')`, () => {
    const result = {};
    const keys = Object.keys(queries);
    let done = 0;
    const check = () => { if (++done === keys.length) res.json(result); };

    keys.forEach((key) => {
      const single = ['overall', 'projects', 'pending', 'upcoming_snap'].includes(key);
      db[single ? 'get' : 'all'](queries[key], [], (err, rows) => {
        result[key] = err ? (single ? null : []) : rows;
        check();
      });
    });
  });
});

module.exports = router;
