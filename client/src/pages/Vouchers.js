import React, { useState, useEffect, useContext, useMemo, useCallback } from 'react';
import { ToastContext } from '../App';
import { companiesApi, coaApi, vouchersApi, getActiveCompany, setActiveCompany } from '../api';
import CompanySwitcher from '../components/CompanySwitcher';
import './Vouchers.css';

const VOUCHER_TYPES = [
  { key: 'payment',     label: 'Payment',      icon: 'fa-money-bill-wave',   color: '#dc2626' },
  { key: 'receipt',     label: 'Receipt',      icon: 'fa-hand-holding-dollar', color: '#059669' },
  { key: 'journal',     label: 'Journal',      icon: 'fa-book',              color: '#7c3aed' },
  { key: 'contra',      label: 'Contra',       icon: 'fa-right-left',        color: '#0891b2' },
  { key: 'sales',       label: 'Sales',        icon: 'fa-file-invoice-dollar', color: '#2563eb' },
  { key: 'purchase',    label: 'Purchase',     icon: 'fa-cart-shopping',     color: '#ea580c' },
  { key: 'debit_note',  label: 'Debit Note',   icon: 'fa-file-circle-minus', color: '#b91c1c' },
  { key: 'credit_note', label: 'Credit Note',  icon: 'fa-file-circle-plus', color: '#15803d' },
];
const typeInfo = (key) => VOUCHER_TYPES.find((t) => t.key === key) || VOUCHER_TYPES[0];

const EMPTY_LINE = { ledger_account_id: '', dr_cr: 'debit', amount: '', narration: '' };
const todayStr = () => new Date().toISOString().slice(0, 10);

