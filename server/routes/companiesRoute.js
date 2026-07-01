const express = require('express');
const db      = require('../database');
const router  = express.Router();
const { seedDefaultsForCompany } = require('../lib/accountingSeed');

// ── Companies (books) ──────────────────────────────────────────
// Reuses inv_companies (already holds name/address/GSTIN/PAN/bank details for
// invoice letterheads) as the master "Company" record for the accounting module.

router.get('/', (req, res) => {
  db.all(`SELECT * FROM inv_companies ORDER BY is_default DESC, name ASC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

router.post('/', (req, res) => {
  const b = req.body;
  if (!b.name || !String(b.name).trim())
    return res.status(400).json({ error: 'Company name is required.' });
  db.run(
    `INSERT INTO inv_companies (name, address, city, state, pincode, country, phone, email, gstin, pan, fiscal_year_start_month, books_begin_date)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [b.name.trim(), b.address||'', b.city||'', b.state||'', b.pincode||'', b.country||'India',
     b.phone||'', b.email||'', b.gstin||'', b.pan||'',
     parseInt(b.fiscal_year_start_month)||4, b.books_begin_date||null],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      const companyId = this.lastID;
      seedDefaultsForCompany(db, companyId, () => {
        db.get('SELECT * FROM inv_companies WHERE id=?', [companyId], (_e, row) => res.json(row));
      });
    }
  );
});

router.put('/:id', (req, res) => {
  const b = req.body;
  db.run(
    `UPDATE inv_companies SET name=?, address=?, city=?, state=?, pincode=?, country=?, phone=?, email=?, gstin=?, pan=?,
       fiscal_year_start_month=?, books_begin_date=?, is_active=? WHERE id=?`,
    [b.name||'', b.address||'', b.city||'', b.state||'', b.pincode||'', b.country||'India',
     b.phone||'', b.email||'', b.gstin||'', b.pan||'',
     parseInt(b.fiscal_year_start_month)||4, b.books_begin_date||null,
     b.is_active !== undefined ? (b.is_active ? 1 : 0) : 1, req.params.id],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      db.get('SELECT * FROM inv_companies WHERE id=?', [req.params.id], (_e, row) => res.json(row));
    }
  );
});

module.exports = router;
