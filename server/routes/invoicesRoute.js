'use strict';
const express     = require('express');
const multer      = require('multer');
const path        = require('path');
const fs          = require('fs');
const PDFDocument = require('pdfkit');
const db          = require('../database');

const router = express.Router();

// ── Logo upload ───────────────────────────────────────────────
const logoDir = path.join(__dirname, '../uploads/logos');
if (!fs.existsSync(logoDir)) fs.mkdirSync(logoDir, { recursive: true });

const logoUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, logoDir),
    filename:    (_req, file, cb) => cb(null, `logo_${Date.now()}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits:     { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => file.mimetype.startsWith('image/') ? cb(null, true) : cb(new Error('Images only')),
});

// ── Helpers ───────────────────────────────────────────────────
const symFor = (c) => c === 'USD' ? '$' : c === 'EUR' ? '€' : c === 'GBP' ? '£' : 'Rs.';
const fmtCur = (n, sym) => `${sym} ${Number(n || 0).toFixed(2)}`;
const isLt   = (hex) => {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return (0.299*r + 0.587*g + 0.114*b) > 186;
};
const rgba   = (hex, a) => {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${a})`;
};

// ── Company Profiles ──────────────────────────────────────────

router.get('/companies', (_req, res) => {
  db.all('SELECT * FROM inv_companies ORDER BY is_default DESC, name ASC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

router.post('/companies', logoUpload.single('logo'), (req, res) => {
  const b = req.body;
  const logo = req.file ? `logos/${req.file.filename}` : (b.logo || '');
  db.run(
    `INSERT INTO inv_companies (name,address,city,state,pincode,country,phone,email,website,gstin,pan,logo,bank_name,bank_ac,bank_ifsc,bank_branch,is_default)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [b.name||'',b.address||'',b.city||'',b.state||'',b.pincode||'',b.country||'India',
     b.phone||'',b.email||'',b.website||'',b.gstin||'',b.pan||'',logo,
     b.bank_name||'',b.bank_ac||'',b.bank_ifsc||'',b.bank_branch||'',b.is_default?1:0],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      db.get('SELECT * FROM inv_companies WHERE id=?', [this.lastID], (_e, row) => res.json(row));
    }
  );
});

router.put('/companies/:id', logoUpload.single('logo'), (req, res) => {
  const { id } = req.params, b = req.body;
  db.get('SELECT logo FROM inv_companies WHERE id=?', [id], (err, existing) => {
    if (err || !existing) return res.status(404).json({ error: 'Not found' });
    let logo = existing.logo;
    if (req.file) {
      if (logo) { const op = path.join(__dirname, '../uploads', logo); if (fs.existsSync(op)) fs.unlinkSync(op); }
      logo = `logos/${req.file.filename}`;
    } else if (b.remove_logo === '1') {
      logo = '';
    }
    if (b.is_default === '1' || b.is_default === 1) db.run('UPDATE inv_companies SET is_default=0');
    db.run(
      `UPDATE inv_companies SET name=?,address=?,city=?,state=?,pincode=?,country=?,phone=?,email=?,website=?,gstin=?,pan=?,logo=?,bank_name=?,bank_ac=?,bank_ifsc=?,bank_branch=?,is_default=? WHERE id=?`,
      [b.name||'',b.address||'',b.city||'',b.state||'',b.pincode||'',b.country||'India',
       b.phone||'',b.email||'',b.website||'',b.gstin||'',b.pan||'',logo,
       b.bank_name||'',b.bank_ac||'',b.bank_ifsc||'',b.bank_branch||'',b.is_default?1:0,id],
      (e2) => {
        if (e2) return res.status(500).json({ error: e2.message });
        db.get('SELECT * FROM inv_companies WHERE id=?', [id], (_e, row) => res.json(row));
      }
    );
  });
});

router.delete('/companies/:id', (req, res) => {
  db.get('SELECT logo FROM inv_companies WHERE id=?', [req.params.id], (_e, row) => {
    if (row && row.logo) { const p = path.join(__dirname, '../uploads', row.logo); if (fs.existsSync(p)) fs.unlinkSync(p); }
    db.run('DELETE FROM inv_companies WHERE id=?', [req.params.id], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    });
  });
});

// ── Next Number ───────────────────────────────────────────────
router.get('/next-number', (req, res) => {
  const type   = req.query.type === 'quotation' ? 'quotation' : 'invoice';
  const prefix = (type === 'quotation' ? 'QUO' : 'INV') + '-' + new Date().getFullYear() + '-';
  db.get('SELECT inv_number FROM invoices WHERE doc_type=? ORDER BY id DESC LIMIT 1', [type], (_err, row) => {
    let next = 1;
    if (row && row.inv_number) {
      const n = parseInt(row.inv_number.split('-').pop());
      if (!isNaN(n)) next = n + 1;
    }
    res.json({ number: prefix + String(next).padStart(4, '0') });
  });
});

// ── Invoice List ──────────────────────────────────────────────
router.get('/', (req, res) => {
  const { type, status, project_id, search } = req.query;
  const conds = [], params = [];
  if (type)       { conds.push('doc_type=?');   params.push(type); }
  if (status)     { conds.push('status=?');      params.push(status); }
  if (project_id) { conds.push('project_id=?'); params.push(project_id); }
  if (search)     {
    conds.push('(to_name LIKE ? OR inv_number LIKE ? OR from_name LIKE ?)');
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
  db.all(`SELECT * FROM invoices ${where} ORDER BY created_at DESC`, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

// ── Single Invoice ────────────────────────────────────────────
router.get('/:id', (req, res) => {
  db.get('SELECT * FROM invoices WHERE id=?', [req.params.id], (err, inv) => {
    if (err || !inv) return res.status(404).json({ error: 'Not found' });
    db.all('SELECT * FROM invoice_items WHERE invoice_id=? ORDER BY sort_order, id', [req.params.id], (_e, items) => {
      res.json({ ...inv, items: items || [] });
    });
  });
});

// ── Save Helper ───────────────────────────────────────────────
function saveInvoice(body, items, id, cb) {
  const b       = body;
  const iList   = Array.isArray(items) ? items : [];
  const subtotal = iList.reduce((s, it) => s + (parseFloat(it.amount) || 0), 0);
  const taxRate  = parseFloat(b.tax_rate) || 0;
  const taxAmt   = (b.tax_amount !== undefined && b.tax_amount !== '')
                   ? parseFloat(b.tax_amount) || 0
                   : subtotal * taxRate / 100;
  const disc     = parseFloat(b.discount) || 0;
  const shipping = parseFloat(b.shipping) || 0;
  const total    = subtotal + taxAmt - disc + shipping;
  const amtPaid  = parseFloat(b.amount_paid) || 0;

  const cols = [
    b.inv_number||'', b.doc_type||'invoice', b.template||'modern-blue',
    b.company_id||null,
    b.from_name||'', b.from_address||'', b.from_city||'', b.from_state||'', b.from_pincode||'',
    b.from_phone||'', b.from_email||'', b.from_gstin||'', b.from_logo||'',
    b.from_bank_name||'', b.from_bank_ac||'', b.from_bank_ifsc||'', b.from_bank_branch||'',
    b.to_name||'', b.to_address||'', b.to_city||'', b.to_state||'', b.to_pincode||'',
    b.to_phone||'', b.to_email||'', b.to_gstin||'',
    b.date||'', b.due_date||'', b.valid_until||'', b.po_number||'', b.currency||'INR',
    subtotal, b.tax_label||'GST', taxRate, taxAmt, disc, b.discount_type||'amount',
    shipping, total, amtPaid, Math.max(0, total - amtPaid),
    b.notes||'', b.terms||'', b.status||'draft',
    b.is_project_inv ? 1 : 0, b.project_id||null,
    b.payment_mode||'', b.payment_date||'', b.payment_ref||'', b.txn_created?1:0,
  ];

  const onItems = (invId) => {
    if (iList.length === 0) return cb(null, invId);
    db.run('DELETE FROM invoice_items WHERE invoice_id=?', [invId], () => {
      const stmt = db.prepare(
        `INSERT INTO invoice_items (invoice_id,description,details,hsn_sac,qty,unit,rate,tax_rate,amount,sort_order) VALUES (?,?,?,?,?,?,?,?,?,?)`
      );
      iList.forEach((it, idx) => {
        const qty = parseFloat(it.qty) || 1, rate = parseFloat(it.rate) || 0;
        stmt.run([invId, it.description||'', it.details||'', it.hsn_sac||'',
                  qty, it.unit||'pcs', rate, parseFloat(it.tax_rate)||0,
                  parseFloat(it.amount) || qty*rate, idx]);
      });
      stmt.finalize(() => cb(null, invId));
    });
  };

  if (id) {
    db.run(
      `UPDATE invoices SET
        inv_number=?,doc_type=?,template=?,company_id=?,
        from_name=?,from_address=?,from_city=?,from_state=?,from_pincode=?,from_phone=?,from_email=?,from_gstin=?,from_logo=?,
        from_bank_name=?,from_bank_ac=?,from_bank_ifsc=?,from_bank_branch=?,
        to_name=?,to_address=?,to_city=?,to_state=?,to_pincode=?,to_phone=?,to_email=?,to_gstin=?,
        date=?,due_date=?,valid_until=?,po_number=?,currency=?,
        subtotal=?,tax_label=?,tax_rate=?,tax_amount=?,discount=?,discount_type=?,shipping=?,total=?,amount_paid=?,balance_due=?,
        notes=?,terms=?,status=?,is_project_inv=?,project_id=?,payment_mode=?,payment_date=?,payment_ref=?,txn_created=?,
        updated_at=CURRENT_TIMESTAMP WHERE id=?`,
      [...cols, id],
      (err) => { if (err) return cb(err); onItems(id); }
    );
  } else {
    db.run(
      `INSERT INTO invoices (inv_number,doc_type,template,company_id,
        from_name,from_address,from_city,from_state,from_pincode,from_phone,from_email,from_gstin,from_logo,
        from_bank_name,from_bank_ac,from_bank_ifsc,from_bank_branch,
        to_name,to_address,to_city,to_state,to_pincode,to_phone,to_email,to_gstin,
        date,due_date,valid_until,po_number,currency,
        subtotal,tax_label,tax_rate,tax_amount,discount,discount_type,shipping,total,amount_paid,balance_due,
        notes,terms,status,is_project_inv,project_id,payment_mode,payment_date,payment_ref,txn_created)
       VALUES (${cols.map(() => '?').join(',')})`,
      cols,
      function(err) { if (err) return cb(err); onItems(this.lastID); }
    );
  }
}

router.post('/', (req, res) => {
  const { items, ...body } = req.body;
  saveInvoice(body, items, null, (err, id) => {
    if (err) return res.status(500).json({ error: err.message });
    db.get('SELECT * FROM invoices WHERE id=?', [id], (_e, inv) => {
      db.all('SELECT * FROM invoice_items WHERE invoice_id=? ORDER BY sort_order', [id], (_e2, its) => {
        res.json({ ...inv, items: its || [] });
      });
    });
  });
});

router.put('/:id', (req, res) => {
  const { items, ...body } = req.body;
  saveInvoice(body, items, req.params.id, (err) => {
    if (err) return res.status(500).json({ error: err.message });
    db.get('SELECT * FROM invoices WHERE id=?', [req.params.id], (_e, inv) => {
      db.all('SELECT * FROM invoice_items WHERE invoice_id=? ORDER BY sort_order', [req.params.id], (_e2, its) => {
        res.json({ ...inv, items: its || [] });
      });
    });
  });
});

router.delete('/:id', (req, res) => {
  db.run('DELETE FROM invoices WHERE id=?', [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// ── Record Payment (project invoices → creates transaction) ───
router.post('/:id/pay', (req, res) => {
  const { payment_mode, payment_date, payment_ref, amount_paid, notes } = req.body;
  db.get('SELECT * FROM invoices WHERE id=?', [req.params.id], (err, inv) => {
    if (err || !inv) return res.status(404).json({ error: 'Not found' });
    const paid      = parseFloat(amount_paid) || inv.total;
    const balance   = Math.max(0, inv.total - paid);
    const newStatus = paid >= inv.total ? 'paid' : 'sent';
    db.run(
      `UPDATE invoices SET payment_mode=?,payment_date=?,payment_ref=?,amount_paid=?,balance_due=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,
      [payment_mode||'', payment_date||'', payment_ref||'', paid, balance, newStatus, inv.id],
      (e2) => {
        if (e2) return res.status(500).json({ error: e2.message });
        if (inv.is_project_inv && inv.project_id && !inv.txn_created && newStatus === 'paid') {
          const today = new Date().toISOString().slice(0, 10);
          db.run(
            `INSERT INTO transactions (project_id,type,title,amount,date,payment_method,party_name,reference_no,notes,status,currency)
             VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
            [inv.project_id, 'income',
             `${inv.doc_type === 'quotation' ? 'Quotation' : 'Invoice'} #${inv.inv_number} — ${inv.to_name}`,
             paid, payment_date || today, payment_mode || 'bank_transfer',
             inv.to_name, inv.inv_number,
             notes || `Payment received for ${inv.doc_type} ${inv.inv_number}`,
             'confirmed', inv.currency || 'INR'],
            function(e3) { if (!e3) db.run('UPDATE invoices SET txn_created=1 WHERE id=?', [inv.id]); }
          );
        }
        db.get('SELECT * FROM invoices WHERE id=?', [inv.id], (_e, updated) => res.json(updated));
      }
    );
  });
});

