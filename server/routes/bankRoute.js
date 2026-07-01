const express = require('express');
const db      = require('../database');
const router  = express.Router();

// ── Bank Accounts ─────────────────────────────────────────────

router.get('/accounts', (req, res) => {
  db.all(
    `SELECT a.*,
       (SELECT COUNT(*) FROM bank_statement_lines WHERE account_id=a.id) as total_lines,
       (SELECT COUNT(*) FROM bank_statement_lines WHERE account_id=a.id AND is_reconciled=0) as unreconciled,
       (SELECT MAX(period_to) FROM bank_reconciliation_sessions WHERE account_id=a.id AND status='completed') as last_reconciled,
       (SELECT SUM(credit)-SUM(debit) FROM bank_statement_lines WHERE account_id=a.id) as net_movement
     FROM bank_accounts a ORDER BY a.account_name ASC`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows || []);
    }
  );
});

router.post('/accounts', (req, res) => {
  const b = req.body;
  if (!b.account_name || !String(b.account_name).trim())
    return res.status(400).json({ error: 'Account name is required.' });
  db.run(
    `INSERT INTO bank_accounts (account_name,bank_name,account_no,account_type,branch,ifsc,opening_balance,color,notes)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [b.account_name.trim(), b.bank_name||'', b.account_no||'', b.account_type||'savings',
     b.branch||'', b.ifsc||'', parseFloat(b.opening_balance)||0, b.color||'#3b82f6', b.notes||''],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      db.get('SELECT * FROM bank_accounts WHERE id=?', [this.lastID], (_e, row) => res.json(row));
    }
  );
});

router.put('/accounts/:id', (req, res) => {
  const b = req.body;
  db.run(
    `UPDATE bank_accounts SET account_name=?,bank_name=?,account_no=?,account_type=?,branch=?,ifsc=?,opening_balance=?,color=?,is_active=?,notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,
    [b.account_name||'', b.bank_name||'', b.account_no||'', b.account_type||'savings',
     b.branch||'', b.ifsc||'', parseFloat(b.opening_balance)||0, b.color||'#3b82f6',
     b.is_active !== undefined ? (b.is_active ? 1 : 0) : 1, b.notes||'', req.params.id],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      db.get('SELECT * FROM bank_accounts WHERE id=?', [req.params.id], (_e, row) => res.json(row));
    }
  );
});

router.delete('/accounts/:id', (req, res) => {
  db.run('DELETE FROM bank_accounts WHERE id=?', [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// ── Statement Lines ───────────────────────────────────────────

router.get('/statements', (req, res) => {
  const { account_id, from, to } = req.query;
  if (!account_id) return res.status(400).json({ error: 'account_id required' });
  const conds = ['account_id=?'];
  const params = [account_id];
  if (from) { conds.push('txn_date >= ?'); params.push(from); }
  if (to)   { conds.push('txn_date <= ?'); params.push(to);   }
  db.all(
    `SELECT * FROM bank_statement_lines WHERE ${conds.join(' AND ')} ORDER BY txn_date ASC, id ASC`,
    params,
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows || []);
    }
  );
});

router.post('/statements', (req, res) => {
  const b = req.body;
  if (!b.account_id || !b.txn_date) return res.status(400).json({ error: 'account_id and txn_date are required.' });
  db.run(
    `INSERT INTO bank_statement_lines (account_id,txn_date,description,reference_no,debit,credit,balance,notes)
     VALUES (?,?,?,?,?,?,?,?)`,
    [b.account_id, b.txn_date, b.description||'', b.reference_no||'',
     parseFloat(b.debit)||0, parseFloat(b.credit)||0,
     b.balance !== '' && b.balance !== undefined ? parseFloat(b.balance) : null,
     b.notes||''],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      db.get('SELECT * FROM bank_statement_lines WHERE id=?', [this.lastID], (_e, row) => res.json(row));
    }
  );
});

// Bulk insert from paste
router.post('/statements/bulk', (req, res) => {
  const { account_id, lines } = req.body;
  if (!account_id || !Array.isArray(lines) || lines.length === 0)
    return res.status(400).json({ error: 'account_id and lines[] required.' });

  const stmt = db.prepare(
    `INSERT INTO bank_statement_lines (account_id,txn_date,description,reference_no,debit,credit,balance,notes)
     VALUES (?,?,?,?,?,?,?,?)`
  );
  let count = 0;
  db.serialize(() => {
    db.run('BEGIN TRANSACTION');
    lines.forEach(l => {
      stmt.run([account_id, l.txn_date, l.description||'', l.reference_no||'',
                parseFloat(l.debit)||0, parseFloat(l.credit)||0,
                l.balance !== undefined ? parseFloat(l.balance) : null, l.notes||''],
               (err) => { if (!err) count++; });
    });
    db.run('COMMIT', () => {
      stmt.finalize();
      res.json({ inserted: count });
    });
  });
});

router.put('/statements/:id', (req, res) => {
  const b = req.body;
  db.run(
    `UPDATE bank_statement_lines SET txn_date=?,description=?,reference_no=?,debit=?,credit=?,balance=?,notes=? WHERE id=?`,
    [b.txn_date, b.description||'', b.reference_no||'',
     parseFloat(b.debit)||0, parseFloat(b.credit)||0,
     b.balance !== '' && b.balance !== undefined ? parseFloat(b.balance) : null,
     b.notes||'', req.params.id],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      db.get('SELECT * FROM bank_statement_lines WHERE id=?', [req.params.id], (_e, row) => res.json(row));
    }
  );
});

