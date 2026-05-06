const express = require('express');
const router = express.Router();
const db = require('../database');

router.get('/', (req, res) => {
  const { type } = req.query;
  let sql = `SELECT c.*,
    (SELECT COUNT(*) FROM transactions t WHERE t.category_id = c.id) as transaction_count
    FROM categories c`;
  const params = [];
  if (type) { sql += ' WHERE c.type = ?'; params.push(type); }
  sql += ' ORDER BY c.type, c.name';
  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

router.post('/', (req, res) => {
  const { name, type, color } = req.body;
  if (!name || !type) return res.status(400).json({ error: 'Name and type are required' });
  db.run('INSERT INTO categories (name, type, color) VALUES (?, ?, ?)',
    [name.trim(), type, color || '#667eea'], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      db.get('SELECT * FROM categories WHERE id = ?', [this.lastID], (e, row) => res.status(201).json(row));
    });
});

router.put('/:id', (req, res) => {
  const { name, type, color } = req.body;
  db.get('SELECT * FROM categories WHERE id = ?', [req.params.id], (err, existing) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!existing) return res.status(404).json({ error: 'Category not found' });
    db.run('UPDATE categories SET name=?, type=?, color=? WHERE id=?',
      [name||existing.name, type||existing.type, color||existing.color, req.params.id],
      function(err2) {
        if (err2) return res.status(500).json({ error: err2.message });
        db.get('SELECT * FROM categories WHERE id = ?', [req.params.id], (e, row) => res.json(row));
      });
  });
});

router.delete('/:id', (req, res) => {
  db.run('DELETE FROM categories WHERE id = ?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted', id: Number(req.params.id) });
  });
});

module.exports = router;
