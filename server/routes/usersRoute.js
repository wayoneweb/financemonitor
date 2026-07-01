const express = require('express');
const router  = express.Router();
const db      = require('../database');

// Lazy-load to avoid circular require issues at module init time
const auth = () => require('./authRoute');

const adminOnly = (req, res, next) => auth().requireAdmin(req, res, next);

// GET /api/users
router.get('/', adminOnly, (req, res) => {
  db.all(
    'SELECT id, username, role, is_active, created_at, updated_at FROM users ORDER BY id',
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Server error' });
      res.json(rows);
    }
  );
});

// POST /api/users — create
router.post('/', adminOnly, (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password || !role)
    return res.status(400).json({ error: 'username, password and role are required' });
  if (!['admin', 'staff', 'accountant'].includes(role))
    return res.status(400).json({ error: 'Invalid role' });
  if (password.length < 6)
    return res.status(400).json({ error: 'Password must be at least 6 characters' });

  db.run(
    'INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
    [username.trim(), password, role],
    function (err) {
      if (err) {
        if (err.message.includes('UNIQUE')) return res.status(409).json({ error: 'Username already exists' });
        return res.status(500).json({ error: 'Server error' });
      }
      db.get(
        'SELECT id, username, role, is_active, created_at, updated_at FROM users WHERE id=?',
        [this.lastID],
        (e2, row) => res.status(201).json(row)
      );
    }
  );
});

// PUT /api/users/:id — update
router.put('/:id', adminOnly, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { username, password, role, is_active } = req.body;

  if (role !== undefined && !['admin', 'staff', 'accountant'].includes(role))
    return res.status(400).json({ error: 'Invalid role' });
  if (password !== undefined && password !== '' && password.length < 6)
    return res.status(400).json({ error: 'Password must be at least 6 characters' });

  const sets = [];
  const vals = [];
  if (username  !== undefined)  { sets.push('username=?');  vals.push(username.trim()); }
  if (password  !== undefined && password !== '') { sets.push('password=?');  vals.push(password); }
  if (role      !== undefined)  { sets.push('role=?');      vals.push(role); }
  if (is_active !== undefined)  { sets.push('is_active=?'); vals.push(is_active ? 1 : 0); }

  if (sets.length === 0) return res.status(400).json({ error: 'Nothing to update' });
  sets.push('updated_at=CURRENT_TIMESTAMP');
  vals.push(id);

  db.run(`UPDATE users SET ${sets.join(',')} WHERE id=?`, vals, function (err) {
    if (err) {
      if (err.message.includes('UNIQUE')) return res.status(409).json({ error: 'Username already exists' });
      return res.status(500).json({ error: 'Server error' });
    }
    if (this.changes === 0) return res.status(404).json({ error: 'User not found' });

    // Kick out user if password changed or account deactivated
    if (password || is_active === false || is_active === 0) {
      const sessions = auth().sessions;
      for (const [tok, u] of sessions.entries()) {
        if (u.id === id) sessions.delete(tok);
      }
    }

    db.get(
      'SELECT id, username, role, is_active, created_at, updated_at FROM users WHERE id=?',
      [id],
      (e2, row) => res.json(row)
    );
  });
});

// DELETE /api/users/:id
router.delete('/:id', adminOnly, (req, res) => {
  const id   = parseInt(req.params.id, 10);
  const self = req.user.id;

  if (id === self) return res.status(400).json({ error: 'Cannot delete your own account' });

  db.get("SELECT COUNT(*) as cnt FROM users WHERE role='admin' AND is_active=1", [], (err, row) => {
    if (err) return res.status(500).json({ error: 'Server error' });

    db.get('SELECT role FROM users WHERE id=?', [id], (e2, target) => {
      if (!target) return res.status(404).json({ error: 'User not found' });

      if (target.role === 'admin' && row.cnt <= 1)
        return res.status(400).json({ error: 'Cannot delete the last admin account' });

      db.run('DELETE FROM users WHERE id=?', [id], function (e3) {
        if (e3) return res.status(500).json({ error: 'Server error' });
        const sessions = auth().sessions;
        for (const [tok, u] of sessions.entries()) {
          if (u.id === id) sessions.delete(tok);
        }
        res.json({ success: true });
      });
    });
  });
});

module.exports = router;