router.delete('/statements/:id', (req, res) => {
  db.run('DELETE FROM bank_statement_lines WHERE id=?', [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

router.patch('/statements/:id/toggle', (req, res) => {
  db.get('SELECT is_reconciled FROM bank_statement_lines WHERE id=?', [req.params.id], (err, row) => {
    if (err || !row) return res.status(404).json({ error: 'Not found' });
    const next = row.is_reconciled ? 0 : 1;
    db.run('UPDATE bank_statement_lines SET is_reconciled=? WHERE id=?', [next, req.params.id], (e2) => {
      if (e2) return res.status(500).json({ error: e2.message });
      res.json({ is_reconciled: next });
    });
  });
});

// ── Reconciliation Sessions ───────────────────────────────────

router.get('/sessions', (req, res) => {
  const { account_id } = req.query;
  const where = account_id ? 'WHERE account_id=?' : '';
  const params = account_id ? [account_id] : [];
  db.all(
    `SELECT s.*, a.account_name, a.bank_name FROM bank_reconciliation_sessions s
     JOIN bank_accounts a ON a.id=s.account_id
     ${where} ORDER BY s.created_at DESC`,
    params,
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows || []);
    }
  );
});

router.post('/sessions', (req, res) => {
  const b = req.body;
  if (!b.account_id || !b.period_from || !b.period_to)
    return res.status(400).json({ error: 'account_id, period_from, period_to required.' });

  // Mark statement lines in period as reconciled
  if (b.mark_reconciled && Array.isArray(b.mark_reconciled) && b.mark_reconciled.length > 0) {
    const ids = b.mark_reconciled.map(() => '?').join(',');
    db.run(`UPDATE bank_statement_lines SET is_reconciled=1 WHERE id IN (${ids})`, b.mark_reconciled);
  }

  db.run(
    `INSERT INTO bank_reconciliation_sessions
       (account_id,period_from,period_to,opening_balance,statement_closing,cleared_balance,difference,cleared_count,outstanding_count,status,notes)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [b.account_id, b.period_from, b.period_to,
     parseFloat(b.opening_balance)||0, parseFloat(b.statement_closing)||0,
     parseFloat(b.cleared_balance)||0, parseFloat(b.difference)||0,
     parseInt(b.cleared_count)||0, parseInt(b.outstanding_count)||0,
     b.status||'completed', b.notes||''],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID, success: true });
    }
  );
});

router.delete('/sessions/:id', (req, res) => {
  db.run('DELETE FROM bank_reconciliation_sessions WHERE id=?', [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// ── Export helpers ────────────────────────────────────────────
function buildStmtFilter(q) {
  const { account_id, from, to, type, reconciled, search } = q;
  const conds  = ['l.account_id=?'];
  const params = [account_id];
  if (from)              { conds.push('l.txn_date >= ?');                             params.push(from); }
  if (to)                { conds.push('l.txn_date <= ?');                             params.push(to);   }
  if (type === 'credit') { conds.push('l.credit > 0'); }
  if (type === 'debit')  { conds.push('l.debit > 0');  }
  if (reconciled === '1'){ conds.push('l.is_reconciled=1'); }
  if (reconciled === '0'){ conds.push('l.is_reconciled=0'); }
  if (search)            { conds.push('(l.description LIKE ? OR l.reference_no LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }
  return { where: conds.join(' AND '), params };
}

// ── Export: Excel ─────────────────────────────────────────────
router.get('/export/excel', (req, res) => {
  const { account_id } = req.query;
  if (!account_id) return res.status(400).json({ error: 'account_id required' });
  const { where, params } = buildStmtFilter(req.query);

  db.get('SELECT * FROM bank_accounts WHERE id=?', [account_id], (err, acct) => {
    if (err || !acct) return res.status(404).json({ error: 'Account not found' });

    db.all(`SELECT l.* FROM bank_statement_lines l WHERE ${where} ORDER BY l.txn_date ASC, l.id ASC`,
      params, (err2, rows) => {
        if (err2) return res.status(500).json({ error: err2.message });

        const ExcelJS = require('exceljs');
        const wb = new ExcelJS.Workbook();
        wb.creator = 'Finance Monitor';
        wb.created = new Date();
        const ws = wb.addWorksheet('Bank Statement');

        ws.columns = [
          { key:'txn_date',     width:14 },
          { key:'description',  width:36 },
          { key:'reference_no', width:18 },
          { key:'debit',        width:18 },
          { key:'credit',       width:18 },
          { key:'balance',      width:18 },
          { key:'status',       width:12 },
        ];

        // ── Title block ──
        const t1 = ws.addRow(['Bank Statement Report']);
        t1.font = { bold:true, size:18, color:{ argb:'FF0F172A' } };
        ws.mergeCells(`A1:G1`);
        t1.height = 30;

        const t2 = ws.addRow([`${acct.account_name}${acct.bank_name?' | '+acct.bank_name:''}`,,,,,, `Generated: ${new Date().toLocaleDateString('en-IN')}`]);
        t2.font = { size:11, color:{ argb:'FF1E40AF' } };
        t2.height = 20;

        const t3 = ws.addRow([`A/C: ${acct.account_no||'—'}  |  IFSC: ${acct.ifsc||'—'}  |  Branch: ${acct.branch||'—'}`]);
        t3.font = { size:9, color:{ argb:'FF64748B' } };
        ws.mergeCells(`A3:G3`);

        const { from, to } = req.query;
        if (from||to) {
          const p = ws.addRow([`Period: ${from||'Start'} to ${to||'End'}`]);
          p.font = { size:9, color:{ argb:'FF475569' } };
          ws.mergeCells(`A4:G4`);
        }

        ws.addRow([]); // spacer

        // ── Summary row ──
        const totalCredit = rows.reduce((s,r)=>s+(r.credit||0),0);
        const totalDebit  = rows.reduce((s,r)=>s+(r.debit||0),0);
        const netMov      = totalCredit - totalDebit;
        const cleared     = rows.filter(r=>r.is_reconciled).length;
        const smrRow = ws.addRow([
          `${rows.length} Transactions`,
          `Cleared: ${cleared} | Pending: ${rows.length-cleared}`,
          '', totalDebit, totalCredit, netMov, ''
        ]);
        smrRow.height = 22;
        smrRow.eachCell((cell,i) => {
          cell.fill = { type:'pattern', pattern:'solid', fgColor:{ argb:'FF1E3A8A' } };
          cell.font = { bold:true, color:{ argb:'FFFFFFFF' }, size:10 };
          if (i===4) { cell.font.color={ argb:'FFFCA5A5' }; cell.numFmt='"Rs."#,##0.00'; }
          if (i===5) { cell.font.color={ argb:'FF86EFAC' }; cell.numFmt='"Rs."#,##0.00'; }
          if (i===6) { cell.font.color={ argb: netMov>=0?'FF86EFAC':'FFFCA5A5' }; cell.numFmt='"Rs."#,##0.00'; }
        });

        // ── Column headers ──
        const hdr = ws.addRow(['Date','Description','Reference No','Debit (–)','Credit (+)','Balance','Status']);
        hdr.height = 24;
        hdr.eachCell(cell => {
          cell.fill = { type:'pattern', pattern:'solid', fgColor:{ argb:'FF2563EB' } };
          cell.font = { bold:true, color:{ argb:'FFFFFFFF' }, size:11 };
          cell.alignment = { vertical:'middle', horizontal:'center', wrapText:true };
          cell.border = { bottom:{ style:'medium', color:{ argb:'FF60A5FA' } } };
        });

        // ── Data rows ──
        let runBal = acct.opening_balance || 0;
        rows.forEach((row, i) => {
          runBal += (row.credit||0) - (row.debit||0);
          const bal = row.balance != null ? row.balance : runBal;
          const dr = ws.addRow([
            row.txn_date, row.description||'', row.reference_no||'',
            row.debit||0, row.credit||0, bal,
            row.is_reconciled ? 'Cleared' : 'Pending'
          ]);
          dr.height = 20;
          const bg = row.is_reconciled ? 'FFD1FAE5' : (i%2===0?'FFFFFFFF':'FFF8FAFC');
          dr.eachCell({ includeEmpty:true }, (cell, ci) => {
            cell.fill = { type:'pattern', pattern:'solid', fgColor:{ argb:bg } };
            cell.alignment = { vertical:'middle' };
          });
          dr.getCell(1).alignment = { vertical:'middle', horizontal:'center' };
          const dc = dr.getCell(4);
          if (row.debit>0) { dc.font={ bold:true, color:{ argb:'FFDC2626' } }; dc.numFmt='"Rs."#,##0.00'; }
          const cc = dr.getCell(5);
          if (row.credit>0) { cc.font={ bold:true, color:{ argb:'FF059669' } }; cc.numFmt='"Rs."#,##0.00'; }
          const bc = dr.getCell(6);
          bc.font = { bold:true, color:{ argb: bal>=0?'FF0369A1':'FFDC2626' } };
          bc.numFmt = '"Rs."#,##0.00';
          const sc = dr.getCell(7);
          sc.font = { bold:true, color:{ argb: row.is_reconciled?'FF065F46':'FFB91C1C' } };
          sc.alignment = { vertical:'middle', horizontal:'center' };
        });

        // ── Total footer ──
        const ft = ws.addRow(['TOTAL', `${rows.length} rows`,'', totalDebit, totalCredit, netMov,'']);
        ft.height = 22;
        ft.eachCell((cell,i) => {
          cell.fill = { type:'pattern', pattern:'solid', fgColor:{ argb:'FF0F172A' } };
          cell.font = { bold:true, color:{ argb:'FFFFFFFF' }, size:11 };
          if (i>=4) { cell.numFmt='"Rs."#,##0.00'; }
          if (i===4) cell.font.color={ argb:'FFFCA5A5' };
          if (i===5) cell.font.color={ argb:'FF86EFAC' };
          if (i===6) cell.font.color={ argb: netMov>=0?'FF86EFAC':'FFFCA5A5' };
        });

        res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition','attachment; filename="bank-statement.xlsx"');
        wb.xlsx.write(res).then(()=>res.end()).catch(e=>res.status(500).json({ error:e.message }));
      }
    );
  });
});

// ── Export: PDF ───────────────────────────────────────────────
router.get('/export/pdf', (req, res) => {
  const { account_id } = req.query;
  if (!account_id) return res.status(400).json({ error: 'account_id required' });
  const { where, params } = buildStmtFilter(req.query);

  db.get('SELECT * FROM bank_accounts WHERE id=?', [account_id], (err, acct) => {
    if (err || !acct) return res.status(404).json({ error: 'Account not found' });

    db.all(`SELECT l.* FROM bank_statement_lines l WHERE ${where} ORDER BY l.txn_date ASC, l.id ASC`,
      params, (err2, rows) => {
        if (err2) return res.status(500).json({ error: err2.message });

        const PDFDocument = require('pdfkit');
        const doc = new PDFDocument({ size:'A4', margin:0, autoFirstPage:true, bufferPages:true });
        res.setHeader('Content-Type','application/pdf');
        res.setHeader('Content-Disposition','attachment; filename="bank-statement.pdf"');
        doc.pipe(res);

        // A4: 595.28 x 841.89 pt | 1 inch = 72pt margin
        const PW = 595.28, PH = 841.89, M = 72, CW = PW - M*2; // CW = 451.28

        // Column defs (widths sum to CW=451)
        const COLS = [
          { label:'Date',         w:60,  align:'left'  },
          { label:'Description',  w:153, align:'left'  },
          { label:'Reference No', w:58,  align:'left'  },
          { label:'Debit (–)',    w:55,  align:'right' },
          { label:'Credit (+)',   w:55,  align:'right' },
          { label:'Balance',      w:70,  align:'right' },
        ]; // 60+153+58+55+55+70 = 451 ✓

        const fmt  = n => `Rs.${Number(n||0).toFixed(2)}`;
        const fmtD = s => s ? new Date(s+'T00:00:00').toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : '—';
        const totalCredit = rows.reduce((s,r)=>s+(r.credit||0),0);
        const totalDebit  = rows.reduce((s,r)=>s+(r.debit||0),0);
        const netMov      = totalCredit - totalDebit;
        const cleared     = rows.filter(r=>r.is_reconciled).length;
        const { from, to } = req.query;

        let pageNum = 1;

        const drawPageHeader = (isFirst) => {
          // Full-width navy header
          doc.rect(0,0,PW,isFirst?110:50).fill('#0f172a');
          doc.rect(0,isFirst?108:48,PW,3).fill('#3b82f6');

          if (isFirst) {
            // Icon box
            doc.roundedRect(M,14,52,52,6).fill('#1e3a8a');
            doc.fillColor('#60a5fa').font('Helvetica-Bold').fontSize(22).text('B', M+16, 26);

            doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(18)
               .text('BANK STATEMENT', M+64, 16, { width: CW-64, lineBreak:false });
            doc.fillColor('#93c5fd').font('Helvetica').fontSize(10)
               .text(`${acct.account_name}${acct.bank_name?' | '+acct.bank_name:''}`, M+64, 40, { width: CW-64 });
            const pStr = (from||to) ? `Period: ${from?fmtD(from):'Start'} to ${to?fmtD(to):'End'}` : 'All Transactions';
            doc.fillColor('#bfdbfe').fontSize(9).text(pStr, M+64, 57);
            doc.fillColor('#94a3b8').fontSize(8)
               .text(`A/C: ${acct.account_no||'—'}  |  Branch: ${acct.branch||'—'}  |  IFSC: ${acct.ifsc||'—'}`, M+64, 72)
               .text(`Generated: ${new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'long',year:'numeric'})}`, M+64, 84);
          } else {
            doc.fillColor('#93c5fd').font('Helvetica-Bold').fontSize(10)
               .text(`BANK STATEMENT (cont.) — ${acct.account_name}`, M, 16, { width: CW });
            doc.fillColor('#94a3b8').font('Helvetica').fontSize(8)
               .text(`Page ${pageNum}`, M, 34, { width: CW, align:'right' });
          }
        };

        const drawSummary = (y) => {
          doc.rect(M, y, CW, 44).fill('#eff6ff');
          doc.rect(M, y, CW, 44).stroke('#bfdbfe');
          const items = [
            { label:'TRANSACTIONS', value:String(rows.length),         color:'#1e40af' },
            { label:'TOTAL DEBITS',  value:`-${fmt(totalDebit)}`,      color:'#dc2626' },
            { label:'TOTAL CREDITS', value:`+${fmt(totalCredit)}`,     color:'#059669' },
            { label:'NET MOVEMENT',  value:(netMov>=0?'+':'')+fmt(netMov), color:netMov>=0?'#059669':'#dc2626' },
            { label:'CLEARED',       value:`${cleared}/${rows.length}`,color:'#7c3aed' },
          ];
          const sw = CW / items.length;
          items.forEach((it, i) => {
            const sx = M + i*sw + 6;
            doc.fillColor('#94a3b8').font('Helvetica').fontSize(7).text(it.label, sx, y+8, { width:sw-8, lineBreak:false });
            doc.fillColor(it.color).font('Helvetica-Bold').fontSize(10).text(it.value, sx, y+22, { width:sw-8, lineBreak:false });
          });
          return y + 52;
        };

        const drawTableHeader = (y) => {
          doc.rect(M, y, CW, 20).fill('#1e3a8a');
          let x = M;
          COLS.forEach(col => {
            doc.fillColor('#e0f2fe').font('Helvetica-Bold').fontSize(8)
               .text(col.label, x+4, y+6, { width:col.w-8, align:col.align, lineBreak:false, ellipsis:true });
            x += col.w;
          });
          return y + 20;
        };

        const drawPageFooter = (yPos) => {
          doc.rect(0, PH-28, PW, 28).fill('#0f172a');
          doc.fillColor('#94a3b8').font('Helvetica').fontSize(8)
             .text(`Finance Monitor  |  Bank Statement  |  ${acct.account_name}  |  Page ${pageNum}`, 0, PH-18, { width:PW, align:'center' });
        };

        const ROW_H = 20;

        // ── Draw page 1 ──
        drawPageHeader(true);
        let y = 120;
        y = drawSummary(y);
        y += 6;
        y = drawTableHeader(y);

        let runBal = acct.opening_balance || 0;

        rows.forEach(row => {
          if (y + ROW_H > PH - M) {
            drawPageFooter(y);
            doc.addPage({ size:'A4', margin:0 });
            pageNum++;
            drawPageHeader(false);
            y = 62;
            y = drawTableHeader(y);
          }

          runBal += (row.credit||0) - (row.debit||0);
          const bal = row.balance != null ? row.balance : runBal;

          const rowBg = row.is_reconciled ? '#f0fdf4' : '#ffffff';
          doc.rect(M, y, CW, ROW_H).fill(rowBg);
          if (row.is_reconciled) doc.rect(M, y, 3, ROW_H).fill('#34d399');

          const vals = [
            { text: fmtD(row.txn_date),             color:'#475569' },
            { text: row.description||'—',            color:'#1e293b' },
            { text: row.reference_no||'—',           color:'#64748b' },
            { text: row.debit>0?`-${fmt(row.debit)}`:'—', color: row.debit>0?'#dc2626':'#94a3b8' },
            { text: row.credit>0?`+${fmt(row.credit)}`:'—', color: row.credit>0?'#059669':'#94a3b8' },
            { text: fmt(bal),                        color: bal>=0?'#0369a1':'#dc2626' },
          ];

          let x = M;
          vals.forEach((v,ci) => {
            doc.fillColor(v.color).font(ci>=3?'Helvetica-Bold':'Helvetica').fontSize(8)
               .text(v.text, x+4, y+6, { width:COLS[ci].w-8, align:COLS[ci].align, lineBreak:false, ellipsis:true });
            x += COLS[ci].w;
          });

          doc.moveTo(M, y+ROW_H).lineTo(M+CW, y+ROW_H).strokeColor('#e2e8f0').lineWidth(0.3).stroke();
          y += ROW_H;
        });

        // ── Total footer row ──
        doc.rect(M, y, CW, 22).fill('#0f172a');
        const ftVals = [
          { text:'TOTAL', color:'#ffffff' },
          { text:`${rows.length} transactions`, color:'#93c5fd' },
          { text:'', color:'#ffffff' },
          { text:`-${fmt(totalDebit)}`, color:'#fca5a5' },
          { text:`+${fmt(totalCredit)}`, color:'#86efac' },
          { text:(netMov>=0?'+':'')+fmt(netMov), color:netMov>=0?'#86efac':'#fca5a5' },
        ];
        let fx = M;
        ftVals.forEach((v,ci) => {
          doc.fillColor(v.color).font('Helvetica-Bold').fontSize(8)
             .text(v.text, fx+4, y+7, { width:COLS[ci].w-8, align:COLS[ci].align, lineBreak:false });
          fx += COLS[ci].w;
        });
        y += 22;

        drawPageFooter(y);
        doc.end();
      }
    );
  });
});

module.exports = router;
