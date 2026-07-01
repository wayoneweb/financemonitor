import React, { useState, useEffect, useContext, useMemo } from 'react';
import { ToastContext } from '../App';
import { bankApi } from '../api';
import './BankReconciliation.css';

// ── Constants ────────────────────────────────────────────────
const ACCOUNT_TYPES = {
  savings:   { label:'Savings',   icon:'fa-piggy-bank'           },
  current:   { label:'Current',   icon:'fa-rotate'               },
  fixed:     { label:'Fixed Dep', icon:'fa-lock'                 },
  overdraft: { label:'Overdraft', icon:'fa-arrow-down-wide-short'},
};
const PALETTE = ['#3b82f6','#6366f1','#8b5cf6','#ec4899','#f97316','#10b981','#06b6d4','#f59e0b','#ef4444','#64748b'];
const ACC_EMPTY  = { account_name:'', bank_name:'', account_no:'', account_type:'savings', branch:'', ifsc:'', opening_balance:'', color:'#3b82f6', notes:'' };
const LINE_EMPTY = { txn_date:'', description:'', reference_no:'', debit:'', credit:'', balance:'', notes:'' };
const FILTER_EMPTY = { search:'', from:'', to:'', type:'all', reconciled:'all' };
const STMT_PAGE_SIZE = 20;
const todayStr = () => new Date().toISOString().slice(0,10);

