'use strict';
const express     = require('express');
const multer      = require('multer');
const path        = require('path');
const fs          = require('fs');
const PDFDocument = require('pdfkit');
const ExcelJS     = require('exceljs');
const db          = require('../database');

const router = express.Router();
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

// ── Photo upload setup ────────────────────────────────────────
const photoDir = path.join(__dirname, '../uploads/staff');
if (!fs.existsSync(photoDir)) fs.mkdirSync(photoDir, { recursive: true });

const photoUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, photoDir),
    filename: (_req, file, cb) => cb(null, `staff_${Date.now()}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => file.mimetype.startsWith('image/') ? cb(null, true) : cb(new Error('Images only')),
});

// ── STAFF CRUD ────────────────────────────────────────────────

router.get('/staff', (req, res) => {
  const { status, department, project_id, search } = req.query;
  let sql = 'SELECT s.* FROM staff s';
  const params = [];
  const conds  = [];

  if (project_id) {
    sql = 'SELECT DISTINCT s.* FROM staff s JOIN staff_projects sp ON s.id = sp.staff_id';
    conds.push('sp.project_id=?');
    params.push(project_id);
  }

  if (status)     { conds.push('s.status=?'); params.push(status); }
  if (department) { conds.push('s.department=?'); params.push(department); }
  if (search) {
    conds.push('(s.name LIKE ? OR s.employee_id LIKE ? OR s.designation LIKE ? OR s.phone LIKE ?)');
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (conds.length) sql += ' WHERE ' + conds.join(' AND ');
  sql += ' ORDER BY s.name ASC';

  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

router.get('/staff/:id', (req, res) => {
  db.get('SELECT * FROM staff WHERE id=?', [req.params.id], (err, row) => {
    if (err || !row) return res.status(404).json({ error: 'Not found' });
    db.get('SELECT * FROM staff_salary WHERE staff_id=?', [req.params.id], (_e1, salary) => {
      db.all(
        `SELECT sp.*, p.name as project_name FROM staff_projects sp
         JOIN projects p ON sp.project_id = p.id WHERE sp.staff_id=?`,
        [req.params.id], (_e2, projs) => {
          db.all('SELECT * FROM staff_advances WHERE staff_id=? ORDER BY created_at DESC', [req.params.id], (_e3, advances) => {
            res.json({ ...row, salary: salary || null, projects: projs || [], advances: advances || [] });
          });
        }
      );
    });
  });
});

router.post('/staff', photoUpload.single('photo'), (req, res) => {
  const b = req.body;
  const photo = req.file ? `staff/${req.file.filename}` : '';
  db.run(
    `INSERT INTO staff (employee_id,name,photo,designation,department,date_of_joining,date_of_birth,
      gender,phone,email,address,city,state,pincode,bank_name,bank_account,bank_ifsc,
      emergency_contact,emergency_phone,notes,status)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [b.employee_id||'', b.name||'', photo, b.designation||'', b.department||'',
     b.date_of_joining||'', b.date_of_birth||'', b.gender||'', b.phone||'', b.email||'',
     b.address||'', b.city||'', b.state||'', b.pincode||'', b.bank_name||'',
     b.bank_account||'', b.bank_ifsc||'', b.emergency_contact||'', b.emergency_phone||'',
     b.notes||'', b.status||'active'],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      db.get('SELECT * FROM staff WHERE id=?', [this.lastID], (_e, row) => res.json(row));
    }
  );
});