// ── 15 Template Configurations ────────────────────────────────
// Layout A = Bold banner header (8 templates)
// Layout B = Clean bordered / minimal (4 templates)
// Layout C = Dark executive / dark page (3 templates)
const TEMPLATES = {
  'modern-blue':    { hBg:'#1e3a8a', hFg:'#ffffff', tHBg:'#1e3a8a', tHFg:'#dbeafe', altBg:'#f0f9ff', totBg:'#1e3a8a', totFg:'#ffffff', border:'#bfdbfe', accent:'#3b82f6', infoBg:'#eff6ff', textDk:'#1e293b', layout:'A', name:'Modern Blue'    },
  'classic-gray':   { hBg:'#374151', hFg:'#ffffff', tHBg:'#374151', tHFg:'#f9fafb', altBg:'#f9fafb', totBg:'#111827', totFg:'#ffffff', border:'#d1d5db', accent:'#6b7280', infoBg:'#f3f4f6', textDk:'#1f2937', layout:'A', name:'Classic Gray'    },
  'emerald-green':  { hBg:'#064e3b', hFg:'#ffffff', tHBg:'#065f46', tHFg:'#d1fae5', altBg:'#f0fdf4', totBg:'#064e3b', totFg:'#ffffff', border:'#a7f3d0', accent:'#10b981', infoBg:'#ecfdf5', textDk:'#1e293b', layout:'A', name:'Emerald Green'   },
  'coral-orange':   { hBg:'#7c2d12', hFg:'#ffffff', tHBg:'#9a3412', tHFg:'#fed7aa', altBg:'#fff7ed', totBg:'#7c2d12', totFg:'#ffffff', border:'#fdba74', accent:'#ea580c', infoBg:'#fff7ed', textDk:'#1e293b', layout:'A', name:'Coral Orange'    },
  'deep-purple':    { hBg:'#4c1d95', hFg:'#ffffff', tHBg:'#5b21b6', tHFg:'#ede9fe', altBg:'#faf5ff', totBg:'#4c1d95', totFg:'#ffffff', border:'#c4b5fd', accent:'#8b5cf6', infoBg:'#f5f3ff', textDk:'#1e293b', layout:'A', name:'Deep Purple'     },
  'teal-ocean':     { hBg:'#0f766e', hFg:'#ffffff', tHBg:'#0d9488', tHFg:'#ccfbf1', altBg:'#f0fdfa', totBg:'#0f766e', totFg:'#ffffff', border:'#5eead4', accent:'#14b8a6', infoBg:'#f0fdfa', textDk:'#1e293b', layout:'A', name:'Teal Ocean'      },
  'rose-pink':      { hBg:'#9f1239', hFg:'#ffffff', tHBg:'#be123c', tHFg:'#ffe4e6', altBg:'#fff1f2', totBg:'#9f1239', totFg:'#ffffff', border:'#fda4af', accent:'#f43f5e', infoBg:'#fff1f2', textDk:'#1e293b', layout:'A', name:'Rose Pink'       },
  'forest-deep':    { hBg:'#14532d', hFg:'#ffffff', tHBg:'#166534', tHFg:'#bbf7d0', altBg:'#f0fdf4', totBg:'#14532d', totFg:'#ffffff', border:'#86efac', accent:'#22c55e', infoBg:'#f0fdf4', textDk:'#1e293b', layout:'A', name:'Forest Deep'     },
  'minimal-clean':  { hBg:'#ffffff', hFg:'#0f172a', tHBg:'#f1f5f9', tHFg:'#0f172a', altBg:'#f8fafc', totBg:'#0f172a', totFg:'#ffffff', border:'#e2e8f0', accent:'#3b82f6', infoBg:'#f8fafc', textDk:'#0f172a', layout:'B', name:'Minimal Clean'   },
  'amber-warm':     { hBg:'#fffbeb', hFg:'#78350f', tHBg:'#fef3c7', tHFg:'#78350f', altBg:'#fffbeb', totBg:'#b45309', totFg:'#ffffff', border:'#fde68a', accent:'#d97706', infoBg:'#fffbeb', textDk:'#78350f', layout:'B', name:'Amber Warm'      },
  'monochrome':     { hBg:'#ffffff', hFg:'#000000', tHBg:'#000000', tHFg:'#ffffff', altBg:'#f4f4f4', totBg:'#000000', totFg:'#ffffff', border:'#d4d4d4', accent:'#171717', infoBg:'#f5f5f5', textDk:'#000000', layout:'B', name:'Monochrome'      },
  'corporate-red':  { hBg:'#ffffff', hFg:'#0f172a', tHBg:'#fee2e2', tHFg:'#7f1d1d', altBg:'#fef2f2', totBg:'#991b1b', totFg:'#ffffff', border:'#fca5a5', accent:'#dc2626', infoBg:'#fef2f2', textDk:'#1e293b', layout:'B', name:'Corporate Red'   },
  'dark-executive': { hBg:'#0f172a', hFg:'#f8fafc', tHBg:'#1e293b', tHFg:'#7dd3fc', altBg:'#1e293b', totBg:'#0284c7', totFg:'#ffffff', border:'#334155', accent:'#38bdf8', infoBg:'#1e293b', textDk:'#f8fafc', layout:'C', name:'Dark Executive'  },
  'gold-luxury':    { hBg:'#1c1917', hFg:'#fef3c7', tHBg:'#292524', tHFg:'#fbbf24', altBg:'#292524', totBg:'#d97706', totFg:'#1c1917', border:'#57534e', accent:'#f59e0b', infoBg:'#292524', textDk:'#fef3c7', layout:'C', name:'Gold Luxury'     },
  'midnight-navy':  { hBg:'#0f0f23', hFg:'#e0e7ff', tHBg:'#1e1b4b', tHFg:'#a5b4fc', altBg:'#1e1b4b', totBg:'#4338ca', totFg:'#ffffff', border:'#3730a3', accent:'#818cf8', infoBg:'#1e1b4b', textDk:'#e0e7ff', layout:'C', name:'Midnight Navy'   },
};

