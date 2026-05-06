const express = require('express');
const router = express.Router();
const db = require('../database');

router.get('/', (req, res) => {
  const sql = `
    SELECT p.*,
      COALESCE(SUM(CASE WHEN t.type='income' THEN t.amount ELSE 0 END),0) as total_income,
      COALESCE(SUM(CASE WHEN t.type='expense' THEN t.amount ELSE 0 END),0) as total_expense,
      COALESCE(SUM(CASE WHEN t.type='income' THEN t.amount ELSE -t.amount END),0) as net_balance,
      COUNT(t.id) as transaction_count
    FROM projects p
    LEFT JOIN transactions t ON t.project_id = p.id
    GROUP BY p.id
    ORDER BY p.created_at DESC
  `;
  db.all(sql, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

router.get('/:id', (req, res) => {
  db.get('SELECT * FROM projects WHERE id = ?', [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Project not found' });
    res.json(row);
  });
});

router.post('/', (req, res) => {
  const { name, description, client, start_date, end_date, budget, currency, status } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Project name is required' });
  const sql = `INSERT INTO projects (name, description, client, start_date, end_date, budget, currency, status)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
  db.run(sql, [name.trim(), description||'', client||'', start_date||null, end_date||null, budget||0, currency||'USD', status||'active'], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    db.get('SELECT * FROM projects WHERE id = ?', [this.lastID], (err2, row) => res.status(201).json(row));
  });
});

router.put('/:id', (req, res) => {
  const { name, description, client, start_date, end_date, budget, currency, status } = req.body;
  db.get('SELECT * FROM projects WHERE id = ?', [req.params.id], (err, existing) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!existing) return res.status(404).json({ error: 'Project not found' });
    const sql = `UPDATE projects SET name=?, description=?, client=?, start_date=?, end_date=?, budget=?, currency=?, status=? WHERE id=?`;
    db.run(sql, [
      name||existing.name, description!==undefined?description:existing.description,
      client!==undefined?client:existing.client, start_date||existing.start_date,
      end_date||existing.end_date, budget!==undefined?budget:existing.budget,
      currency||existing.currency, status||existing.status, req.params.id
    ], function(err2) {
      if (err2) return res.status(500).json({ error: err2.message });
      db.get('SELECT * FROM projects WHERE id = ?', [req.params.id], (e, row) => res.json(row));
    });
  });
});

router.delete('/:id', (req, res) => {
  db.run('DELETE FROM projects WHERE id = ?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Project not found' });
    res.json({ message: 'Project deleted', id: Number(req.params.id) });
  });
});

module.exports = router;
