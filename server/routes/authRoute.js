const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');
const db      = require('../database');

// In-memory session store (cleared on server restart — by design for local app)
const sessions = new Set();

function getSetting(key, cb) {
  db.get('SELECT value FROM settings WHERE key = ?', [key], (err, row) => {
    cb(err, row ? row.value : null);
  });
}

function setSetting(key, value, cb) {
  db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value], cb);
}

// ── Login ─────────────────────────────────────────────────────
router.post('/login', (req, res) => {
  const { username, password } = req.body;

  getSetting('admin_username', (e1, storedUser) => {
    getSetting('admin_password', (e2, storedPass) => {
      if (e1 || e2) return res.status(500).json({ success: false, message: 'Server error' });

      if (username === storedUser && password === storedPass) {
        const token = crypto.randomBytes(32).toString('hex');
        sessions.add(token);
        res.json({ success: true, token, username: storedUser });
      } else {
        res.status(401).json({ success: false, message: 'Invalid username or password' });
      }
    });
  });
});

// ── Logout ────────────────────────────────────────────────────
router.post('/logout', (req, res) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  sessions.delete(token);
  res.json({ success: true });
});

// ── Verify token ──────────────────────────────────────────────
router.get('/verify', (req, res) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  res.json({ valid: !!(token && sessions.has(token)) });
});

// ── Change password ───────────────────────────────────────────
router.post('/change-password', (req, res) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!sessions.has(token)) return res.status(401).json({ success: false, message: 'Not authenticated' });

  const { current_password, new_password } = req.body;
  if (!current_password || !new_password)
    return res.status(400).json({ success: false, message: 'Both current and new password are required' });

  if (new_password.length < 6)
    return res.status(400).json({ success: false, message: 'New password must be at least 6 characters' });

  getSetting('admin_password', (err, storedPass) => {
    if (err) return res.status(500).json({ success: false, message: 'Server error' });

    if (current_password !== storedPass)
      return res.status(401).json({ success: false, message: 'Current password is incorrect' });

    setSetting('admin_password', new_password, (e2) => {
      if (e2) return res.status(500).json({ success: false, message: 'Failed to save new password' });

      // Invalidate all existing sessions so user must log in again
      sessions.clear();
      res.json({ success: true, message: 'Password changed successfully. Please log in again.' });
    });
  });
});

module.exports = router;