// ── PDF Generation ────────────────────────────────────────────
router.get('/:id/pdf', (req, res) => {
  db.get('SELECT * FROM invoices WHERE id=?', [req.params.id], (err, inv) => {
    if (err || !inv) return res.status(404).json({ error: 'Not found' });

    db.all('SELECT * FROM invoice_items WHERE invoice_id=? ORDER BY sort_order, id', [req.params.id], (_e, items) => {
      const tpl  = TEMPLATES[inv.template] || TEMPLATES['modern-blue'];
      const isQ  = inv.doc_type === 'quotation';
      const sym  = symFor(inv.currency);
      const fmt  = (n) => fmtCur(n, sym);
      const lbl  = isQ ? 'QUOTATION' : 'INVOICE';

      // A4 Portrait: 595.28 × 841.89 pt; 1-inch (72pt) margins
      const PW = 595.28, PH = 841.89, M = 72, CW = PW - M * 2; // CW = 451.28

      const doc = new PDFDocument({ size: 'A4', margin: 0 });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${inv.doc_type}-${inv.inv_number}.pdf"`);
      doc.pipe(res);

      const drawLogo = (logoPath, x, y, mw, mh) => {
        if (!logoPath) return;
        const full = path.join(__dirname, '../uploads', logoPath);
        if (!fs.existsSync(full)) return;
        try { doc.image(full, x, y, { fit: [mw, mh] }); } catch (_) {}
      };

      // ── Shared totals drawing helper ──────────────────────────
      const drawTotals = (totX, y0, totW) => {
        let y = y0;
        const tRows = [
          ['Subtotal', fmt(inv.subtotal)],
          [`${inv.tax_label||'GST'} (${inv.tax_rate||0}%)`, fmt(inv.tax_amount)],
          ['Discount', `− ${fmt(inv.discount)}`],
        ];
        if (inv.shipping > 0) tRows.push(['Shipping', fmt(inv.shipping)]);
        tRows.forEach(([tl, tv]) => {
          doc.fillColor('#64748b').font('Helvetica').fontSize(8).text(tl, totX, y, { width: totW*0.5 });
          doc.fillColor(tpl.textDk).font('Helvetica').fontSize(8).text(tv, totX+totW*0.5, y, { width: totW*0.5, align:'right' });
          y += 14;
        });
        y += 3;
        doc.rect(totX, y, totW, 26).fill(tpl.totBg);
        doc.fillColor(tpl.totFg).font('Helvetica-Bold').fontSize(9).text('TOTAL', totX+10, y+8, { width:totW*0.5-10, lineBreak:false });
        doc.fillColor(tpl.totFg).font('Helvetica-Bold').fontSize(11).text(fmt(inv.total), totX+10, y+8, { width:totW-20, align:'right', lineBreak:false });
        y += 36;
        if (inv.amount_paid > 0) {
          doc.fillColor('#059669').font('Helvetica').fontSize(8).text(`Paid: ${fmt(inv.amount_paid)}`, totX, y, { width:totW, align:'right' }); y += 13;
          doc.fillColor('#dc2626').font('Helvetica-Bold').fontSize(8.5).text(`Balance Due: ${fmt(inv.balance_due)}`, totX, y, { width:totW, align:'right' }); y += 16;
        }
        return y;
      };

      // ── Layout A: Bold colored banner ─────────────────────────
      if (tpl.layout === 'A') {
        const BH = 94;
        doc.rect(0, 0, PW, BH).fill(tpl.hBg);

        if (inv.from_logo) drawLogo(inv.from_logo, M, 14, 62, 62);
        const nX = inv.from_logo ? M+70 : M, nW = CW*0.56;
        const hfgDim = isLt(tpl.hBg) ? '#475569' : rgba(tpl.hFg, 0.65);

        doc.fillColor(tpl.hFg).font('Helvetica-Bold').fontSize(13).text(inv.from_name||'Company Name', nX, 18, { width:nW, lineBreak:false });
        doc.font('Helvetica').fontSize(7.5).fillColor(hfgDim);
        let hy = 35;
        [inv.from_address,
         [inv.from_city,inv.from_state,inv.from_pincode].filter(Boolean).join(', '),
         [inv.from_phone,inv.from_email].filter(Boolean).join('  |  '),
         inv.from_gstin && `GSTIN: ${inv.from_gstin}`,
        ].filter(Boolean).forEach(l => { doc.text(l, nX, hy, {width:nW, lineBreak:false}); hy += 11; });

        const rx = M + CW*0.62, rw = CW*0.38;
        doc.fillColor(tpl.hFg).font('Helvetica-Bold').fontSize(20).text(lbl, rx, 16, {width:rw, align:'right', lineBreak:false});
        doc.fillColor(hfgDim).font('Helvetica').fontSize(8.5).text(`# ${inv.inv_number}`, rx, 44, {width:rw, align:'right', lineBreak:false});

        let y = BH + 14;
        const bW = (CW-10)/2, b2X = M+bW+10;

        // Bill To box
        doc.rect(M, y, bW, 82).fill(tpl.infoBg);
        doc.fillColor(tpl.accent).font('Helvetica-Bold').fontSize(7).text('BILL TO', M+10, y+9);
        doc.fillColor(tpl.textDk).font('Helvetica-Bold').fontSize(9.5).text(inv.to_name||'—', M+10, y+21, {width:bW-20});
        let ty = y+36;
        doc.font('Helvetica').fontSize(7.5);
        [inv.to_address,[inv.to_city,inv.to_state,inv.to_pincode].filter(Boolean).join(', '),inv.to_phone,inv.to_email,inv.to_gstin&&`GSTIN: ${inv.to_gstin}`]
          .filter(Boolean).forEach(l => { doc.fillColor('#475569').text(l, M+10, ty, {width:bW-20, lineBreak:false}); ty += 11; });

        // Doc details box
        doc.rect(b2X, y, bW, 82).fill(tpl.infoBg);
        [[isQ?'Quotation Date':'Invoice Date', inv.date||'—'],
         [isQ?'Valid Until':'Due Date', (isQ?inv.valid_until:inv.due_date)||'—'],
         ['Reference No.', inv.po_number||inv.inv_number],
         ['Status', (inv.status||'draft').toUpperCase()],
        ].forEach(([dl, dv], i) => {
          const dy = y+9+i*17;
          doc.fillColor('#94a3b8').font('Helvetica').fontSize(7).text(dl, b2X+10, dy, {width:bW*0.46-10, lineBreak:false});
          doc.fillColor(tpl.textDk).font('Helvetica-Bold').fontSize(7.5).text(dv, b2X+bW*0.48, dy, {width:bW*0.52-10, align:'right', lineBreak:false});
        });
        y += 96;

        // Table (cols sum = 451)
        const cols = [{l:'#',w:20,a:'center'},{l:'Description',w:178,a:'left'},{l:'HSN/SAC',w:52,a:'center'},{l:'Qty',w:32,a:'center'},{l:'Unit',w:32,a:'center'},{l:'Rate',w:68,a:'right'},{l:'Amount',w:69,a:'right'}];
        const RH = 20;
        doc.rect(M, y, CW, 22).fill(tpl.tHBg);
        let cx = M;
        cols.forEach(c => { doc.fillColor(tpl.tHFg).font('Helvetica-Bold').fontSize(7).text(c.l, cx+3, y+7, {width:c.w-6, align:c.a, lineBreak:false}); cx += c.w; });
        y += 22;

        (items||[]).forEach((it, i) => {
          if (y+RH > PH-M) { doc.addPage(); y = M; }
          doc.rect(M, y, CW, RH).fill(i%2===0 ? tpl.altBg : '#ffffff');
          doc.strokeColor(tpl.border).lineWidth(0.3).moveTo(M,y+RH).lineTo(M+CW,y+RH).stroke();
          const vs = [String(i+1),it.description||'',it.hsn_sac||'—',String(it.qty||1),it.unit||'pcs',fmt(it.rate),fmt(it.amount)];
          cx = M;
          vs.forEach((v, ci) => {
            const bold = ci===1||ci===6;
            doc.fillColor(tpl.textDk).font(bold?'Helvetica-Bold':'Helvetica').fontSize(7.5)
               .text(v, cx+3, y+6, {width:cols[ci].w-6, align:cols[ci].a, lineBreak:false, ellipsis:true});
            cx += cols[ci].w;
          });
          if (it.details) doc.fillColor('#94a3b8').font('Helvetica').fontSize(6.5).text(it.details, M+24, y+13, {width:165, lineBreak:false, ellipsis:true});
          y += RH;
        });
        y += 10;
        y = drawTotals(M + CW - 188, y, 188);
        if (inv.from_bank_name||inv.from_bank_ac) {
          doc.fillColor(tpl.accent).font('Helvetica-Bold').fontSize(7).text('BANK DETAILS', M, y); y += 11;
          const bl = [inv.from_bank_name&&`Bank: ${inv.from_bank_name}`,inv.from_bank_ac&&`A/C: ${inv.from_bank_ac}`,inv.from_bank_ifsc&&`IFSC: ${inv.from_bank_ifsc}`,inv.from_bank_branch&&`Branch: ${inv.from_bank_branch}`].filter(Boolean).join('   |   ');
          doc.fillColor('#475569').font('Helvetica').fontSize(7.5).text(bl, M, y, {width:CW}); y += 16;
        }
        if (inv.notes) { doc.fillColor(tpl.accent).font('Helvetica-Bold').fontSize(7).text('NOTES', M, y); y+=10; doc.fillColor('#475569').font('Helvetica').fontSize(7.5).text(inv.notes, M, y, {width:CW}); y+=20; }
        if (inv.terms) { doc.fillColor(tpl.accent).font('Helvetica-Bold').fontSize(7).text('TERMS & CONDITIONS', M, y); y+=10; doc.fillColor('#475569').font('Helvetica').fontSize(7.5).text(inv.terms, M, y, {width:CW}); }
        doc.rect(0, PH-30, PW, 30).fill(tpl.tHBg);
        doc.fillColor(tpl.tHFg).font('Helvetica').fontSize(7).text(`${lbl} #${inv.inv_number}  ·  ${inv.from_name||''}  ·  Thank you for your business!`, M, PH-16, {width:CW, align:'center', lineBreak:false});

      // ── Layout B: Clean bordered ───────────────────────────────
      } else if (tpl.layout === 'B') {
        if (tpl.hBg !== '#ffffff') doc.rect(0,0,PW,PH).fill(tpl.hBg);
        const lW = CW*0.54, rW = CW*0.42, rX = M+CW-rW;

        if (inv.from_logo) drawLogo(inv.from_logo, M, M, 52, 44);
        const nY = inv.from_logo ? M+50 : M;
        doc.fillColor(tpl.hFg).font('Helvetica-Bold').fontSize(12).text(inv.from_name||'Company Name', M, nY, {width:lW});
        let inY = nY+17;
        [inv.from_address,[inv.from_city,inv.from_state,inv.from_pincode].filter(Boolean).join(', '),inv.from_phone&&`Ph: ${inv.from_phone}`,inv.from_email,inv.from_gstin&&`GSTIN: ${inv.from_gstin}`]
          .filter(Boolean).forEach(l => { doc.fillColor(isLt(tpl.hBg)?'#475569':tpl.textDk).font('Helvetica').fontSize(7.5).text(l, M, inY, {width:lW, lineBreak:false}); inY += 11; });

        doc.rect(rX, M, rW, 48).fill(tpl.tHBg);
        doc.rect(rX, M, rW, 48).lineWidth(0.4).stroke(tpl.border);
        doc.fillColor(tpl.tHFg).font('Helvetica-Bold').fontSize(18).text(lbl, rX, M+13, {width:rW, align:'center', lineBreak:false});

        let y = Math.max(inY+14, M+70);
        doc.rect(M, y, CW, 2).fill(tpl.accent);
        y += 12;
        const hW = (CW-10)/2, h2X = M+hW+10;
        doc.fillColor(tpl.accent).font('Helvetica-Bold').fontSize(7).text('BILL TO', M, y);
        doc.fillColor(tpl.accent).font('Helvetica-Bold').fontSize(7).text('DETAILS', h2X, y);
        y += 12;

        doc.fillColor(tpl.textDk).font('Helvetica-Bold').fontSize(9.5).text(inv.to_name||'—', M, y, {width:hW});
        let ty = y+15;
        [inv.to_address,[inv.to_city,inv.to_state,inv.to_pincode].filter(Boolean).join(', '),inv.to_phone,inv.to_email,inv.to_gstin&&`GSTIN: ${inv.to_gstin}`]
          .filter(Boolean).forEach(l => { doc.fillColor(isLt(tpl.hBg)?'#475569':tpl.textDk).font('Helvetica').fontSize(7.5).text(l, M, ty, {width:hW, lineBreak:false}); ty += 11; });

        [[isQ?'Number':'Invoice #',inv.inv_number],[isQ?'Date':'Invoice Date',inv.date||'—'],[isQ?'Valid Until':'Due Date',(isQ?inv.valid_until:inv.due_date)||'—'],['Status',(inv.status||'draft').toUpperCase()]]
          .forEach(([dl,dv],i) => {
            const dy = y+i*14;
            doc.fillColor('#94a3b8').font('Helvetica').fontSize(7).text(dl, h2X, dy, {width:hW*0.45, lineBreak:false});
            doc.fillColor(tpl.textDk).font('Helvetica-Bold').fontSize(7.5).text(dv, h2X+hW*0.48, dy, {width:hW*0.52-10, align:'right', lineBreak:false});
          });

        y = Math.max(y+70, ty+10);
        doc.strokeColor(tpl.border).lineWidth(0.5).moveTo(M,y).lineTo(M+CW,y).stroke();
        y += 10;

        // Table (cols sum = 451)
        const cols = [{l:'#',w:20,a:'center'},{l:'Description',w:195,a:'left'},{l:'HSN/SAC',w:52,a:'center'},{l:'Qty',w:32,a:'center'},{l:'Rate',w:80,a:'right'},{l:'Amount',w:72,a:'right'}];
        const RH = 20;
        doc.rect(M, y, CW, 22).fill(tpl.tHBg);
        doc.rect(M, y, CW, 22).lineWidth(0.4).stroke(tpl.border);
        let cx = M;
        cols.forEach(c => { doc.fillColor(tpl.tHFg).font('Helvetica-Bold').fontSize(7).text(c.l, cx+3, y+7, {width:c.w-6, align:c.a, lineBreak:false}); cx += c.w; });
        y += 22;

        (items||[]).forEach((it, i) => {
          if (y+RH > PH-M) { doc.addPage(); if (tpl.hBg!=='#ffffff') doc.rect(0,0,PW,PH).fill(tpl.hBg); y = M; }
          doc.rect(M, y, CW, RH).fill(i%2===0 ? tpl.altBg : (isLt(tpl.hBg)?'#ffffff':tpl.infoBg));
          doc.rect(M, y, CW, RH).lineWidth(0.3).stroke(tpl.border);
          cx = M;
          [String(i+1),it.description||'',it.hsn_sac||'—',String(it.qty||1),fmt(it.rate),fmt(it.amount)]
            .forEach((v, ci) => {
              doc.fillColor(tpl.textDk).font(ci===5?'Helvetica-Bold':'Helvetica').fontSize(7.5)
                 .text(v, cx+3, y+6, {width:cols[ci].w-6, align:cols[ci].a, lineBreak:false, ellipsis:true});
              cx += cols[ci].w;
            });
          y += RH;
        });
        y += 12;
        doc.strokeColor(tpl.accent).lineWidth(1).moveTo(M+CW-188, y).lineTo(M+CW, y).stroke(); y += 6;
        y = drawTotals(M+CW-188, y, 188);
        if (inv.notes) { doc.fillColor(tpl.accent).font('Helvetica-Bold').fontSize(7).text('NOTES', M, y); y+=10; doc.fillColor(isLt(tpl.hBg)?'#475569':tpl.textDk).font('Helvetica').fontSize(7.5).text(inv.notes, M, y, {width:CW}); y+=20; }
        if (inv.terms) { doc.fillColor(tpl.accent).font('Helvetica-Bold').fontSize(7).text('TERMS & CONDITIONS', M, y); y+=10; doc.fillColor(isLt(tpl.hBg)?'#475569':tpl.textDk).font('Helvetica').fontSize(7.5).text(inv.terms, M, y, {width:CW}); }
        doc.rect(0, PH-8, PW, 8).fill(tpl.accent);

      // ── Layout C: Dark executive ───────────────────────────────
      } else {
        doc.rect(0,0,PW,PH).fill(tpl.hBg);
        doc.rect(0,0,6,PH).fill(tpl.accent);
        if (inv.from_logo) drawLogo(inv.from_logo, PW-M-60, 18, 54, 54);
        doc.fillColor(tpl.hFg).font('Helvetica-Bold').fontSize(15).text(inv.from_name||'Company Name', M, 24, {width:CW*0.7, lineBreak:false});
        doc.fillColor(rgba(tpl.hFg, 0.5)).font('Helvetica').fontSize(7.5);
        let hy = 44;
        [inv.from_address,[inv.from_city,inv.from_state].filter(Boolean).join(', '),[inv.from_phone,inv.from_email].filter(Boolean).join('  |  ')]
          .filter(Boolean).forEach(l => { doc.text(l, M, hy, {width:CW*0.7, lineBreak:false}); hy += 11; });
        if (inv.from_gstin) { doc.fillColor(tpl.accent).font('Helvetica').fontSize(7.5).text(`GSTIN: ${inv.from_gstin}`, M, hy); }

        doc.fillColor(tpl.accent).font('Helvetica-Bold').fontSize(22).text(lbl, M, 70, {lineBreak:false});
        doc.fillColor(rgba(tpl.hFg,0.4)).font('Helvetica').fontSize(8).text(`#${inv.inv_number}`, M+120, 82, {lineBreak:false});

        let y = 102;
        const bW = (CW-10)/2, b2X = M+bW+10;

        doc.rect(M, y, bW, 78).fill(tpl.infoBg);
        doc.rect(M, y, bW, 78).lineWidth(0.5).stroke(tpl.border);
        doc.fillColor(tpl.accent).font('Helvetica-Bold').fontSize(7).text('BILL TO', M+10, y+9);
        doc.fillColor(tpl.textDk).font('Helvetica-Bold').fontSize(9.5).text(inv.to_name||'—', M+10, y+21, {width:bW-20});
        let ty = y+36;
        [inv.to_address,[inv.to_city,inv.to_state].filter(Boolean).join(', '),inv.to_phone].filter(Boolean)
          .forEach(l => { doc.fillColor(rgba(tpl.textDk,0.6)).font('Helvetica').fontSize(7.5).text(l, M+10, ty, {width:bW-20, lineBreak:false}); ty += 10; });

        doc.rect(b2X, y, bW, 78).fill(tpl.infoBg);
        doc.rect(b2X, y, bW, 78).lineWidth(0.5).stroke(tpl.border);
        [[isQ?'Date':'Invoice Date',inv.date||'—'],[isQ?'Valid Until':'Due Date',(isQ?inv.valid_until:inv.due_date)||'—'],['Reference',inv.po_number||inv.inv_number],['Status',(inv.status||'draft').toUpperCase()]]
          .forEach(([dl,dv],i) => {
            const dy = y+9+i*16;
            doc.fillColor(rgba(tpl.textDk,0.4)).font('Helvetica').fontSize(7).text(dl, b2X+10, dy, {width:bW*0.44, lineBreak:false});
            doc.fillColor(tpl.textDk).font('Helvetica-Bold').fontSize(7.5).text(dv, b2X+bW*0.47, dy, {width:bW*0.53-10, align:'right', lineBreak:false});
          });
        y += 92;

        // Table (cols sum = 451)
        const cols = [{l:'#',w:20,a:'center'},{l:'Description',w:190,a:'left'},{l:'HSN/SAC',w:50,a:'center'},{l:'Qty',w:32,a:'center'},{l:'Rate',w:80,a:'right'},{l:'Amount',w:79,a:'right'}];
        const RH = 20;
        doc.rect(M, y, CW, 22).fill(tpl.tHBg);
        let cx = M;
        cols.forEach(c => { doc.fillColor(tpl.tHFg).font('Helvetica-Bold').fontSize(7).text(c.l, cx+3, y+7, {width:c.w-6, align:c.a, lineBreak:false}); cx += c.w; });
        y += 22;

        (items||[]).forEach((it, i) => {
          if (y+RH > PH-M) { doc.addPage(); doc.rect(0,0,PW,PH).fill(tpl.hBg); doc.rect(0,0,6,PH).fill(tpl.accent); y = M; }
          doc.rect(M, y, CW, RH).fill(i%2===0 ? tpl.altBg : tpl.infoBg);
          doc.strokeColor(tpl.border).lineWidth(0.3).moveTo(M,y+RH).lineTo(M+CW,y+RH).stroke();
          cx = M;
          [String(i+1),it.description||'',it.hsn_sac||'—',String(it.qty||1),fmt(it.rate),fmt(it.amount)]
            .forEach((v, ci) => {
              doc.fillColor(tpl.textDk).font((ci===1||ci===5)?'Helvetica-Bold':'Helvetica').fontSize(7.5)
                 .text(v, cx+3, y+6, {width:cols[ci].w-6, align:cols[ci].a, lineBreak:false, ellipsis:true});
              cx += cols[ci].w;
            });
          y += RH;
        });
        y += 12;
        y = drawTotals(M+CW-188, y, 188);
        if (inv.notes||inv.terms) {
          const nt = [inv.notes&&`Notes: ${inv.notes}`, inv.terms&&`Terms: ${inv.terms}`].filter(Boolean).join('\n\n');
          doc.fillColor(rgba(tpl.textDk,0.5)).font('Helvetica').fontSize(7.5).text(nt, M, y, {width:CW});
        }
        doc.rect(0, PH-30, PW, 30).fill(tpl.infoBg);
        doc.rect(0, PH-30, 6, 30).fill(tpl.accent);
        doc.fillColor(rgba(tpl.textDk,0.5)).font('Helvetica').fontSize(7).text(`${lbl} #${inv.inv_number}  ·  ${inv.from_name||''}  ·  Thank you for your business!`, M, PH-16, {width:CW, align:'center', lineBreak:false});
      }

      doc.end();
    });
  });
});

// ── Template List (for frontend picker) ───────────────────────
router.get('/templates/list', (_req, res) => {
  res.json(Object.entries(TEMPLATES).map(([id, t]) => ({
    id, name: t.name, layout: t.layout,
    hBg: t.hBg, accent: t.accent, tHBg: t.tHBg,
  })));
});

module.exports = router;