const fmtAmt  = n => `Rs. ${Number(n||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const fmtDate = s => s ? new Date(s+'T00:00:00').toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : '—';
const sign    = n => n >= 0 ? '+' : '';

function parsePaste(text, accountId) {
  const result = [];
  for (const line of text.trim().split('\n').filter(Boolean)) {
    const cols = line.split(/\t|,/).map(s => s.trim().replace(/^"|"$/g,''));
    if (cols.length < 3) continue;
    const date = cols[0];
    if (!date || !/\d/.test(date)) continue;
    let txnDate = date;
    const dm = date.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
    if (dm) {
      const y = dm[3].length===2 ? '20'+dm[3] : dm[3];
      txnDate = `${y}-${dm[2].padStart(2,'0')}-${dm[1].padStart(2,'0')}`;
    }
    result.push({ account_id:accountId, txn_date:txnDate, description:cols[1]||'', reference_no:'',
      debit: parseFloat((cols[2]||'').replace(/,/g,''))||0,
      credit: parseFloat((cols[3]||'').replace(/,/g,''))||0,
      balance: cols[4] ? parseFloat(cols[4].replace(/,/g,''))||undefined : undefined, notes:'' });
  }
  return result;
}

function pagesToShow(current, total) {
  if (total <= 7) return Array.from({length:total}, (_,i)=>i+1);
  const pages = [1];
  if (current > 3) pages.push('...');
  for (let p = Math.max(2, current-1); p <= Math.min(total-1, current+1); p++) pages.push(p);
  if (current < total-2) pages.push('...');
  pages.push(total);
  return pages;
}

async function downloadBlob(url, filename) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('Export failed');
  const blob = await r.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ── Main Component ────────────────────────────────────────────
export default function BankReconciliation() {
  const showToast = useContext(ToastContext);

  // Accounts
  const [accounts,    setAccounts]    = useState([]);
  const [selId,       setSelId]       = useState(null);
  const [accModal,    setAccModal]    = useState(false);
  const [editAcc,     setEditAcc]     = useState(null);
  const [accForm,     setAccForm]     = useState(ACC_EMPTY);
  const [accSaving,   setAccSaving]   = useState(false);
  const [accDeleting, setAccDeleting] = useState(null);

  // Workspace
  const [tab,         setTab]         = useState('statement');
  const [statements,  setStatements]  = useState([]);
  const [sessions,    setSessions]    = useState([]);
  const [stmtLoading, setStmtLoading] = useState(false);

  // Statement filters + pagination
  const [filterOpen,  setFilterOpen]  = useState(false);
  const [stmtFilter,  setStmtFilter]  = useState(FILTER_EMPTY);
  const [stmtPage,    setStmtPage]    = useState(1);
  const [exporting,   setExporting]   = useState(null); // 'pdf'|'excel'|null

  // Statement line modal
  const [lineModal,    setLineModal]   = useState(false);
  const [editLine,     setEditLine]    = useState(null);
  const [lineForm,     setLineForm]    = useState(LINE_EMPTY);
  const [lineSaving,   setLineSaving]  = useState(false);
  const [lineDeleting, setLineDeleting]= useState(null);

  // Bulk paste modal
  const [bulkModal,   setBulkModal]   = useState(false);
  const [bulkText,    setBulkText]    = useState('');
  const [bulkParsed,  setBulkParsed]  = useState([]);
  const [bulkSaving,  setBulkSaving]  = useState(false);

  // Reconcile tab
  const [rFrom,      setRFrom]      = useState('');
  const [rTo,        setRTo]        = useState('');
  const [rOpening,   setROpening]   = useState('');
  const [rClosing,   setRClosing]   = useState('');
  const [rNotes,     setRNotes]     = useState('');
  const [checkedIds, setCheckedIds] = useState(new Set());
  const [rLines,     setRLines]     = useState([]);
  const [rLoading,   setRLoading]   = useState(false);
  const [rSaving,    setRSaving]    = useState(false);
  const [rSaved,     setRSaved]     = useState(false);

  const selectedAccount = useMemo(() => accounts.find(a=>a.id===selId)||null, [accounts, selId]);

  // ── Running balance map (full list, unfiltered) ────────────
  const runBalMap = useMemo(() => {
    const map = {};
    let bal = selectedAccount ? (selectedAccount.opening_balance||0) : 0;
    statements.forEach(l => { bal += (l.credit||0) - (l.debit||0); map[l.id] = bal; });
    return map;
  }, [statements, selectedAccount]);

  // ── Filtered + paginated statements ────────────────────────
  const filteredStmts = useMemo(() => {
    let rows = [...statements];
    const q = stmtFilter.search.toLowerCase();
    if (q) rows = rows.filter(l => (l.description||'').toLowerCase().includes(q) || (l.reference_no||'').toLowerCase().includes(q));
    if (stmtFilter.from) rows = rows.filter(l => l.txn_date >= stmtFilter.from);
    if (stmtFilter.to)   rows = rows.filter(l => l.txn_date <= stmtFilter.to);
    if (stmtFilter.type === 'credit') rows = rows.filter(l => l.credit > 0);
    if (stmtFilter.type === 'debit')  rows = rows.filter(l => l.debit > 0);
    if (stmtFilter.reconciled === '1') rows = rows.filter(l => l.is_reconciled);
    if (stmtFilter.reconciled === '0') rows = rows.filter(l => !l.is_reconciled);
    return rows;
  }, [statements, stmtFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredStmts.length / STMT_PAGE_SIZE));

  const pageStmts = useMemo(() => {
    const start = (stmtPage-1) * STMT_PAGE_SIZE;
    return filteredStmts.slice(start, start + STMT_PAGE_SIZE);
  }, [filteredStmts, stmtPage]);

  const activeFilterCount = useMemo(() => [
    stmtFilter.search, stmtFilter.from, stmtFilter.to,
    stmtFilter.type !== 'all', stmtFilter.reconciled !== 'all'
  ].filter(Boolean).length, [stmtFilter]);

  const stmtStats = useMemo(() => {
    const credits    = statements.reduce((s,l)=>s+(l.credit||0),0);
    const debits     = statements.reduce((s,l)=>s+(l.debit||0),0);
    const reconciled = statements.filter(l=>l.is_reconciled).length;
    return { credits, debits, reconciled, total:statements.length };
  }, [statements]);

  // Reset page when filter or account changes
  useEffect(() => { setStmtPage(1); }, [stmtFilter, selId]);

  // ── Loaders ────────────────────────────────────────────────
  const loadAccounts   = async () => { try { const d=await bankApi.accounts(); setAccounts(d||[]); } catch {} };
  const loadStatements = async id => {
    if (!id) return; setStmtLoading(true);
    try { const d=await bankApi.statements({account_id:id}); setStatements(d||[]); } catch {}
    finally { setStmtLoading(false); }
  };
  const loadSessions = async id => { if (!id) return; try { const d=await bankApi.sessions({account_id:id}); setSessions(d||[]); } catch {} };
  const loadReconcileLines = async () => {
    if (!selId||!rFrom||!rTo) return;
    setRLoading(true); setCheckedIds(new Set());
    try {
      const d = await bankApi.statements({ account_id:selId, from:rFrom, to:rTo });
      setRLines(d||[]);
      setCheckedIds(new Set((d||[]).filter(l=>l.is_reconciled).map(l=>l.id)));
    } catch {}
    finally { setRLoading(false); }
  };

  useEffect(() => { loadAccounts(); }, []);
  useEffect(() => { if (selId) { loadStatements(selId); loadSessions(selId); } }, [selId]); // eslint-disable-line

  // ── Account CRUD ───────────────────────────────────────────
  const openAddAcc  = () => { setAccForm(ACC_EMPTY); setEditAcc(null); setAccModal(true); };
  const openEditAcc = a => {
    setAccForm({ account_name:a.account_name||'', bank_name:a.bank_name||'', account_no:a.account_no||'',
      account_type:a.account_type||'savings', branch:a.branch||'', ifsc:a.ifsc||'',
      opening_balance:a.opening_balance||'', color:a.color||'#3b82f6', notes:a.notes||'' });
    setEditAcc(a); setAccModal(true);
  };
  const saveAcc = async () => {
    if (!accForm.account_name.trim()) return showToast('Account name required','error');
    setAccSaving(true);
    try {
      if (editAcc) await bankApi.updateAccount(editAcc.id, accForm);
      else await bankApi.createAccount(accForm);
      showToast(editAcc?'Account updated':'Account added','success');
      setAccModal(false); loadAccounts();
    } catch { showToast('Failed to save','error'); }
    finally { setAccSaving(false); }
  };
  const deleteAcc = async a => {
    if (!window.confirm(`Delete "${a.account_name}" and ALL its statement lines?`)) return;
    setAccDeleting(a.id);
    try { await bankApi.deleteAccount(a.id); showToast('Account deleted','success'); loadAccounts(); if (selId===a.id) setSelId(null); }
    catch { showToast('Failed to delete','error'); }
    finally { setAccDeleting(null); }
  };

  // ── Statement Line CRUD ────────────────────────────────────
  const openAddLine  = () => { setLineForm({...LINE_EMPTY, txn_date:todayStr()}); setEditLine(null); setLineModal(true); };
  const openEditLine = l => {
    setLineForm({ txn_date:l.txn_date||'', description:l.description||'', reference_no:l.reference_no||'',
      debit:l.debit||'', credit:l.credit||'', balance:l.balance!=null&&l.balance!==undefined?l.balance:'', notes:l.notes||'' });
    setEditLine(l); setLineModal(true);
  };
  const saveLine = async () => {
    if (!lineForm.txn_date) return showToast('Date required','error');
    setLineSaving(true);
    try {
      const payload = { ...lineForm, account_id:selId };
      if (editLine) await bankApi.updateLine(editLine.id, payload);
      else await bankApi.addLine(payload);
      showToast(editLine?'Line updated':'Line added','success');
      setLineModal(false); loadStatements(selId);
    } catch { showToast('Failed to save','error'); }
    finally { setLineSaving(false); }
  };
  const deleteLine = async l => {
    if (!window.confirm('Delete this statement line?')) return;
    setLineDeleting(l.id);
    try { await bankApi.deleteLine(l.id); showToast('Deleted','success'); loadStatements(selId); }
    catch { showToast('Failed','error'); }
    finally { setLineDeleting(null); }
  };
  const toggleLine = async l => {
    try { const d=await bankApi.toggleLine(l.id); setStatements(prev=>prev.map(x=>x.id===l.id?{...x,is_reconciled:d.is_reconciled}:x)); }
    catch { showToast('Failed','error'); }
  };

  // ── Bulk paste ─────────────────────────────────────────────
  const parseBulk = () => setBulkParsed(parsePaste(bulkText, selId));
  const saveBulk  = async () => {
    if (!bulkParsed.length) return; setBulkSaving(true);
    try {
      const d = await bankApi.bulkLines({ account_id:selId, lines:bulkParsed });
      showToast(`${d.inserted} lines imported`,'success');
      setBulkModal(false); setBulkText(''); setBulkParsed([]); loadStatements(selId);
    } catch { showToast('Import failed','error'); }
    finally { setBulkSaving(false); }
  };

  // ── Reconcile logic ────────────────────────────────────────
  const toggleCheck = id => { setCheckedIds(prev=>{ const n=new Set(prev); n.has(id)?n.delete(id):n.add(id); return n; }); setRSaved(false); };
  const checkAll    = () => { setCheckedIds(new Set(rLines.map(l=>l.id))); setRSaved(false); };
  const uncheckAll  = () => { setCheckedIds(new Set()); setRSaved(false); };

  const recon = useMemo(() => {
    const opening       = parseFloat(rOpening)||0;
    const stmtClose     = parseFloat(rClosing)||0;
    const checked       = rLines.filter(l=>checkedIds.has(l.id));
    const unchecked     = rLines.filter(l=>!checkedIds.has(l.id));
    const clearedCredit = checked.reduce((s,l)=>s+(l.credit||0),0);
    const clearedDebit  = checked.reduce((s,l)=>s+(l.debit||0),0);
    const clearedBal    = opening + clearedCredit - clearedDebit;
    const difference    = clearedBal - stmtClose;
    return { opening, stmtClose, clearedCredit, clearedDebit, clearedBal, difference,
             checkedCount:checked.length, total:rLines.length,
             uncheckedCredits:unchecked.filter(l=>l.credit>0),
             uncheckedDebits:unchecked.filter(l=>l.debit>0) };
  }, [rLines, checkedIds, rOpening, rClosing]);

  const saveReconciliation = async () => {
    if (!selId||!rFrom||!rTo) return showToast('Please set period first','error');
    setRSaving(true);
    try {
      await bankApi.saveSession({ account_id:selId, period_from:rFrom, period_to:rTo,
        opening_balance:recon.opening, statement_closing:recon.stmtClose,
        cleared_balance:recon.clearedBal, difference:recon.difference,
        cleared_count:recon.checkedCount, outstanding_count:recon.total-recon.checkedCount,
        status:Math.abs(recon.difference)<0.01?'completed':'in_progress', notes:rNotes,
        mark_reconciled:[...checkedIds] });
      showToast('Reconciliation saved','success');
      setRSaved(true); loadSessions(selId); loadStatements(selId);
    } catch { showToast('Failed to save','error'); }
    finally { setRSaving(false); }
  };

  const selectAccount = id => {
    setSelId(id); setTab('statement');
    setRFrom(''); setRTo(''); setROpening(''); setRClosing(''); setCheckedIds(new Set()); setRSaved(false);
    setStmtFilter(FILTER_EMPTY); setFilterOpen(false); setStmtPage(1);
  };

  // ── Export handlers ────────────────────────────────────────
  const buildExportParams = () => {
    const p = { account_id: selId };
    if (stmtFilter.from) p.from = stmtFilter.from;
    if (stmtFilter.to)   p.to   = stmtFilter.to;
    if (stmtFilter.type !== 'all') p.type = stmtFilter.type;
    if (stmtFilter.reconciled !== 'all') p.reconciled = stmtFilter.reconciled;
    if (stmtFilter.search) p.search = stmtFilter.search;
    return p;
  };
  const doExport = async (kind) => {
    if (!selId) return;
    setExporting(kind);
    try {
      const p = buildExportParams();
      const accName = selectedAccount?.account_name || 'account';
      const ts = new Date().toISOString().slice(0,10);
      if (kind === 'excel') {
        await downloadBlob(bankApi.exportExcelUrl(p), `bank-${accName}-${ts}.xlsx`);
        showToast('Excel exported','success');
      } else {
        await downloadBlob(bankApi.exportPdfUrl(p), `bank-${accName}-${ts}.pdf`);
        showToast('PDF exported','success');
      }
    } catch { showToast('Export failed','error'); }
    finally { setExporting(null); }
  };

  const setFilter = (key, val) => { setStmtFilter(f=>({...f,[key]:val})); };
  const clearFilters = () => setStmtFilter(FILTER_EMPTY);

  // ── Render ─────────────────────────────────────────────────
  return (
    <div className="br-page">

      {/* ── Left Sidebar ──────────────────────────────────── */}
      <div className="br-sidebar">
        <div className="br-sidebar-hdr">
          <div className="br-sidebar-title"><i className="fa fa-building-columns" /> Bank Accounts</div>
          <button className="br-add-acc-btn" onClick={openAddAcc}><i className="fa fa-plus" /></button>
        </div>
        <div className="br-acc-list">
          {accounts.length === 0 && (
            <div className="br-acc-empty">
              <i className="fa fa-building-columns" /><p>No accounts yet</p>
              <button onClick={openAddAcc}>Add your first account</button>
            </div>
          )}
          {accounts.map(a => {
            const at  = ACCOUNT_TYPES[a.account_type]||ACCOUNT_TYPES.savings;
            const net = (a.opening_balance||0)+(a.net_movement||0);
            return (
              <div key={a.id} className={`br-acc-card${selId===a.id?' selected':''}`} onClick={()=>selectAccount(a.id)}>
                <div className="br-acc-card-icon" style={{background:a.color}}><i className={`fa ${at.icon}`}/></div>
                <div className="br-acc-card-body">
                  <div className="br-acc-name">{a.account_name}</div>
                  <div className="br-acc-bank">{a.bank_name||at.label}{a.account_no?` ···${a.account_no.slice(-4)}`:''}</div>
                  <div className="br-acc-bal" style={{color:net>=0?'#10b981':'#ef4444'}}>{fmtAmt(net)}</div>
                </div>
                {a.unreconciled>0 && <span className="br-unrec-badge">{a.unreconciled}</span>}
                <div className="br-acc-actions" onClick={e=>e.stopPropagation()}>
                  <button className="bra-btn" onClick={()=>openEditAcc(a)}><i className="fa fa-pen"/></button>
                  <button className="bra-btn del" onClick={()=>deleteAcc(a)} disabled={accDeleting===a.id}>
                    {accDeleting===a.id?<i className="fa fa-spinner fa-spin"/>:<i className="fa fa-trash"/>}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        {accounts.length>0 && (
          <div className="br-total-strip">
            <div className="br-total-label">Total Balance (all accounts)</div>
            <div className="br-total-val">{fmtAmt(accounts.reduce((s,a)=>(a.opening_balance||0)+(a.net_movement||0)+s,0))}</div>
          </div>
        )}
      </div>

      {/* ── Right Workspace ───────────────────────────────── */}
      <div className="br-workspace">
        {!selectedAccount ? (
          <div className="br-no-select">
            <div className="br-no-select-icon"><i className="fa fa-building-columns"/></div>
            <h2>Bank Reconciliation</h2>
            <p>Select a bank account to view statements and reconcile, or add a new account to get started.</p>
            <button className="br-cta-btn" onClick={openAddAcc}><i className="fa fa-plus"/> Add Bank Account</button>
          </div>
        ) : (
          <>
            {/* Account header */}
            <div className="br-ws-header" style={{borderLeftColor:selectedAccount.color}}>
              <div className="br-ws-acc-icon" style={{background:selectedAccount.color}}>
                <i className={`fa ${ACCOUNT_TYPES[selectedAccount.account_type]?.icon||'fa-building-columns'}`}/>
              </div>
              <div className="br-ws-acc-info">
                <div className="br-ws-acc-name">{selectedAccount.account_name}</div>
                <div className="br-ws-acc-meta">
                  {selectedAccount.bank_name && <span><i className="fa fa-university"/> {selectedAccount.bank_name}</span>}
                  {selectedAccount.account_no && <span><i className="fa fa-hashtag"/> {selectedAccount.account_no}</span>}
                  {selectedAccount.branch && <span><i className="fa fa-location-dot"/> {selectedAccount.branch}</span>}
                  {selectedAccount.ifsc && <span><i className="fa fa-code"/> {selectedAccount.ifsc}</span>}
                </div>
              </div>
              <div className="br-ws-acc-stats">
                <div className="br-ws-stat"><div className="br-ws-stat-lbl">Opening</div><div className="br-ws-stat-val">{fmtAmt(selectedAccount.opening_balance)}</div></div>
                <div className="br-ws-stat"><div className="br-ws-stat-lbl">Current</div><div className="br-ws-stat-val green">{fmtAmt((selectedAccount.opening_balance||0)+(selectedAccount.net_movement||0))}</div></div>
                <div className="br-ws-stat"><div className="br-ws-stat-lbl">Unreconciled</div><div className={`br-ws-stat-val ${selectedAccount.unreconciled>0?'red':''}`}>{selectedAccount.unreconciled||0}</div></div>
                {selectedAccount.last_reconciled && <div className="br-ws-stat"><div className="br-ws-stat-lbl">Last Reconciled</div><div className="br-ws-stat-val">{fmtDate(selectedAccount.last_reconciled)}</div></div>}
              </div>
            </div>

            {/* Tabs */}
            <div className="br-tabs">
              {[['statement','fa-list-ul','Statement'],['reconcile','fa-scale-balanced','Reconcile'],['history','fa-clock-rotate-left','History']].map(([t,icon,lbl])=>(
                <button key={t} className={`br-tab${tab===t?' active':''}`} onClick={()=>setTab(t)}>
                  <i className={`fa ${icon}`}/> {lbl}
                  {t==='statement'&&statements.length>0&&<span className="br-tab-count">{statements.length}</span>}
                  {t==='history'&&sessions.length>0&&<span className="br-tab-count">{sessions.length}</span>}
                </button>
              ))}
            </div>

            {/* ── Tab: Statement ─────────────────────────── */}
            {tab==='statement' && (
              <div className="br-tab-body">

                {/* ── Toolbar ─── */}
                <div className="br-toolbar">
                  <div className="br-search-wrap">
                    <i className="fa fa-magnifying-glass br-search-ico"/>
                    <input className="br-search-inp" value={stmtFilter.search}
                      onChange={e=>setFilter('search',e.target.value)}
                      placeholder="Search description or reference…"/>
                    {stmtFilter.search && <button className="br-search-clear" onClick={()=>setFilter('search','')}><i className="fa fa-xmark"/></button>}
                  </div>
                  <button className={`br-filter-btn${filterOpen?' active':''}`} onClick={()=>setFilterOpen(o=>!o)}>
                    <i className="fa fa-filter"/> Filters
                    {activeFilterCount>0 && <span className="br-filter-badge">{activeFilterCount}</span>}
                  </button>
                  <div className="br-toolbar-sep"/>
                  <div className="br-export-grp">
                    <button className="br-export-btn excel" onClick={()=>doExport('excel')} disabled={!!exporting} title="Export to Excel">
                      {exporting==='excel'?<i className="fa fa-spinner fa-spin"/>:<i className="fa fa-file-excel"/>}
                      <span>Excel</span>
                    </button>
                    <button className="br-export-btn pdf" onClick={()=>doExport('pdf')} disabled={!!exporting} title="Export to PDF">
                      {exporting==='pdf'?<i className="fa fa-spinner fa-spin"/>:<i className="fa fa-file-pdf"/>}
                      <span>PDF</span>
                    </button>
                  </div>
                  <div className="br-toolbar-sep"/>
                  <button className="br-btn-sm secondary" onClick={()=>setBulkModal(true)}>
                    <i className="fa fa-file-import"/> Import
                  </button>
                  <button className="br-btn-sm primary" onClick={openAddLine}>
                    <i className="fa fa-plus"/> Add Line
                  </button>
                </div>

                {/* ── Filter Panel ─── */}
                {filterOpen && (
                  <div className="br-filter-panel">
                    <div className="br-fp-row">
                      <div className="br-fp-group">
                        <div className="br-fp-label"><i className="fa fa-arrow-right-arrow-left"/> Type</div>
                        <div className="br-fp-pills">
                          {[['all','All'],['credit','Credits (+)'],['debit','Debits (–)']].map(([v,l])=>(
                            <button key={v} className={`br-fpill type${stmtFilter.type===v?' sel':''}`} onClick={()=>setFilter('type',v)}>{l}</button>
                          ))}
                        </div>
                      </div>
                      <div className="br-fp-group">
                        <div className="br-fp-label"><i className="fa fa-circle-check"/> Status</div>
                        <div className="br-fp-pills">
                          {[['all','All'],['1','Cleared'],['0','Pending']].map(([v,l])=>(
                            <button key={v} className={`br-fpill rec${stmtFilter.reconciled===v?' sel':''}`} onClick={()=>setFilter('reconciled',v)}>{l}</button>
                          ))}
                        </div>
                      </div>
                      <div className="br-fp-group">
                        <div className="br-fp-label"><i className="fa fa-calendar"/> From Date</div>
                        <input type="date" className="br-fp-date" value={stmtFilter.from} onChange={e=>setFilter('from',e.target.value)}/>
                      </div>
                      <div className="br-fp-group">
                        <div className="br-fp-label"><i className="fa fa-calendar"/> To Date</div>
                        <input type="date" className="br-fp-date" value={stmtFilter.to} onChange={e=>setFilter('to',e.target.value)}/>
                      </div>
                      {activeFilterCount>0 && (
                        <div className="br-fp-group br-fp-clear-group">
                          <button className="br-fp-clear-btn" onClick={clearFilters}>
                            <i className="fa fa-rotate-left"/> Clear All Filters
                          </button>
                        </div>
                      )}
                    </div>
                    {activeFilterCount>0 && (
                      <div className="br-fp-result">
                        Showing <strong>{filteredStmts.length}</strong> of <strong>{statements.length}</strong> transactions
                        {stmtStats.credits>0 && <> · Credits: <span className="green">{fmtAmt(filteredStmts.reduce((s,l)=>s+(l.credit||0),0))}</span></>}
                        {stmtStats.debits>0  && <> · Debits: <span className="red">{fmtAmt(filteredStmts.reduce((s,l)=>s+(l.debit||0),0))}</span></>}
                      </div>
                    )}
                  </div>
                )}

                {/* ── Summary bar ─── */}
                <div className="br-stmt-summary">
                  <div className="br-ss-item"><span>Total Credits</span><strong className="green">+{fmtAmt(stmtStats.credits)}</strong></div>
                  <div className="br-ss-item"><span>Total Debits</span><strong className="red">-{fmtAmt(stmtStats.debits)}</strong></div>
                  <div className="br-ss-item"><span>Net Movement</span>
                    <strong className={stmtStats.credits-stmtStats.debits>=0?'green':'red'}>
                      {sign(stmtStats.credits-stmtStats.debits)}{fmtAmt(Math.abs(stmtStats.credits-stmtStats.debits))}
                    </strong>
                  </div>
                  <div className="br-ss-item"><span>Reconciled</span><strong>{stmtStats.reconciled} / {stmtStats.total}</strong></div>
                </div>

                {/* ── Table ─── */}
                {stmtLoading ? (
                  <div className="br-loading"><i className="fa fa-spinner fa-spin"/> Loading…</div>
                ) : filteredStmts.length===0 ? (
                  <div className="br-empty">
                    <i className="fa fa-file-invoice"/>
                    <p>{statements.length===0 ? 'No statement lines yet. Add lines or use Paste Import.' : 'No lines match the current filters.'}</p>
                    {statements.length>0 && activeFilterCount>0 && <button className="br-btn-sm secondary" onClick={clearFilters}>Clear Filters</button>}
                  </div>
                ) : (
                  <>
                    <div className="br-stmt-table-wrap">
                      <table className="br-stmt-table">
                        <thead>
                          <tr><th>#</th><th>Date</th><th>Description</th><th>Ref No.</th><th>Debit (–)</th><th>Credit (+)</th><th>Balance</th><th>Reconciled</th><th>Actions</th></tr>
                        </thead>
                        <tbody>
                          {pageStmts.map((l, i) => {
                            const globalIdx = (stmtPage-1)*STMT_PAGE_SIZE + i + 1;
                            const runBal = runBalMap[l.id] ?? 0;
                            return (
                              <tr key={l.id} className={l.is_reconciled?'row-rec':''}>
                                <td className="td-num">{globalIdx}</td>
                                <td className="td-date">{fmtDate(l.txn_date)}</td>
                                <td className="td-desc">
                                  <div className="td-desc-main">{l.description||'—'}</div>
                                  {l.notes && <div className="td-note">{l.notes}</div>}
                                </td>
                                <td className="td-ref">{l.reference_no||'—'}</td>
                                <td className="td-debit">{l.debit>0?<span className="amt-debit">-{fmtAmt(l.debit)}</span>:'—'}</td>
                                <td className="td-credit">{l.credit>0?<span className="amt-credit">+{fmtAmt(l.credit)}</span>:'—'}</td>
                                <td className="td-bal">
                                  {l.balance!=null&&l.balance!==undefined
                                    ?<span className={l.balance>=0?'bal-pos':'bal-neg'}>{fmtAmt(l.balance)}</span>
                                    :<span className={runBal>=0?'bal-pos':'bal-neg'}>{fmtAmt(runBal)}</span>}
                                </td>
                                <td>
                                  <button className={`rec-toggle${l.is_reconciled?' is-rec':''}`} onClick={()=>toggleLine(l)}>
                                    {l.is_reconciled?<><i className="fa fa-circle-check"/> Cleared</>:<><i className="fa fa-circle"/> Pending</>}
                                  </button>
                                </td>
                                <td>
                                  <div className="td-actions">
                                    <button className="ta-btn" onClick={()=>openEditLine(l)}><i className="fa fa-pen"/></button>
                                    <button className="ta-btn del" onClick={()=>deleteLine(l)} disabled={lineDeleting===l.id}>
                                      {lineDeleting===l.id?<i className="fa fa-spinner fa-spin"/>:<i className="fa fa-trash"/>}
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* ── Pagination ─── */}
                    {totalPages>1 && (
                      <div className="br-pagination">
                        <button className="br-pg-btn nav" onClick={()=>setStmtPage(p=>Math.max(1,p-1))} disabled={stmtPage===1}>
                          <i className="fa fa-chevron-left"/> Prev
                        </button>
                        <div className="br-pg-numbers">
                          {pagesToShow(stmtPage,totalPages).map((p,i)=>
                            p==='...'
                              ? <span key={`e${i}`} className="br-pg-ellipsis">…</span>
                              : <button key={p} className={`br-pg-btn num${stmtPage===p?' active':''}`} onClick={()=>setStmtPage(p)}>{p}</button>
                          )}
                        </div>
                        <button className="br-pg-btn nav" onClick={()=>setStmtPage(p=>Math.min(totalPages,p+1))} disabled={stmtPage===totalPages}>
                          Next <i className="fa fa-chevron-right"/>
                        </button>
                        <span className="br-pg-info">
                          {((stmtPage-1)*STMT_PAGE_SIZE)+1}–{Math.min(stmtPage*STMT_PAGE_SIZE, filteredStmts.length)} of {filteredStmts.length} · Page {stmtPage}/{totalPages}
                        </span>
                      </div>
                    )}
                    {totalPages===1 && filteredStmts.length>0 && (
                      <div className="br-pg-count">{filteredStmts.length} transaction{filteredStmts.length!==1?'s':''}</div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* ── Tab: Reconcile ─────────────────────────── */}
            {tab==='reconcile' && (
              <div className="br-tab-body">
                <div className="br-rec-setup">
                  <div className="br-rs-title"><i className="fa fa-scale-balanced"/> Reconciliation Setup</div>
                  <div className="br-rs-fields">
                    <div className="br-rs-field"><label>Period From</label>
                      <input type="date" value={rFrom} onChange={e=>{setRFrom(e.target.value);setRSaved(false);}}/>
                    </div>
                    <div className="br-rs-field"><label>Period To</label>
                      <input type="date" value={rTo} onChange={e=>{setRTo(e.target.value);setRSaved(false);}}/>
                    </div>
                    <div className="br-rs-field"><label>Opening Balance (Books)</label>
                      <div className="br-rs-inp-wrap"><i className="fa fa-indian-rupee-sign br-inp-ico"/>
                        <input type="number" value={rOpening} onChange={e=>{setROpening(e.target.value);setRSaved(false);}} placeholder={String(selectedAccount.opening_balance||0)}/>
                      </div>
                    </div>
                    <div className="br-rs-field"><label>Statement Closing Balance</label>
                      <div className="br-rs-inp-wrap"><i className="fa fa-indian-rupee-sign br-inp-ico"/>
                        <input type="number" value={rClosing} onChange={e=>{setRClosing(e.target.value);setRSaved(false);}} placeholder="Enter from bank statement"/>
                      </div>
                    </div>
                    <button className="br-btn-sm primary" onClick={loadReconcileLines} disabled={!rFrom||!rTo}>
                      <i className="fa fa-magnifying-glass"/> Load Lines
                    </button>
                  </div>
                </div>

                {rLines.length===0&&!rLoading && (
                  <div className="br-empty" style={{marginTop:16}}>
                    {rFrom&&rTo?'No lines for this period. Add lines in the Statement tab first.':'Set the period and click "Load Lines" to begin.'}
                  </div>
                )}
                {rLoading && <div className="br-loading"><i className="fa fa-spinner fa-spin"/> Loading lines…</div>}

                {rLines.length>0 && (
                  <>
                    <div className="br-check-bar">
                      <span className="br-check-info">{checkedIds.size} of {rLines.length} items cleared</span>
                      <button className="br-btn-xs" onClick={checkAll}>Check All</button>
                      <button className="br-btn-xs" onClick={uncheckAll}>Uncheck All</button>
                    </div>
                    <div className="br-rec-table-wrap">
                      <table className="br-rec-table">
                        <thead>
                          <tr><th className="th-check">✓</th><th>Date</th><th>Description</th><th>Ref</th><th>Debit (–)</th><th>Credit (+)</th><th>Status</th></tr>
                        </thead>
                        <tbody>
                          {rLines.map(l=>{
                            const checked=checkedIds.has(l.id);
                            return (
                              <tr key={l.id} className={`rec-row${checked?' rec-checked':''}`} onClick={()=>toggleCheck(l.id)} style={{cursor:'pointer'}}>
                                <td className="td-checkbox"><div className={`br-checkbox${checked?' checked':''}`}>{checked&&<i className="fa fa-check"/>}</div></td>
                                <td className="td-date">{fmtDate(l.txn_date)}</td>
                                <td className="td-desc"><div>{l.description||'—'}</div>{l.notes&&<div className="td-note">{l.notes}</div>}</td>
                                <td className="td-ref">{l.reference_no||'—'}</td>
                                <td>{l.debit>0?<span className="amt-debit">-{fmtAmt(l.debit)}</span>:'—'}</td>
                                <td>{l.credit>0?<span className="amt-credit">+{fmtAmt(l.credit)}</span>:'—'}</td>
                                <td><span className={`rec-status-tag${checked?' cleared':''}`}>{checked?'Cleared':'Pending'}</span></td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {(recon.uncheckedDebits.length>0||recon.uncheckedCredits.length>0) && (
                      <div className="br-outstanding">
                        <div className="br-out-title"><i className="fa fa-triangle-exclamation"/> Outstanding Items</div>
                        <div className="br-out-cols">
                          {recon.uncheckedDebits.length>0 && (
                            <div className="br-out-col">
                              <div className="br-out-col-hdr red">Uncleared Payments / Debits</div>
                              {recon.uncheckedDebits.map(l=>(
                                <div key={l.id} className="br-out-item">
                                  <span>{fmtDate(l.txn_date)} — {l.description||'No desc'}</span>
                                  <span className="amt-debit">-{fmtAmt(l.debit)}</span>
                                </div>
                              ))}
                              <div className="br-out-total">Total: <span className="amt-debit">-{fmtAmt(recon.uncheckedDebits.reduce((s,l)=>s+(l.debit||0),0))}</span></div>
                            </div>
                          )}
                          {recon.uncheckedCredits.length>0 && (
                            <div className="br-out-col">
                              <div className="br-out-col-hdr green">Deposits in Transit</div>
                              {recon.uncheckedCredits.map(l=>(
                                <div key={l.id} className="br-out-item">
                                  <span>{fmtDate(l.txn_date)} — {l.description||'No desc'}</span>
                                  <span className="amt-credit">+{fmtAmt(l.credit)}</span>
                                </div>
                              ))}
                              <div className="br-out-total">Total: <span className="amt-credit">+{fmtAmt(recon.uncheckedCredits.reduce((s,l)=>s+(l.credit||0),0))}</span></div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    <div className={`br-rec-summary${Math.abs(recon.difference)<0.01?' reconciled':''}`}>
                      <div className="br-rs-title-row">
                        <span><i className="fa fa-calculator"/> Reconciliation Summary</span>
                        {Math.abs(recon.difference)<0.01 && <span className="br-rec-ok-badge"><i className="fa fa-circle-check"/> Balanced!</span>}
                      </div>
                      <div className="br-rs-grid">
                        <div className="br-rs-row"><span>Opening Balance</span><strong>{fmtAmt(recon.opening)}</strong></div>
                        <div className="br-rs-row"><span>+ Cleared Credits ({checkedIds.size} items)</span><strong className="green">+{fmtAmt(recon.clearedCredit)}</strong></div>
                        <div className="br-rs-row"><span>– Cleared Debits</span><strong className="red">-{fmtAmt(recon.clearedDebit)}</strong></div>
                        <div className="br-rs-row br-rs-total"><span>Cleared Balance (Your Books)</span><strong>{fmtAmt(recon.clearedBal)}</strong></div>
                        <div className="br-rs-row br-rs-bank"><span>Statement Closing (Bank)</span><strong>{rClosing?fmtAmt(parseFloat(rClosing)):'— (not set)'}</strong></div>
                        <div className={`br-rs-row br-rs-diff${Math.abs(recon.difference)<0.01?' zero':recon.difference>0?' pos':' neg'}`}>
                          <span>Difference</span><strong>{sign(recon.difference)}{fmtAmt(Math.abs(recon.difference))}</strong>
                        </div>
                      </div>
                      {Math.abs(recon.difference)>0.01 && (
                        <div className="br-diff-hint">
                          {recon.difference>0
                            ?'Your cleared balance is higher than the bank statement. Check for duplicate entries.'
                            :'Your cleared balance is lower than the bank statement. Check for unrecorded bank credits or charges.'}
                        </div>
                      )}
                      <div className="br-rec-notes-row">
                        <input className="br-rec-notes" value={rNotes} onChange={e=>setRNotes(e.target.value)} placeholder="Reconciliation notes (optional)…"/>
                      </div>
                      <div className="br-rs-save-row">
                        <button className={`br-save-btn${Math.abs(recon.difference)<0.01?' balanced':''}`}
                          onClick={saveReconciliation} disabled={rSaving||rSaved||!rFrom||!rTo}>
                          {rSaving?<><i className="fa fa-spinner fa-spin"/> Saving…</>
                            :rSaved?<><i className="fa fa-circle-check"/> Saved!</>
                            :<><i className="fa fa-floppy-disk"/> Save Reconciliation</>}
                        </button>
                        {recon.total>0 && (
                          <span className="br-rs-progress">
                            <span className="rsp-bar" style={{width:`${Math.round((recon.checkedCount/recon.total)*100)}%`}}/>
                            {recon.checkedCount}/{recon.total} items cleared
                          </span>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ── Tab: History ───────────────────────────── */}
            {tab==='history' && (
              <div className="br-tab-body">
                {sessions.length===0 ? (
                  <div className="br-empty"><i className="fa fa-clock-rotate-left"/><p>No reconciliation history yet.</p></div>
                ) : (
                  <div className="br-history-list">
                    {sessions.map(s=>{
                      const balanced=Math.abs(s.difference||0)<0.01;
                      return (
                        <div key={s.id} className={`br-hist-card${balanced?' balanced':''}`}>
                          <div className="br-hist-icon"><i className={`fa ${balanced?'fa-circle-check':'fa-triangle-exclamation'}`}/></div>
                          <div className="br-hist-body">
                            <div className="br-hist-period">{fmtDate(s.period_from)} — {fmtDate(s.period_to)}</div>
                            <div className="br-hist-meta">
                              <span>{s.cleared_count} cleared</span><span>{s.outstanding_count} outstanding</span>
                              {s.notes && <span>{s.notes}</span>}
                            </div>
                          </div>
                          <div className="br-hist-amounts">
                            <div className="br-ha-item"><span>Opening</span><strong>{fmtAmt(s.opening_balance)}</strong></div>
                            <div className="br-ha-item"><span>Bank Closing</span><strong>{fmtAmt(s.statement_closing)}</strong></div>
                            <div className="br-ha-item"><span>Cleared</span><strong>{fmtAmt(s.cleared_balance)}</strong></div>
                            <div className={`br-ha-item diff${balanced?' zero':s.difference>0?' pos':' neg'}`}>
                              <span>Difference</span><strong>{sign(s.difference)}{fmtAmt(Math.abs(s.difference))}</strong>
                            </div>
                          </div>
                          <div className="br-hist-status">
                            <span className={`hist-badge${balanced?' rec':' unrec'}`}>{balanced?'Balanced':'Unbalanced'}</span>
                            <div className="br-hist-date">{new Date(s.created_at).toLocaleDateString('en-IN')}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Add/Edit Account Modal ─────────────────────────── */}
      {accModal && (
        <div className="br-overlay" onClick={e=>e.target===e.currentTarget&&setAccModal(false)}>
          <div className="br-modal">
            <div className="br-modal-hdr">
              <div className="br-modal-icon" style={{background:accForm.color}}><i className="fa fa-building-columns"/></div>
              <div><div className="br-modal-title">{editAcc?'Edit Account':'Add Bank Account'}</div></div>
              <button className="br-modal-close" onClick={()=>setAccModal(false)}><i className="fa fa-xmark"/></button>
            </div>
            <div className="br-modal-body">
              <div className="br-mf-row">
                <div className="br-mf-field"><label>Account Name *</label>
                  <input value={accForm.account_name} onChange={e=>setAccForm(f=>({...f,account_name:e.target.value}))} placeholder="e.g. SBI Salary Account" autoFocus/>
                </div>
                <div className="br-mf-field"><label>Bank Name</label>
                  <input value={accForm.bank_name} onChange={e=>setAccForm(f=>({...f,bank_name:e.target.value}))} placeholder="e.g. State Bank of India"/>
                </div>
              </div>
              <div className="br-mf-row">
                <div className="br-mf-field"><label>Account Number</label>
                  <input value={accForm.account_no} onChange={e=>setAccForm(f=>({...f,account_no:e.target.value}))} placeholder="XXXXXXXXXXXX"/>
                </div>
                <div className="br-mf-field"><label>Account Type</label>
                  <select value={accForm.account_type} onChange={e=>setAccForm(f=>({...f,account_type:e.target.value}))}>
                    {Object.entries(ACCOUNT_TYPES).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="br-mf-row">
                <div className="br-mf-field"><label>Branch</label>
                  <input value={accForm.branch} onChange={e=>setAccForm(f=>({...f,branch:e.target.value}))} placeholder="Branch name"/>
                </div>
                <div className="br-mf-field"><label>IFSC Code</label>
                  <input value={accForm.ifsc} onChange={e=>setAccForm(f=>({...f,ifsc:e.target.value.toUpperCase()}))} placeholder="SBIN0001234"/>
                </div>
              </div>
              <div className="br-mf-field"><label>Opening Balance (Rs.)</label>
                <input type="number" value={accForm.opening_balance} onChange={e=>setAccForm(f=>({...f,opening_balance:e.target.value}))} placeholder="0"/>
              </div>
              <div className="br-mf-field"><label>Account Color</label>
                <div className="br-color-palette">
                  {PALETTE.map(c=><button key={c} className={`br-color-dot${accForm.color===c?' sel':''}`}
                    style={{background:c}} onClick={()=>setAccForm(f=>({...f,color:c}))}/>)}
                </div>
              </div>
              <div className="br-mf-field"><label>Notes</label>
                <textarea value={accForm.notes} onChange={e=>setAccForm(f=>({...f,notes:e.target.value}))} rows={2} placeholder="Optional notes…"/>
              </div>
            </div>
            <div className="br-modal-footer">
              <button className="br-modal-cancel" onClick={()=>setAccModal(false)} disabled={accSaving}>Cancel</button>
              <button className="br-modal-save" onClick={saveAcc} disabled={accSaving}>
                {accSaving?<><i className="fa fa-spinner fa-spin"/> Saving…</>:<><i className="fa fa-check"/> {editAcc?'Save Changes':'Add Account'}</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add/Edit Statement Line Modal ──────────────────── */}
      {lineModal && (
        <div className="br-overlay" onClick={e=>e.target===e.currentTarget&&setLineModal(false)}>
          <div className="br-modal">
            <div className="br-modal-hdr">
              <div className="br-modal-icon" style={{background:'#1e40af'}}><i className="fa fa-file-invoice"/></div>
              <div><div className="br-modal-title">{editLine?'Edit Statement Line':'Add Statement Line'}</div></div>
              <button className="br-modal-close" onClick={()=>setLineModal(false)}><i className="fa fa-xmark"/></button>
            </div>
            <div className="br-modal-body">
              <div className="br-mf-row">
                <div className="br-mf-field"><label>Date *</label>
                  <input type="date" value={lineForm.txn_date} onChange={e=>setLineForm(f=>({...f,txn_date:e.target.value}))} autoFocus/>
                </div>
                <div className="br-mf-field"><label>Reference No.</label>
                  <input value={lineForm.reference_no} onChange={e=>setLineForm(f=>({...f,reference_no:e.target.value}))} placeholder="Cheque / UTR / Ref"/>
                </div>
              </div>
              <div className="br-mf-field"><label>Description</label>
                <input value={lineForm.description} onChange={e=>setLineForm(f=>({...f,description:e.target.value}))} placeholder="e.g. NEFT from Client ABC"/>
              </div>
              <div className="br-mf-row">
                <div className="br-mf-field"><label>Debit (Money Out) Rs.</label>
                  <input type="number" value={lineForm.debit} onChange={e=>setLineForm(f=>({...f,debit:e.target.value}))} placeholder="0"/>
                </div>
                <div className="br-mf-field"><label>Credit (Money In) Rs.</label>
                  <input type="number" value={lineForm.credit} onChange={e=>setLineForm(f=>({...f,credit:e.target.value}))} placeholder="0"/>
                </div>
                <div className="br-mf-field"><label>Running Balance Rs. (optional)</label>
                  <input type="number" value={lineForm.balance} onChange={e=>setLineForm(f=>({...f,balance:e.target.value}))} placeholder="From bank statement"/>
                </div>
              </div>
              <div className="br-mf-field"><label>Notes</label>
                <input value={lineForm.notes} onChange={e=>setLineForm(f=>({...f,notes:e.target.value}))} placeholder="Optional"/>
              </div>
            </div>
            <div className="br-modal-footer">
              <button className="br-modal-cancel" onClick={()=>setLineModal(false)} disabled={lineSaving}>Cancel</button>
              <button className="br-modal-save" onClick={saveLine} disabled={lineSaving}>
                {lineSaving?<><i className="fa fa-spinner fa-spin"/> Saving…</>:<><i className="fa fa-check"/> {editLine?'Save Changes':'Add Line'}</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Bulk Paste Import Modal ─────────────────────────── */}
      {bulkModal && (
        <div className="br-overlay" onClick={e=>e.target===e.currentTarget&&(setBulkModal(false),setBulkText(''),setBulkParsed([]))}>
          <div className="br-modal br-bulk-modal">
            <div className="br-modal-hdr">
              <div className="br-modal-icon" style={{background:'#7c3aed'}}><i className="fa fa-file-import"/></div>
              <div>
                <div className="br-modal-title">Paste Import from Bank Statement</div>
                <div className="br-modal-sub">Paste rows copied from Excel / bank portal (Tab or comma separated)</div>
              </div>
              <button className="br-modal-close" onClick={()=>{setBulkModal(false);setBulkText('');setBulkParsed([]);}}><i className="fa fa-xmark"/></button>
            </div>
            <div className="br-modal-body">
              <div className="br-mf-field">
                <label>Expected columns: Date | Description | Debit | Credit | Balance (Balance optional)</label>
                <textarea className="br-bulk-textarea" value={bulkText}
                  onChange={e=>{setBulkText(e.target.value);setBulkParsed([]);}}
                  placeholder={"01/06/2025\tNEFT from Client XYZ\t0\t50000\t150000\n02/06/2025\tElectricity Bill\t2500\t0\t147500"} rows={8}/>
              </div>
              <button className="br-btn-sm secondary" onClick={parseBulk} disabled={!bulkText.trim()}>
                <i className="fa fa-magnifying-glass"/> Preview {bulkText.trim()?`(${bulkText.trim().split('\n').length} rows)`:''}
              </button>
              {bulkParsed.length>0 && (
                <div className="br-bulk-preview">
                  <div className="br-bulk-preview-title">{bulkParsed.length} rows ready to import:</div>
                  <div className="br-bulk-preview-table-wrap">
                    <table className="br-bulk-preview-table">
                      <thead><tr><th>Date</th><th>Description</th><th>Debit</th><th>Credit</th><th>Balance</th></tr></thead>
                      <tbody>
                        {bulkParsed.slice(0,10).map((r,i)=>(
                          <tr key={i}>
                            <td>{r.txn_date}</td><td>{r.description}</td>
                            <td>{r.debit?fmtAmt(r.debit):'—'}</td><td>{r.credit?fmtAmt(r.credit):'—'}</td>
                            <td>{r.balance!=null?fmtAmt(r.balance):'—'}</td>
                          </tr>
                        ))}
                        {bulkParsed.length>10&&<tr><td colSpan={5} style={{textAlign:'center',color:'#94a3b8'}}>… and {bulkParsed.length-10} more rows</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
            <div className="br-modal-footer">
              <button className="br-modal-cancel" onClick={()=>{setBulkModal(false);setBulkText('');setBulkParsed([]);}}>Cancel</button>
              <button className="br-modal-save" onClick={saveBulk} disabled={bulkSaving||bulkParsed.length===0}>
                {bulkSaving?<><i className="fa fa-spinner fa-spin"/> Importing…</>:<><i className="fa fa-file-import"/> Import {bulkParsed.length} Rows</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