router.put('/staff/:id', photoUpload.single('photo'), (req, res) => {
  const { id } = req.params, b = req.body;
  db.get('SELECT photo FROM staff WHERE id=?', [id], (err, existing) => {
    if (err || !existing) return res.status(404).json({ error: 'Not found' });
    let photo = existing.photo;
    if (req.file) {
      if (photo) { const old = path.join(__dirname, '../uploads', photo); if (fs.existsSync(old)) fs.unlinkSync(old); }
      photo = `staff/${req.file.filename}`;
    } else if (b.remove_photo === '1') {
      if (photo) { const old = path.join(__dirname, '../uploads', photo); if (fs.existsSync(old)) fs.unlinkSync(old); }
      photo = '';
    }
    db.run(
      `UPDATE staff SET employee_id=?,name=?,photo=?,designation=?,department=?,date_of_joining=?,
       date_of_birth=?,gender=?,phone=?,email=?,address=?,city=?,state=?,pincode=?,
       bank_name=?,bank_account=?,bank_ifsc=?,emergency_contact=?,emergency_phone=?,
       notes=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,
      [b.employee_id||'', b.name||'', photo, b.designation||'', b.department||'',
       b.date_of_joining||'', b.date_of_birth||'', b.gender||'', b.phone||'', b.email||'',
       b.address||'', b.city||'', b.state||'', b.pincode||'', b.bank_name||'',
       b.bank_account||'', b.bank_ifsc||'', b.emergency_contact||'', b.emergency_phone||'',
       b.notes||'', b.status||'active', id],
      (e2) => {
        if (e2) return res.status(500).json({ error: e2.message });
        db.get('SELECT * FROM staff WHERE id=?', [id], (_e, row) => res.json(row));
      }
    );
  });
});

router.delete('/staff/:id', (req, res) => {
  db.get('SELECT photo FROM staff WHERE id=?', [req.params.id], (_e, row) => {
    if (row && row.photo) {
      const p = path.join(__dirname, '../uploads', row.photo);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
    db.run('DELETE FROM staff WHERE id=?', [req.params.id], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    });
  });
});

// ── SALARY CONFIG ─────────────────────────────────────────────

router.put('/staff/:id/salary', (req, res) => {
  const { id } = req.params, b = req.body;
  db.run(
    `INSERT OR REPLACE INTO staff_salary
      (staff_id,basic,hra_pct,da_pct,ta_fixed,other_fixed,pf_pct,esi_pct,working_days,effective_from,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`,
    [id, parseFloat(b.basic)||0, parseFloat(b.hra_pct)||0, parseFloat(b.da_pct)||0,
     parseFloat(b.ta_fixed)||0, parseFloat(b.other_fixed)||0,
     parseFloat(b.pf_pct)||12, parseFloat(b.esi_pct)||0.75,
     parseInt(b.working_days)||26, b.effective_from||''],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      db.get('SELECT * FROM staff_salary WHERE staff_id=?', [id], (_e, row) => res.json(row));
    }
  );
});

// ── PROJECT ASSIGNMENT ────────────────────────────────────────

router.post('/staff/:id/projects', (req, res) => {
  const { id } = req.params, b = req.body;
  db.run(
    `INSERT OR REPLACE INTO staff_projects (staff_id,project_id,role,from_date,to_date,is_primary)
     VALUES (?,?,?,?,?,?)`,
    [id, b.project_id, b.role||'', b.from_date||'', b.to_date||'', b.is_primary ? 1 : 0],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      db.all(
        `SELECT sp.*, p.name as project_name FROM staff_projects sp
         JOIN projects p ON sp.project_id = p.id WHERE sp.staff_id=?`,
        [id], (_e, rows) => res.json(rows || [])
      );
    }
  );
});

router.delete('/staff/:id/projects/:projId', (req, res) => {
  db.run('DELETE FROM staff_projects WHERE staff_id=? AND project_id=?',
    [req.params.id, req.params.projId],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    }
  );
});

// ── ADVANCES ──────────────────────────────────────────────────

router.get('/staff/:id/advances', (req, res) => {
  db.all('SELECT * FROM staff_advances WHERE staff_id=? ORDER BY created_at DESC',
    [req.params.id], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows || []);
    }
  );
});

router.post('/staff/:id/advances', (req, res) => {
  const { id } = req.params, b = req.body;
  const amount = parseFloat(b.amount) || 0;
  db.run(
    `INSERT INTO staff_advances (staff_id,project_id,amount,date,reason,monthly_deduction,balance,status)
     VALUES (?,?,?,?,?,?,?,?)`,
    [id, b.project_id||null, amount, b.date||'', b.reason||'',
     parseFloat(b.monthly_deduction)||amount, amount, 'active'],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      db.get('SELECT * FROM staff_advances WHERE id=?', [this.lastID], (_e, row) => res.json(row));
    }
  );
});

router.put('/advances/:id', (req, res) => {
  const { id } = req.params, b = req.body;
  db.run(
    `UPDATE staff_advances SET amount=?,date=?,reason=?,monthly_deduction=?,balance=?,status=?,
     project_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,
    [parseFloat(b.amount)||0, b.date||'', b.reason||'', parseFloat(b.monthly_deduction)||0,
     parseFloat(b.balance)||0, b.status||'active', b.project_id||null, id],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      db.get('SELECT * FROM staff_advances WHERE id=?', [id], (_e, row) => res.json(row));
    }
  );
});

router.delete('/advances/:id', (req, res) => {
  db.run('DELETE FROM staff_advances WHERE id=?', [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// ── ATTENDANCE ────────────────────────────────────────────────

router.get('/attendance', (req, res) => {
  const { month, year, staff_id, project_id } = req.query;
  let sql = `SELECT a.*, s.name as staff_name, s.employee_id, s.designation, s.department
             FROM attendance a JOIN staff s ON a.staff_id = s.id WHERE s.status='active'`;
  const conds = [], params = [];

  if (month && year) {
    conds.push("strftime('%m', a.date) = ? AND strftime('%Y', a.date) = ?");
    params.push(String(month).padStart(2, '0'), String(year));
  }
  if (staff_id)  { conds.push('a.staff_id=?');  params.push(staff_id); }
  if (project_id) {
    conds.push('a.staff_id IN (SELECT staff_id FROM staff_projects WHERE project_id=?)');
    params.push(project_id);
  }
  if (conds.length) sql += ' AND ' + conds.join(' AND ');
  sql += ' ORDER BY a.date ASC, s.name ASC';

  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

router.post('/attendance', (req, res) => {
  const records = req.body;
  if (!Array.isArray(records)) return res.status(400).json({ error: 'Expected array' });
  const stmt = db.prepare(
    `INSERT OR REPLACE INTO attendance (staff_id, date, status, notes) VALUES (?,?,?,?)`
  );
  records.forEach(r => stmt.run([r.staff_id, r.date, r.status || 'present', r.notes || '']));
  stmt.finalize(() => res.json({ success: true, count: records.length }));
});

router.delete('/attendance/:staffId/:date', (req, res) => {
  db.run('DELETE FROM attendance WHERE staff_id=? AND date=?',
    [req.params.staffId, req.params.date],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    }
  );
});

// ── PAYROLL — fixed routes BEFORE :id ────────────────────────

router.get('/payroll/export/excel', async (req, res) => {
  const { month, year, project_id } = req.query;
  const m = parseInt(month || (new Date().getMonth() + 1));
  const y = parseInt(year  || new Date().getFullYear());

  let sql = `SELECT pr.*, s.name, s.employee_id, s.designation, s.department,
                    p.name as project_name
             FROM payroll pr JOIN staff s ON pr.staff_id=s.id
             LEFT JOIN projects p ON pr.project_id=p.id
             WHERE pr.month=? AND pr.year=?`;
  const params = [m, y];
  if (project_id) { sql += ' AND pr.project_id=?'; params.push(project_id); }
  sql += ' ORDER BY s.name ASC';

  db.all(sql, params, async (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    const wb = new ExcelJS.Workbook();
    wb.creator = 'FinanceMonitor';
    const ws = wb.addWorksheet(`Payroll ${MONTHS[m-1]} ${y}`);

    ws.columns = [
      { header:'Emp ID',      key:'employee_id',      width:10 },
      { header:'Name',        key:'name',             width:22 },
      { header:'Designation', key:'designation',      width:16 },
      { header:'Department',  key:'department',       width:14 },
      { header:'Project',     key:'project_name',     width:18 },
      { header:'Work Days',   key:'working_days',     width:10 },
      { header:'Present',     key:'present_days',     width:9  },
      { header:'Absent',      key:'absent_days',      width:9  },
      { header:'Leave',       key:'leave_days',       width:9  },
      { header:'Half Day',    key:'half_days',        width:9  },
      { header:'Paid Days',   key:'paid_days',        width:10 },
      { header:'Basic',       key:'basic',            width:12 },
      { header:'HRA',         key:'hra',              width:10 },
      { header:'DA',          key:'da',               width:10 },
      { header:'TA',          key:'ta',               width:10 },
      { header:'Other Allow.',key:'other_allowance',  width:12 },
      { header:'Gross',       key:'gross',            width:12 },
      { header:'PF',          key:'pf_deduction',     width:10 },
      { header:'ESI',         key:'esi_deduction',    width:10 },
      { header:'Advance Ded.',key:'advance_deduction',width:12 },
      { header:'Other Ded.', key:'other_deduction',  width:10 },
      { header:'Total Ded.', key:'total_deduction',  width:11 },
      { header:'Net Salary',  key:'net_salary',       width:12 },
      { header:'Status',      key:'status',           width:10 },
      { header:'Payment Mode',key:'payment_mode',     width:14 },
    ];

    const hRow = ws.getRow(1);
    hRow.font      = { bold: true, color: { argb: 'FFFFFFFF' } };
    hRow.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    hRow.alignment = { horizontal: 'center', vertical: 'middle' };
    hRow.height    = 22;

    rows.forEach(r => {
      const row = ws.addRow(r);
      row.alignment = { vertical: 'middle' };
    });

    if (rows.length > 0) {
      const sum = (k) => rows.reduce((s, r) => s + parseFloat(r[k] || 0), 0);
      const totRow = ws.addRow({
        name: 'TOTAL',
        basic: sum('basic'), hra: sum('hra'), da: sum('da'), ta: sum('ta'),
        other_allowance: sum('other_allowance'), gross: sum('gross'),
        pf_deduction: sum('pf_deduction'), esi_deduction: sum('esi_deduction'),
        advance_deduction: sum('advance_deduction'), other_deduction: sum('other_deduction'),
        total_deduction: sum('total_deduction'), net_salary: sum('net_salary'),
      });
      totRow.font = { bold: true };
      totRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="payroll-${MONTHS[m-1]}-${y}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  });
});

router.get('/payroll/export/pdf', (req, res) => {
  const { month, year, project_id } = req.query;
  const m = parseInt(month || (new Date().getMonth() + 1));
  const y = parseInt(year  || new Date().getFullYear());

  let sql = `SELECT pr.*, s.name, s.employee_id, s.designation, s.department,
                    p.name as project_name
             FROM payroll pr JOIN staff s ON pr.staff_id=s.id
             LEFT JOIN projects p ON pr.project_id=p.id
             WHERE pr.month=? AND pr.year=?`;
  const params = [m, y];
  if (project_id) { sql += ' AND pr.project_id=?'; params.push(project_id); }
  sql += ' ORDER BY s.name ASC';

  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    const doc = new PDFDocument({ size: 'A4', margin: 0, autoFirstPage: false });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="payroll-${MONTHS[m-1]}-${y}.pdf"`);
    doc.pipe(res);

    const PW = 595.28, PH = 841.89, M = 36, CW = PW - M * 2;

    doc.addPage();
    // Header
    doc.rect(0, 0, PW, 66).fill('#1e293b');
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(16)
       .text(`Payroll Summary — ${MONTHS[m-1]} ${y}`, M, 18, { lineBreak: false });
    doc.fillColor('#94a3b8').font('Helvetica').fontSize(9)
       .text(`${rows.length} Employee(s)  ·  Generated ${new Date().toLocaleDateString('en-IN')}`, M, 42, { lineBreak: false });

    let y2 = 82;
    const cols = [
      { h: 'Name',        w: 110, key: 'name',            align: 'left' },
      { h: 'Emp ID',      w: 52,  key: 'employee_id',     align: 'center' },
      { h: 'Paid Days',   w: 50,  key: 'paid_days',       align: 'right' },
      { h: 'Gross',       w: 72,  key: 'gross',           align: 'right' },
      { h: 'Deductions',  w: 72,  key: 'total_deduction', align: 'right' },
      { h: 'Net Salary',  w: 80,  key: 'net_salary',      align: 'right' },
      { h: 'Status',      w: 48,  key: 'status',          align: 'center' },
    ];
    const totW = cols.reduce((s, c) => s + c.w, 0);

    // Table header
    doc.rect(M, y2, totW, 22).fill('#334155');
    let cx = M;
    cols.forEach(c => {
      doc.fillColor('#e2e8f0').font('Helvetica-Bold').fontSize(7.5)
         .text(c.h, cx + 4, y2 + 7, { width: c.w - 8, align: c.align, lineBreak: false });
      cx += c.w;
    });
    y2 += 22;

    rows.forEach((r, i) => {
      if (y2 + 18 > PH - 50) { doc.addPage(); y2 = 36; }
      doc.rect(M, y2, totW, 18).fill(i % 2 === 0 ? '#f8fafc' : '#ffffff');
      cx = M;
      cols.forEach(c => {
        let val = r[c.key] || '';
        if (typeof val === 'number' && c.key !== 'paid_days') val = parseFloat(val).toFixed(2);
        if (c.key === 'status') val = String(val).toUpperCase();
        doc.fillColor(c.key === 'status' && r.status === 'paid' ? '#059669' : '#1e293b')
           .font(c.key === 'status' ? 'Helvetica-Bold' : 'Helvetica').fontSize(7.5)
           .text(String(val), cx + 4, y2 + 5, { width: c.w - 8, align: c.align, lineBreak: false, ellipsis: true });
        cx += c.w;
      });
      y2 += 18;
    });

    // Totals
    y2 += 4;
    doc.rect(M, y2, totW, 22).fill('#1e293b');
    const grossT = rows.reduce((s, r) => s + parseFloat(r.gross || 0), 0);
    const dedT   = rows.reduce((s, r) => s + parseFloat(r.total_deduction || 0), 0);
    const netT   = rows.reduce((s, r) => s + parseFloat(r.net_salary || 0), 0);
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8);
    doc.text('TOTAL', M + 4, y2 + 7, { width: cols[0].w - 8 });
    let tx = M + cols[0].w + cols[1].w + cols[2].w;
    doc.text(grossT.toFixed(2), tx + 4, y2 + 7, { width: cols[3].w - 8, align: 'right' });
    tx += cols[3].w;
    doc.text(dedT.toFixed(2), tx + 4, y2 + 7, { width: cols[4].w - 8, align: 'right' });
    tx += cols[4].w;
    doc.text(netT.toFixed(2), tx + 4, y2 + 7, { width: cols[5].w - 8, align: 'right' });

    doc.end();
  });
});

router.post('/payroll/generate', (req, res) => {
  const { month, year, project_id } = req.body;
  if (!month || !year) return res.status(400).json({ error: 'month and year required' });

  const m = parseInt(month), y = parseInt(year);
  const mStr = String(m).padStart(2, '0');

  let staffSql = `SELECT s.id, s.name, s.employee_id, ss.basic, ss.hra_pct, ss.da_pct,
                         ss.ta_fixed, ss.other_fixed, ss.pf_pct, ss.esi_pct, ss.working_days
                  FROM staff s LEFT JOIN staff_salary ss ON ss.staff_id = s.id
                  WHERE s.status='active'`;
  const staffParams = [];
  if (project_id) {
    staffSql = `SELECT s.id, s.name, s.employee_id, ss.basic, ss.hra_pct, ss.da_pct,
                       ss.ta_fixed, ss.other_fixed, ss.pf_pct, ss.esi_pct, ss.working_days
                FROM staff s LEFT JOIN staff_salary ss ON ss.staff_id = s.id
                JOIN staff_projects sp ON sp.staff_id = s.id
                WHERE s.status='active' AND sp.project_id=?`;
    staffParams.push(project_id);
  }

  db.all(staffSql, staffParams, (err, staffList) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!staffList.length) return res.json([]);

    const staffIds = staffList.map(s => s.id);
    const phStr = staffIds.map(() => '?').join(',');

    db.all(
      `SELECT staff_id, date, status FROM attendance
       WHERE strftime('%m', date)=? AND strftime('%Y', date)=?
       AND staff_id IN (${phStr})`,
      [mStr, String(y), ...staffIds],
      (err2, attList) => {
        if (err2) return res.status(500).json({ error: err2.message });

        db.all(
          `SELECT * FROM staff_advances WHERE status='active' AND staff_id IN (${phStr})`,
          staffIds,
          (err3, advances) => {
            if (err3) return res.status(500).json({ error: err3.message });

            const attMap = {};
            attList.forEach(a => {
              if (!attMap[a.staff_id]) attMap[a.staff_id] = {};
              attMap[a.staff_id][a.date] = a.status;
            });

            const advMap = {};
            advances.forEach(a => {
              if (!advMap[a.staff_id]) advMap[a.staff_id] = [];
              advMap[a.staff_id].push(a);
            });

            const r2 = (n) => parseFloat(n.toFixed(2));

            const payrolls = staffList.map(s => {
              const att     = attMap[s.id] || {};
              const basic   = parseFloat(s.basic)        || 0;
              const hraPct  = parseFloat(s.hra_pct)      || 0;
              const daPct   = parseFloat(s.da_pct)       || 0;
              const taFixed = parseFloat(s.ta_fixed)     || 0;
              const otFixed = parseFloat(s.other_fixed)  || 0;
              const pfPct   = parseFloat(s.pf_pct)       || 12;
              const esiPct  = parseFloat(s.esi_pct)      || 0.75;
              const wDays   = parseInt(s.working_days)   || 26;

              let present = 0, absent = 0, leave = 0, half = 0;
              Object.values(att).forEach(st => {
                if (st === 'present')  present++;
                else if (st === 'absent')   absent++;
                else if (st === 'leave')    leave++;
                else if (st === 'half_day') half++;
              });

              const paidDays = present + (half * 0.5) + leave;
              const perDay   = wDays > 0 ? basic / wDays : 0;
              const basicPay = r2(perDay * paidDays);
              const hraPay   = r2(basicPay * hraPct / 100);
              const daPay    = r2(basicPay * daPct / 100);
              const taPay    = paidDays > 0 ? taFixed : 0;
              const otPay    = paidDays > 0 ? otFixed : 0;
              const gross    = r2(basicPay + hraPay + daPay + taPay + otPay);
              const pfDed    = r2(basicPay * pfPct / 100);
              const esiDed   = gross <= 21000 ? r2(gross * esiPct / 100) : 0;

              const advDed = (advMap[s.id] || []).reduce((sum, a) => {
                return sum + Math.min(parseFloat(a.monthly_deduction) || 0, parseFloat(a.balance) || 0);
              }, 0);

              const totalDed = r2(pfDed + esiDed + advDed);
              const net      = r2(Math.max(0, gross - totalDed));

              return {
                staff_id: s.id,
                project_id: project_id ? parseInt(project_id) : null,
                month: m, year: y,
                working_days: wDays,
                present_days: present, absent_days: absent, leave_days: leave, half_days: half,
                paid_days: r2(paidDays),
                basic: basicPay, hra: hraPay, da: daPay, ta: taPay, other_allowance: otPay,
                gross,
                pf_deduction: pfDed, esi_deduction: esiDed,
                advance_deduction: r2(advDed), other_deduction: 0,
                total_deduction: totalDed, net_salary: net,
              };
            });

            const stmt = db.prepare(
              `INSERT OR REPLACE INTO payroll
               (staff_id,project_id,month,year,working_days,present_days,absent_days,
                leave_days,half_days,paid_days,basic,hra,da,ta,other_allowance,gross,
                pf_deduction,esi_deduction,advance_deduction,other_deduction,total_deduction,
                net_salary,status,updated_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'draft',CURRENT_TIMESTAMP)`
            );
            payrolls.forEach(p => stmt.run([
              p.staff_id, p.project_id, p.month, p.year, p.working_days,
              p.present_days, p.absent_days, p.leave_days, p.half_days, p.paid_days,
              p.basic, p.hra, p.da, p.ta, p.other_allowance, p.gross,
              p.pf_deduction, p.esi_deduction, p.advance_deduction, p.other_deduction,
              p.total_deduction, p.net_salary,
            ]));
            stmt.finalize(() => {
              let retSql = `SELECT pr.*, s.name, s.employee_id, s.designation, s.department, s.photo
                            FROM payroll pr JOIN staff s ON pr.staff_id=s.id
                            WHERE pr.month=? AND pr.year=?`;
              const retParams = [m, y];
              if (project_id) { retSql += ' AND pr.project_id=?'; retParams.push(project_id); }
              retSql += ' ORDER BY s.name ASC';
              db.all(retSql, retParams, (_e, rows) => res.json(rows || []));
            });
          }
        );
      }
    );
  });
});

router.get('/payroll', (req, res) => {
  const { month, year, project_id, status, staff_id } = req.query;
  let sql = `SELECT pr.*, s.name, s.employee_id, s.designation, s.department, s.photo,
                    p.name as project_name
             FROM payroll pr JOIN staff s ON pr.staff_id=s.id
             LEFT JOIN projects p ON pr.project_id=p.id`;
  const conds = [], params = [];
  if (month)      { conds.push('pr.month=?');      params.push(parseInt(month)); }
  if (year)       { conds.push('pr.year=?');       params.push(parseInt(year)); }
  if (project_id) { conds.push('pr.project_id=?'); params.push(project_id); }
  if (status)     { conds.push('pr.status=?');     params.push(status); }
  if (staff_id)   { conds.push('pr.staff_id=?');   params.push(staff_id); }
  if (conds.length) sql += ' WHERE ' + conds.join(' AND ');
  sql += ' ORDER BY s.name ASC';

  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

router.get('/payroll/:id', (req, res) => {
  db.get(
    `SELECT pr.*, s.name, s.employee_id, s.designation, s.department, s.photo,
            s.bank_name, s.bank_account, s.bank_ifsc, p.name as project_name
     FROM payroll pr JOIN staff s ON pr.staff_id=s.id
     LEFT JOIN projects p ON pr.project_id=p.id
     WHERE pr.id=?`,
    [req.params.id],
    (err, row) => {
      if (err || !row) return res.status(404).json({ error: 'Not found' });
      res.json(row);
    }
  );
});

router.put('/payroll/:id', (req, res) => {
  const { id } = req.params, b = req.body;
  const gross = parseFloat(b.gross) || 0;
  const totalDed = parseFloat(b.total_deduction) ||
    (parseFloat(b.pf_deduction)||0) + (parseFloat(b.esi_deduction)||0) +
    (parseFloat(b.advance_deduction)||0) + (parseFloat(b.other_deduction)||0);
  const net = parseFloat(b.net_salary) || Math.max(0, gross - totalDed);
  db.run(
    `UPDATE payroll SET basic=?,hra=?,da=?,ta=?,other_allowance=?,gross=?,
     pf_deduction=?,esi_deduction=?,advance_deduction=?,other_deduction=?,
     total_deduction=?,net_salary=?,notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,
    [parseFloat(b.basic)||0, parseFloat(b.hra)||0, parseFloat(b.da)||0, parseFloat(b.ta)||0,
     parseFloat(b.other_allowance)||0, gross, parseFloat(b.pf_deduction)||0,
     parseFloat(b.esi_deduction)||0, parseFloat(b.advance_deduction)||0,
     parseFloat(b.other_deduction)||0, totalDed, net, b.notes||'', id],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      db.get(`SELECT pr.*, s.name, s.employee_id FROM payroll pr JOIN staff s ON pr.staff_id=s.id WHERE pr.id=?`, [id], (_e, row) => res.json(row));
    }
  );
});

router.post('/payroll/:id/pay', (req, res) => {
  const { payment_date, payment_mode, notes } = req.body;
  db.get(
    `SELECT pr.*, s.name FROM payroll pr JOIN staff s ON pr.staff_id=s.id WHERE pr.id=?`,
    [req.params.id], (err, pr) => {
      if (err || !pr) return res.status(404).json({ error: 'Not found' });
      if (pr.status === 'paid') return res.status(400).json({ error: 'Already paid' });

      const today = new Date().toISOString().slice(0, 10);
      const pDate = payment_date || today;
      const pMode = payment_mode || 'bank_transfer';

      db.run(
        `UPDATE payroll SET status='paid', payment_date=?, payment_mode=?, notes=?,
         updated_at=CURRENT_TIMESTAMP WHERE id=?`,
        [pDate, pMode, notes || '', req.params.id],
        (e2) => {
          if (e2) return res.status(500).json({ error: e2.message });

          if (pr.project_id && !pr.txn_created) {
            const title = `Salary — ${pr.name} (${MONTHS[pr.month - 1]} ${pr.year})`;
            db.run(
              `INSERT INTO transactions (project_id,type,title,amount,date,payment_method,party_name,notes,status,currency)
               VALUES (?,?,?,?,?,?,?,?,?,?)`,
              [pr.project_id, 'expense', title, pr.net_salary, pDate, pMode,
               pr.name, notes || `Salary for ${MONTHS[pr.month - 1]} ${pr.year}`, 'confirmed', 'INR'],
              function(e3) {
                if (!e3) {
                  db.run('UPDATE payroll SET txn_created=1 WHERE id=?', [req.params.id]);
                  if (pr.advance_deduction > 0) {
                    db.all(`SELECT * FROM staff_advances WHERE staff_id=? AND status='active'`,
                      [pr.staff_id], (_e, advs) => {
                        let rem = parseFloat(pr.advance_deduction);
                        (advs || []).forEach(adv => {
                          if (rem <= 0) return;
                          const deduct = Math.min(parseFloat(adv.monthly_deduction)||0, parseFloat(adv.balance)||0, rem);
                          const newBal = Math.max(0, parseFloat(adv.balance) - deduct);
                          rem -= deduct;
                          db.run('UPDATE staff_advances SET balance=?, status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?',
                            [newBal, newBal <= 0 ? 'cleared' : 'active', adv.id]);
                        });
                      }
                    );
                  }
                }
              }
            );
          }

          db.get(
            `SELECT pr.*, s.name, s.employee_id FROM payroll pr JOIN staff s ON pr.staff_id=s.id WHERE pr.id=?`,
            [req.params.id], (_e, row) => res.json(row)
          );
        }
      );
    }
  );
});

// ── PAYSLIP PDF ───────────────────────────────────────────────

router.get('/payroll/:id/pdf', (req, res) => {
  db.get(
    `SELECT pr.*, s.name, s.employee_id, s.designation, s.department, s.photo, s.phone, s.email,
            s.bank_name, s.bank_account, s.bank_ifsc, p.name as project_name
     FROM payroll pr JOIN staff s ON pr.staff_id=s.id
     LEFT JOIN projects p ON pr.project_id=p.id WHERE pr.id=?`,
    [req.params.id], (err, pr) => {
      if (err || !pr) return res.status(404).json({ error: 'Not found' });

      const doc = new PDFDocument({ size: 'A4', margin: 0 });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition',
        `inline; filename="payslip-${pr.employee_id||pr.staff_id}-${MONTHS[pr.month-1]}-${pr.year}.pdf"`);
      doc.pipe(res);

      const PW = 595.28, PH = 841.89, M = 40, CW = PW - M * 2;

      // Header
      doc.rect(0, 0, PW, 78).fill('#1e293b');
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(20)
         .text('PAY SLIP', M, 20, { lineBreak: false });
      doc.fillColor('#94a3b8').font('Helvetica').fontSize(9)
         .text(`${MONTHS[pr.month-1]} ${pr.year}  ·  ${pr.project_name || 'General'}`, M, 48, { lineBreak: false });
      doc.fillColor('#64748b').font('Helvetica').fontSize(8)
         .text(`Generated: ${new Date().toLocaleDateString('en-IN')}`, PW - M - 160, 48, { width: 160, align: 'right', lineBreak: false });

      let y = 94;

      // Employee card
      doc.rect(M, y, CW, 72).fill('#f8fafc');
      doc.rect(M, y, CW, 72).lineWidth(0.5).stroke('#e2e8f0');

      const photoPath = pr.photo ? path.join(__dirname, '../uploads', pr.photo) : null;
      let nameX = M + 14;
      if (photoPath && fs.existsSync(photoPath)) {
        try {
          doc.image(photoPath, M + 12, y + 11, { fit: [50, 50] });
          nameX = M + 74;
        } catch (_) {}
      }

      doc.fillColor('#1e293b').font('Helvetica-Bold').fontSize(14)
         .text(pr.name, nameX, y + 12, { width: CW * 0.45 });
      doc.fillColor('#64748b').font('Helvetica').fontSize(9)
         .text([pr.designation, pr.department].filter(Boolean).join(' · '), nameX, y + 31, { width: CW * 0.45 });
      doc.fillColor('#94a3b8').font('Helvetica').fontSize(8)
         .text(`Employee ID: ${pr.employee_id || '—'}`, nameX, y + 47, { width: CW * 0.45 });

      const rx = M + CW * 0.56;
      [
        [`Bank: ${pr.bank_name || '—'}`, y + 14],
        [`A/C: ${pr.bank_account || '—'}`, y + 29],
        [`IFSC: ${pr.bank_ifsc || '—'}`, y + 44],
      ].forEach(([t, ty]) => {
        doc.fillColor('#64748b').font('Helvetica').fontSize(8.5)
           .text(t, rx, ty, { width: CW * 0.44 - 10, lineBreak: false });
      });

      y += 82;

      // Attendance bar
      const attItems = [
        ['Working Days', pr.working_days],
        ['Present', pr.present_days],
        ['Absent', pr.absent_days],
        ['Leave', pr.leave_days],
        ['Half Day', pr.half_days],
        ['Paid Days', pr.paid_days],
      ];
      const bW = CW / attItems.length;
      attItems.forEach(([lbl, val], i) => {
        const bx = M + i * bW;
        doc.rect(bx, y, bW, 48).fill(i % 2 === 0 ? '#f1f5f9' : '#f8fafc');
        doc.rect(bx, y, bW, 48).lineWidth(0.3).stroke('#e2e8f0');
        doc.fillColor('#94a3b8').font('Helvetica').fontSize(6.5)
           .text(lbl.toUpperCase(), bx + 3, y + 8, { width: bW - 6, align: 'center' });
        doc.fillColor(lbl === 'Paid Days' ? '#0f766e' : '#1e293b')
           .font('Helvetica-Bold').fontSize(15)
           .text(String(val), bx + 3, y + 20, { width: bW - 6, align: 'center' });
      });
      y += 58;

      const colW = (CW - 8) / 2;

      // Earnings
      const earns = [
        ['Basic Salary',     pr.basic],
        ['HRA',              pr.hra],
        ['DA',               pr.da],
        ['Travel Allowance', pr.ta],
        ['Other Allowance',  pr.other_allowance],
      ].filter(([, v]) => parseFloat(v) > 0);

      doc.rect(M, y, colW, 22).fill('#dcfce7');
      doc.fillColor('#166534').font('Helvetica-Bold').fontSize(8.5)
         .text('EARNINGS', M + 10, y + 7, { lineBreak: false });
      y += 22;

      earns.forEach(([lbl, val], i) => {
        doc.rect(M, y + i * 19, colW, 19).fill(i % 2 === 0 ? '#f0fdf4' : '#ffffff');
        doc.fillColor('#374151').font('Helvetica').fontSize(8.5)
           .text(lbl, M + 10, y + i * 19 + 5, { width: colW * 0.58 });
        doc.font('Helvetica-Bold')
           .text(`₹ ${parseFloat(val).toFixed(2)}`, M + colW * 0.58, y + i * 19 + 5, { width: colW * 0.42 - 10, align: 'right' });
      });

      const earnsEndY = y + earns.length * 19;
      doc.rect(M, earnsEndY, colW, 24).fill('#166534');
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9)
         .text('Gross Salary', M + 10, earnsEndY + 7, { width: colW * 0.55 });
      doc.fontSize(11)
         .text(`₹ ${parseFloat(pr.gross).toFixed(2)}`, M + colW * 0.55, earnsEndY + 6, { width: colW * 0.45 - 10, align: 'right' });

      // Deductions
      const dX = M + colW + 8;
      const deds = [
        ['PF (Employee)',    pr.pf_deduction],
        ['ESI',             pr.esi_deduction],
        ['Advance Recovery',pr.advance_deduction],
        ['Other Deductions',pr.other_deduction],
      ].filter(([, v]) => parseFloat(v) > 0);

      let dy = y - 22;
      doc.rect(dX, dy, colW, 22).fill('#fee2e2');
      doc.fillColor('#991b1b').font('Helvetica-Bold').fontSize(8.5)
         .text('DEDUCTIONS', dX + 10, dy + 7, { lineBreak: false });
      dy += 22;

      deds.forEach(([lbl, val], i) => {
        doc.rect(dX, dy + i * 19, colW, 19).fill(i % 2 === 0 ? '#fff1f2' : '#ffffff');
        doc.fillColor('#374151').font('Helvetica').fontSize(8.5)
           .text(lbl, dX + 10, dy + i * 19 + 5, { width: colW * 0.58 });
        doc.font('Helvetica-Bold')
           .text(`₹ ${parseFloat(val).toFixed(2)}`, dX + colW * 0.58, dy + i * 19 + 5, { width: colW * 0.42 - 10, align: 'right' });
      });

      const dedsEndY = dy + deds.length * 19;
      doc.rect(dX, dedsEndY, colW, 24).fill('#991b1b');
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9)
         .text('Total Deductions', dX + 10, dedsEndY + 7, { width: colW * 0.55 });
      doc.fontSize(11)
         .text(`₹ ${parseFloat(pr.total_deduction).toFixed(2)}`, dX + colW * 0.55, dedsEndY + 6, { width: colW * 0.45 - 10, align: 'right' });

      y = Math.max(earnsEndY, dedsEndY) + 34;

      // Net Salary
      doc.rect(M, y, CW, 58).fill('#1e293b');
      doc.fillColor('#94a3b8').font('Helvetica').fontSize(9)
         .text('NET SALARY PAYABLE', M + 18, y + 10, { lineBreak: false });
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(24)
         .text(`₹ ${parseFloat(pr.net_salary).toFixed(2)}`, M + 18, y + 24, { lineBreak: false });

      if (pr.status === 'paid') {
        doc.rect(PW - M - 88, y + 15, 80, 28).fill('#059669');
        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(10)
           .text('PAID', PW - M - 88, y + 25, { width: 80, align: 'center', lineBreak: false });
        if (pr.payment_date) {
          doc.fillColor('#dcfce7').font('Helvetica').fontSize(7.5)
             .text(pr.payment_date, PW - M - 88, y + 39, { width: 80, align: 'center', lineBreak: false });
        }
      }

      y += 68;

      if (pr.notes) {
        doc.fillColor('#64748b').font('Helvetica').fontSize(8)
           .text(`Note: ${pr.notes}`, M, y, { width: CW });
        y += 20;
      }

      // Footer
      doc.rect(0, PH - 30, PW, 30).fill('#f1f5f9');
      doc.fillColor('#94a3b8').font('Helvetica').fontSize(7)
         .text('This is a computer-generated payslip and does not require a signature.',
               M, PH - 17, { width: CW, align: 'center', lineBreak: false });

      doc.end();
    }
  );
});

// ── HELPERS ───────────────────────────────────────────────────

router.get('/departments', (req, res) => {
  db.all('SELECT DISTINCT department FROM staff WHERE department != "" ORDER BY department', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json((rows || []).map(r => r.department));
  });
});

module.exports = router;
