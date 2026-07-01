const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');
const db      = require('../database');

// In-memory session store: token -> { id, username, role }
const sessions = new Map();

const requireAuth = (req, res, next) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token || !sessions.has(token)) return res.status(401).json({ error: 'Unauthorized' });
  req.user = sessions.get(token);
  next();
};

const requireAdmin = (req, res, next) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token || !sessions.has(token)) return res.status(401).json({ error: 'Unauthorized' });
  const user = sessions.get(token);
  if (user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  req.user = user;
  next();
};

// ── Login ─────────────────────────────────────────────────────
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ success: false, message: 'Username and password are required' });

  db.get(
    'SELECT id, username, password, role, is_active FROM users WHERE username = ?',
    [username.trim()],
    (err, user) => {
      if (err) return res.status(500).json({ success: false, message: 'Server error' });
      if (!user || user.password !== password)
        return res.status(401).json({ success: false, message: 'Invalid username or password' });
      if (!user.is_active)
        return res.status(403).json({ success: false, message: 'Account is disabled. Contact admin.' });

      const token = crypto.randomBytes(32).toString('hex');
      sessions.set(token, { id: user.id, username: user.username, role: user.role });
      res.json({ success: true, token, username: user.username, role: user.role });
    }
  );
});

// ── Logout ────────────────────────────────────────────────────
router.post('/logout', (req, res) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  sessions.delete(token);
  res.json({ success: true });
});

// ── Verify ────────────────────────────────────────────────────
router.get('/verify', (req, res) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const valid = !!(token && sessions.has(token));
  const user  = valid ? sessions.get(token) : null;
  res.json({ valid, role: user ? user.role : null, username: user ? user.username : null });
});

// ── Change own password ───────────────────────────────────────
router.post('/change-password', requireAuth, (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password)
    return res.status(400).json({ success: false, message: 'Both current and new password are required' });
  if (new_password.length < 6)
    return res.status(400).json({ success: false, message: 'New password must be at least 6 characters' });

  const userId = req.user.id;
  db.get('SELECT password FROM users WHERE id = ?', [userId], (err, row) => {
    if (err || !row) return res.status(500).json({ success: false, message: 'Server error' });
    if (row.password !== current_password)
      return res.status(401).json({ success: false, message: 'Current password is incorrect' });

    db.run(
      'UPDATE users SET password=?, updated_at=CURRENT_TIMESTAMP WHERE id=?',
      [new_password, userId],
      (e2) => {
        if (e2) return res.status(500).json({ success: false, message: 'Failed to save new password' });
        // Invalidate all sessions for this user
        for (const [tok, u] of sessions.entries()) {
          if (u.id === userId) sessions.delete(tok);
        }
        res.json({ success: true, message: 'Password changed successfully. Please log in again.' });
      }
    );
  });
});

module.exports = router;
module.exports.sessions    = sessions;
module.exports.requireAuth  = requireAuth;
module.exports.requireAdmin = requireAdmin;