const fmtAmt = (n) => `Rs. ${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (s) => (s ? new Date(s + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

export default function Vouchers() {
  const showToast = useContext(ToastContext);

  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState(getActiveCompany());
  const [ledgers, setLedgers]     = useState([]);
  const [vouchers, setVouchers]   = useState([]);
  const [loading,  setLoading]    = useState(false);

  const [filterType, setFilterType] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo,   setFilterTo]   = useState('');
  const [search,     setSearch]     = useState('');

  const [modal, setModal]     = useState(false);
  const [editing, setEditing] = useState(null);
  const [vType, setVType]     = useState('payment');
  const [vDate, setVDate]     = useState(todayStr());
  const [vNo,   setVNo]       = useState('');
  const [vRef,  setVRef]      = useState('');
  const [vNarr, setVNarr]     = useState('');
  const [lines, setLines]     = useState([{ ...EMPTY_LINE }, { ...EMPTY_LINE }]);
  const [saving, setSaving]   = useState(false);

  const loadCompanies = useCallback(async () => {
    try {
      const d = await companiesApi.list();
      setCompanies(d || []);
      if (!companyId && d && d.length) { setCompanyId(d[0].id); setActiveCompany(d[0].id); }
    } catch { /* ignore */ }
  }, [companyId]);

  const loadLedgers = useCallback(async () => {
    if (!companyId) return;
    try { const d = await coaApi.ledgers(companyId); setLedgers(d || []); } catch { /* ignore */ }
  }, [companyId]);

  const loadVouchers = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const params = { company_id: companyId };
      if (filterType) params.voucher_type = filterType;
      if (filterFrom) params.from = filterFrom;
      if (filterTo)   params.to = filterTo;
      if (search)     params.search = search;
      const d = await vouchersApi.list(params);
      setVouchers(d || []);
    } catch { showToast('Failed to load vouchers', 'error'); }
    finally { setLoading(false); }
  }, [companyId, filterType, filterFrom, filterTo, search]); // eslint-disable-line

  useEffect(() => { loadCompanies(); }, []); // eslint-disable-line
  useEffect(() => { loadLedgers(); loadVouchers(); }, [companyId]); // eslint-disable-line
  useEffect(() => { loadVouchers(); }, [filterType, filterFrom, filterTo, search]); // eslint-disable-line
  useEffect(() => {
    const onChange = (e) => setCompanyId(e.detail);
    window.addEventListener('wbm-company-change', onChange);
    return () => window.removeEventListener('wbm-company-change', onChange);
  }, []);

  const totals = useMemo(() => {
    let debit = 0, credit = 0;
    lines.forEach((l) => { const amt = parseFloat(l.amount) || 0; if (l.dr_cr === 'debit') debit += amt; else credit += amt; });
    return { debit, credit, diff: debit - credit };
  }, [lines]);

  const isBalanced = totals.debit > 0 && Math.abs(totals.diff) < 0.01;

  const openNew = async (type) => {
    setEditing(null);
    setVType(type); setVDate(todayStr()); setVRef(''); setVNarr('');
    setLines([{ ...EMPTY_LINE }, { ...EMPTY_LINE }]);
    setModal(true);
    try { const d = await vouchersApi.nextNumber(companyId, type); setVNo(d.voucher_no); } catch { setVNo(''); }
  };

  const openEdit = async (v) => {
    try {
      const full = await vouchersApi.get(v.id);
      setEditing(full);
      setVType(full.voucher_type); setVDate(full.voucher_date); setVNo(full.voucher_no);
      setVRef(full.reference_no || ''); setVNarr(full.narration || '');
      setLines(full.lines.map((l) => ({ ledger_account_id: l.ledger_account_id, dr_cr: l.dr_cr, amount: l.amount, narration: l.narration || '' })));
      setModal(true);
    } catch { showToast('Failed to load voucher', 'error'); }
  };

  const changeType = async (type) => {
    setVType(type);
    if (!editing) { try { const d = await vouchersApi.nextNumber(companyId, type); setVNo(d.voucher_no); } catch { /* ignore */ } }
  };

  const updateLine = (i, patch) => setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const addLine = () => setLines((ls) => [...ls, { ...EMPTY_LINE }]);
  const removeLine = (i) => setLines((ls) => (ls.length > 2 ? ls.filter((_, idx) => idx !== i) : ls));

  const save = async () => {
    if (!isBalanced) return showToast('Voucher must balance: Debit total must equal Credit total.', 'error');
    if (lines.some((l) => !l.ledger_account_id)) return showToast('Every line needs a ledger account.', 'error');
    setSaving(true);
    try {
      const payload = { company_id: companyId, voucher_type: vType, voucher_no: vNo, voucher_date: vDate, reference_no: vRef, narration: vNarr, lines };
      if (editing) await vouchersApi.update(editing.id, payload);
      else await vouchersApi.create(payload);
      showToast(editing ? 'Voucher updated' : 'Voucher posted', 'success');
      setModal(false); loadVouchers();
    } catch (e) { showToast(e?.error || 'Failed to save voucher', 'error'); }
    finally { setSaving(false); }
  };

  const remove = async (v) => {
    if (!window.confirm(`Delete voucher ${v.voucher_no}? This cannot be undone.`)) return;
    try { await vouchersApi.remove(v.id); showToast('Voucher deleted', 'success'); loadVouchers(); }
    catch { showToast('Failed to delete', 'error'); }
  };

  return (
    <div className="vch-page">
      <div className="vch-header">
        <div className="vch-header-left">
          <h1><i className="fa fa-file-invoice" /> Vouchers</h1>
          <p>Every accounting entry starts here — Payment, Receipt, Journal, Contra, Sales, Purchase and Notes.</p>
        </div>
        <CompanySwitcher companies={companies} companyId={companyId}
          onChange={(id) => { setCompanyId(id); setActiveCompany(id); }}
          onCreated={loadCompanies} showToast={showToast} />
      </div>

      {/* New voucher type buttons */}
      <div className="vch-type-grid">
        {VOUCHER_TYPES.map((t) => (
          <button key={t.key} className="vch-type-btn" style={{ '--vc': t.color }} onClick={() => openNew(t.key)}>
            <i className={`fa ${t.icon}`} /> {t.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="vch-filters">
        <select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
          <option value="">All Types</option>
          {VOUCHER_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select>
        <input type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} />
        <span>to</span>
        <input type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} />
        <div className="vch-search-wrap">
          <i className="fa fa-magnifying-glass" />
          <input placeholder="Search voucher no / narration…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {/* Register */}
      {loading ? (
        <div className="vch-loading"><i className="fa fa-spinner fa-spin" /> Loading…</div>
      ) : vouchers.length === 0 ? (
        <div className="vch-empty"><i className="fa fa-file-invoice" /><p>No vouchers yet. Create one using the buttons above.</p></div>
      ) : (
        <div className="vch-table-wrap">
          <table className="vch-table">
            <thead><tr><th>Date</th><th>Voucher No.</th><th>Type</th><th>Ledgers</th><th>Narration</th><th>Amount</th><th>Actions</th></tr></thead>
            <tbody>
              {vouchers.map((v) => {
                const t = typeInfo(v.voucher_type);
                return (
                  <tr key={v.id}>
                    <td>{fmtDate(v.voucher_date)}</td>
                    <td className="vch-no">{v.voucher_no}</td>
                    <td><span className="vch-type-tag" style={{ background: `${t.color}18`, color: t.color }}><i className={`fa ${t.icon}`} /> {t.label}</span></td>
                    <td className="vch-ledgers">{v.ledger_names || '—'}</td>
                    <td className="vch-narr">{v.narration || '—'}</td>
                    <td className="vch-amt">{fmtAmt(v.total_amount)}</td>
                    <td>
                      <div className="vch-row-actions">
                        <button className="vch-icon-btn" onClick={() => openEdit(v)} title="Edit"><i className="fa fa-pen" /></button>
                        <button className="vch-icon-btn del" onClick={() => remove(v)} title="Delete"><i className="fa fa-trash" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Voucher Modal ────────────────────────────────────── */}
      {modal && (
        <div className="vch-overlay" onClick={(e) => e.target === e.currentTarget && setModal(false)}>
          <div className="vch-modal">
            <div className="vch-modal-hdr" style={{ borderLeftColor: typeInfo(vType).color }}>
              <div className="vch-modal-title"><i className={`fa ${typeInfo(vType).icon}`} /> {editing ? 'Edit' : 'New'} {typeInfo(vType).label} Voucher</div>
              <button className="vch-modal-close" onClick={() => setModal(false)}><i className="fa fa-xmark" /></button>
            </div>
            <div className="vch-modal-body">
              <div className="vch-field-row">
                <div className="vch-field"><label>Voucher Type</label>
                  <select value={vType} onChange={(e) => changeType(e.target.value)} disabled={!!editing}>
                    {VOUCHER_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                  </select>
                </div>
                <div className="vch-field"><label>Voucher No.</label>
                  <input value={vNo} onChange={(e) => setVNo(e.target.value)} />
                </div>
                <div className="vch-field"><label>Date *</label>
                  <input type="date" value={vDate} onChange={(e) => setVDate(e.target.value)} />
                </div>
                <div className="vch-field"><label>Reference No.</label>
                  <input value={vRef} onChange={(e) => setVRef(e.target.value)} placeholder="Optional" />
                </div>
              </div>

              <div className="vch-lines-hdr">
                <span>Ledger Account</span><span>Dr / Cr</span><span>Amount (Rs.)</span><span>Narration</span><span />
              </div>
              {lines.map((l, i) => (
                <div className="vch-line-row" key={i}>
                  <select value={l.ledger_account_id} onChange={(e) => updateLine(i, { ledger_account_id: e.target.value })}>
                    <option value="">Select ledger…</option>
                    {ledgers.map((led) => <option key={led.id} value={led.id}>{led.name}</option>)}
                  </select>
                  <div className="vch-drcr-toggle">
                    <button className={l.dr_cr === 'debit' ? 'active dr' : ''} onClick={() => updateLine(i, { dr_cr: 'debit' })}>Dr</button>
                    <button className={l.dr_cr === 'credit' ? 'active cr' : ''} onClick={() => updateLine(i, { dr_cr: 'credit' })}>Cr</button>
                  </div>
                  <input type="number" value={l.amount} onChange={(e) => updateLine(i, { amount: e.target.value })} placeholder="0.00" />
                  <input value={l.narration} onChange={(e) => updateLine(i, { narration: e.target.value })} placeholder="Optional" />
                  <button className="vch-line-del" onClick={() => removeLine(i)} disabled={lines.length <= 2}><i className="fa fa-xmark" /></button>
                </div>
              ))}
              <button className="vch-add-line" onClick={addLine}><i className="fa fa-plus" /> Add Line</button>

              <div className="vch-field"><label>Narration (Voucher)</label>
                <textarea rows={2} value={vNarr} onChange={(e) => setVNarr(e.target.value)} placeholder="What is this voucher for?" />
              </div>

              <div className={`vch-totals-bar${isBalanced ? ' balanced' : ''}`}>
                <div><span>Debit Total</span><strong>{fmtAmt(totals.debit)}</strong></div>
                <div><span>Credit Total</span><strong>{fmtAmt(totals.credit)}</strong></div>
                <div><span>Difference</span><strong>{fmtAmt(Math.abs(totals.diff))}</strong></div>
                {isBalanced && <div className="vch-balanced-badge"><i className="fa fa-circle-check" /> Balanced</div>}
              </div>
            </div>
            <div className="vch-modal-footer">
              <button className="vch-btn-cancel" onClick={() => setModal(false)} disabled={saving}>Cancel</button>
              <button className="vch-btn-save" onClick={save} disabled={saving || !isBalanced}>
                {saving ? <><i className="fa fa-spinner fa-spin" /> Saving…</> : <><i className="fa fa-check" /> {editing ? 'Save Changes' : 'Post Voucher'}</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
