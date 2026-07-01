import React, { useState, useEffect, useContext, useMemo } from 'react';
import { ToastContext } from '../App';
import { loansApi } from '../api';
import './Loans.css';

// ── Constants ────────────────────────────────────────────────
const LOAN_TYPES = {
  personal:  { label: 'Personal',   icon: 'fa-user' },
  home:      { label: 'Home Loan',  icon: 'fa-house' },
  car:       { label: 'Car Loan',   icon: 'fa-car' },
  business:  { label: 'Business',   icon: 'fa-briefcase' },
  education: { label: 'Education',  icon: 'fa-graduation-cap' },
  other:     { label: 'Other',      icon: 'fa-file-invoice' },
};
const PAY_METHODS = [
  { val: 'bank_transfer', label: 'Bank Transfer' },
  { val: 'upi',           label: 'UPI / IMPS' },
  { val: 'cheque',        label: 'Cheque' },
  { val: 'cash',          label: 'Cash' },
  { val: 'neft',          label: 'NEFT / RTGS' },
  { val: 'auto_debit',    label: 'Auto Debit' },
];
const LOAN_EMPTY = {
  title: '', lender: '', loan_type: 'personal',
  principal_amount: '', interest_rate: '', tenure_months: '',
  emi_amount: '', start_date: '', next_due_date: '',
  outstanding_balance: '', account_no: '', notes: '',
};
const todayStr = () => new Date().toISOString().slice(0, 10);

// ── Helpers ──────────────────────────────────────────────────
const fmtAmt = (n) =>
  `Rs. ${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (s) =>
  s ? new Date(s + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const daysUntil = (dateStr) => {
  if (!dateStr) return null;
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const d = new Date(dateStr + 'T00:00:00');
  return Math.round((d - t) / 86400000);
};

const getDueTag = (loan) => {
  if (loan.status === 'closed') return { label: 'Closed', cls: 'tag-closed' };
  const d = daysUntil(loan.next_due_date);
  if (d === null)  return { label: 'Active',       cls: 'tag-ok' };
  if (d < 0)       return { label: `${-d}d overdue`, cls: 'tag-overdue' };
  if (d === 0)     return { label: 'Due Today!',   cls: 'tag-today' };
  if (d <= 7)      return { label: `Due in ${d}d`, cls: 'tag-soon' };
  return           { label: fmtDate(loan.next_due_date), cls: 'tag-ok' };
};

const calcEMI = (p, r, n) => {
  const principal = parseFloat(p); const months = parseInt(n, 10);
  if (!principal || !months) return '';
  const rate = parseFloat(r);
  if (!rate) return (principal / months).toFixed(2);
  const mr = rate / 12 / 100;
  return (principal * mr * Math.pow(1 + mr, months) / (Math.pow(1 + mr, months) - 1)).toFixed(2);
};

// ── Component ────────────────────────────────────────────────
export default function Loans() {
  const showToast = useContext(ToastContext);
  const [loans,    setLoans]    = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [alerts,   setAlerts]   = useState({ overdue: 0, due_soon: 0 });
  const [tab,      setTab]      = useState('active');
  const [modal,    setModal]    = useState(null);   // 'form' | 'pay' | 'history'
  const [editLoan, setEditLoan] = useState(null);
  const [payTarget,setPayTarget]= useState(null);
  const [histLoan, setHistLoan] = useState(null);
  const [payments, setPayments] = useState([]);
  const [form,     setForm]     = useState(LOAN_EMPTY);
  const [payForm,  setPayForm]  = useState({ payment_date: todayStr(), amount: '', payment_method: 'bank_transfer', receipt_no: '', notes: '' });
  const [saving,   setSaving]   = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [error,    setError]    = useState('');

  // Load
  const load = async () => {
    setLoading(true);
    try { setLoans(await loansApi.list()); } catch { showToast('Failed to load loans', 'error'); }
    finally { setLoading(false); }
  };
  const loadAlerts = async () => {
    try { setAlerts(await loansApi.reminders()); } catch {}
  };
  useEffect(() => { load(); loadAlerts(); }, []); // eslint-disable-line

  // Derived
  const filtered = loans.filter(l =>
    tab === 'all'    ? true :
    tab === 'active' ? l.status !== 'closed' :
    l.status === 'closed'
  );

  const summary = useMemo(() => {
    const active = loans.filter(l => l.status !== 'closed');
    const overdue = active.filter(l => { const d = daysUntil(l.next_due_date); return d !== null && d < 0; }).length;
    const nextDue = [...active].filter(l => l.next_due_date)
      .sort((a, b) => new Date(a.next_due_date) - new Date(b.next_due_date))[0]?.next_due_date;
    return {
      outstanding: active.reduce((s, l) => s + (l.outstanding_balance || 0), 0),
      emi:         active.reduce((s, l) => s + (l.emi_amount || 0), 0),
      overdue, nextDue,
    };
  }, [loans]);

  // Modal helpers
  const openAdd = () => { setForm(LOAN_EMPTY); setEditLoan(null); setError(''); setModal('form'); };
  const openEdit = (loan) => {
    setForm({ title: loan.title || '', lender: loan.lender || '', loan_type: loan.loan_type || 'personal',
      principal_amount: loan.principal_amount || '', interest_rate: loan.interest_rate || '',
      tenure_months: loan.tenure_months || '', emi_amount: loan.emi_amount || '',
      start_date: loan.start_date || '', next_due_date: loan.next_due_date || '',
      outstanding_balance: loan.outstanding_balance || '', account_no: loan.account_no || '',
      notes: loan.notes || '' });
    setEditLoan(loan); setError(''); setModal('form');
  };
  const openPay = (loan) => {
    setPayTarget(loan);
    setPayForm({ payment_date: todayStr(), amount: loan.emi_amount || '', payment_method: 'bank_transfer', receipt_no: '', notes: '' });
    setError(''); setModal('pay');
  };
  const openHistory = async (loan) => {
    setHistLoan(loan); setPayments([]); setModal('history');
    try { setPayments(await loansApi.payments(loan.id)); } catch {}
  };
  const closeModal = () => { setModal(null); setError(''); };

  const fc = (e) => { const { name, value } = e.target; setForm(f => ({ ...f, [name]: value })); setError(''); };
  const autoCalc = () => {
    const emi = calcEMI(form.principal_amount, form.interest_rate, form.tenure_months);
    if (emi) setForm(f => ({ ...f, emi_amount: emi, outstanding_balance: f.outstanding_balance || f.principal_amount }));
  };

  // CRUD
  const handleSave = async () => {
    if (!form.title.trim()) return setError('Loan title is required.');
    if (!form.principal_amount) return setError('Principal amount is required.');
    setSaving(true); setError('');
    try {
      if (editLoan) {
        const d = await loansApi.update(editLoan.id, form);
        if (d.error) throw new Error(d.error);
        showToast('Loan updated', 'success');
      } else {
        const d = await loansApi.create(form);
        if (d.error) throw new Error(d.error);
        showToast('Loan added successfully', 'success');
      }
      closeModal(); load(); loadAlerts();
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  const handlePay = async () => {
    if (!payForm.payment_date || !payForm.amount) return setError('Date and amount are required.');
    setSaving(true); setError('');
    try {
      const d = await loansApi.pay(payTarget.id, payForm);
      if (d.error) throw new Error(d.error);
      const closed = d.loan?.status === 'closed' && payTarget.status !== 'closed';
      showToast(closed ? `Loan "${payTarget.title}" fully paid off! 🎉` : 'EMI recorded successfully', 'success');
      closeModal(); load(); loadAlerts();
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async (loan) => {
    if (!window.confirm(`Delete loan "${loan.title}"? All payment history will be lost.`)) return;
    setDeleting(loan.id);
    try {
      const d = await loansApi.remove(loan.id);
      if (d.error) throw new Error(d.error);
      showToast('Loan deleted', 'success'); load(); loadAlerts();
    } catch (e) { showToast(e.message, 'error'); }
    finally { setDeleting(null); }
  };

  // EMI preview
  const emiCalc = useMemo(() => {
    if (!form.principal_amount || !form.interest_rate || !form.tenure_months) return null;
    const emi = parseFloat(calcEMI(form.principal_amount, form.interest_rate, form.tenure_months));
    const n = parseInt(form.tenure_months, 10);
    const total = emi * n;
    return { emi, total, interest: total - parseFloat(form.principal_amount) };
  }, [form.principal_amount, form.interest_rate, form.tenure_months]);

  const tabCount = (t) =>
    t === 'active' ? loans.filter(l => l.status !== 'closed').length :
    t === 'closed' ? loans.filter(l => l.status === 'closed').length : loans.length;

  return (
    <div className="loans-page">

      {/* ── Header ─────────────────────────────────────────── */}
      <div className="loans-header">
        <div className="loans-hdr-inner">
          <div className="loans-hdr-left">
            <div className="loans-hdr-icon"><i className="fa fa-hand-holding-dollar" /></div>
            <div>
              <div className="loans-hdr-title">Loans &amp; EMI Tracker</div>
              <div className="loans-hdr-sub">Track loan EMIs, outstanding balance and due date reminders</div>
            </div>
          </div>
          <button className="loans-btn-add" onClick={openAdd}>
            <i className="fa fa-plus" /> Add Loan
          </button>
        </div>
      </div>

      {/* ── Summary Cards ──────────────────────────────────── */}
      <div className="loans-summary-grid">
        <div className="lstat outstanding-stat">
          <div className="lstat-icon"><i className="fa fa-money-bill-wave" /></div>
          <div className="lstat-body">
            <div className="lstat-label">Total Outstanding</div>
            <div className="lstat-value">{fmtAmt(summary.outstanding)}</div>
          </div>
        </div>
        <div className="lstat emi-stat">
          <div className="lstat-icon"><i className="fa fa-calendar-check" /></div>
          <div className="lstat-body">
            <div className="lstat-label">Monthly EMI Burden</div>
            <div className="lstat-value">{fmtAmt(summary.emi)}</div>
          </div>
        </div>
        <div className={`lstat ${summary.overdue > 0 ? 'over-stat' : 'safe-stat'}`}>
          <div className="lstat-icon">
            <i className={`fa ${summary.overdue > 0 ? 'fa-triangle-exclamation' : 'fa-circle-check'}`} />
          </div>
          <div className="lstat-body">
            <div className="lstat-label">Overdue EMIs</div>
            <div className="lstat-value">{summary.overdue > 0 ? `${summary.overdue} loan${summary.overdue > 1 ? 's' : ''}` : 'None'}</div>
          </div>
        </div>
        <div className="lstat nextdue-stat">
          <div className="lstat-icon"><i className="fa fa-clock" /></div>
          <div className="lstat-body">
            <div className="lstat-label">Next EMI Due</div>
            <div className="lstat-value">{summary.nextDue ? fmtDate(summary.nextDue) : '—'}</div>
          </div>
        </div>
      </div>

      {/* ── Reminder Banner ────────────────────────────────── */}
      {(alerts.overdue > 0 || alerts.due_soon > 0) && (
        <div className={`loans-reminder ${alerts.overdue > 0 ? 'rem-overdue' : 'rem-soon'}`}>
          <div className="rem-icon">
            <i className={`fa ${alerts.overdue > 0 ? 'fa-triangle-exclamation' : 'fa-bell'}`} />
          </div>
          <div className="rem-text">
            {alerts.overdue > 0 && (
              <p><strong>{alerts.overdue} EMI{alerts.overdue > 1 ? 's' : ''} overdue!</strong> Pay immediately to avoid penalties and credit score impact.</p>
            )}
            {alerts.due_soon > 0 && (
              <p><strong>{alerts.due_soon} EMI{alerts.due_soon > 1 ? 's' : ''} due within 7 days.</strong> Ensure sufficient balance in your account.</p>
            )}
          </div>
        </div>
      )}

      {/* ── Table Card ─────────────────────────────────────── */}
      <div className="loans-table-card">
        <div className="loans-table-hdr">
          <div className="loans-tabs">
            {['active', 'all', 'closed'].map(t => (
              <button key={t} className={`loans-tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
                {t === 'active' ? 'Active' : t === 'closed' ? 'Closed' : 'All'}
                <span className="tab-count">{tabCount(t)}</span>
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="loans-state"><i className="fa fa-spinner fa-spin" /> Loading loans…</div>
        ) : filtered.length === 0 ? (
          <div className="loans-state">
            <i className="fa fa-hand-holding-dollar" style={{ fontSize: '2rem', color: '#94a3b8', display: 'block', marginBottom: 10 }} />
            {tab === 'active' ? 'No active loans. Click "Add Loan" to get started.' : 'No loans in this category.'}
          </div>
        ) : (
          <div className="loans-table-wrap">
            <table className="loans-table">
              <thead>
                <tr>
                  <th>#</th><th>Loan Details</th><th>EMI / Month</th>
                  <th>Due Date</th><th>Outstanding</th><th>Progress</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((loan, i) => {
                  const tag = getDueTag(loan);
                  const pct = loan.principal_amount
                    ? Math.min(100, Math.round(((loan.principal_amount - Math.max(0, loan.outstanding_balance || 0)) / loan.principal_amount) * 100))
                    : 0;
                  const ti = LOAN_TYPES[loan.loan_type] || LOAN_TYPES.other;
                  return (
                    <tr key={loan.id} className={loan.status === 'closed' ? 'row-closed' : tag.cls === 'tag-overdue' ? 'row-overdue' : ''}>
                      <td className="col-num">{i + 1}</td>
                      <td>
                        <div className="loan-name-cell">
                          <div className={`loan-type-ico lt-${loan.loan_type || 'other'}`}>
                            <i className={`fa ${ti.icon}`} />
                          </div>
                          <div>
                            <div className="loan-name">{loan.title}</div>
                            {loan.lender   && <div className="loan-meta">{loan.lender}</div>}
                            {loan.account_no && <div className="loan-meta">Acct: {loan.account_no}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="col-emi">{loan.emi_amount ? fmtAmt(loan.emi_amount) : '—'}</td>
                      <td>
                        <div className="loan-due-cell">
                          <span className="loan-due-date">{loan.next_due_date ? fmtDate(loan.next_due_date) : '—'}</span>
                          <span className={`due-tag ${tag.cls}`}>{tag.label}</span>
                        </div>
                      </td>
                      <td>
                        <div className="col-bal">{fmtAmt(loan.outstanding_balance)}</div>
                        {loan.principal_amount && (
                          <div className="col-bal-of">of {fmtAmt(loan.principal_amount)}</div>
                        )}
                      </td>
                      <td>
                        <div className="loan-progress">
                          <div className="progress-bar">
                            <div className="progress-fill" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="progress-pct">{pct}%</span>
                        </div>
                      </td>
                      <td>
                        <div className="loan-actions">
                          {loan.status !== 'closed' && (
                            <button className="lact pay-btn" onClick={() => openPay(loan)}>
                              <i className="fa fa-circle-check" /> Pay EMI
                            </button>
                          )}
                          <button className="lact edit-btn" onClick={() => openEdit(loan)} title="Edit"><i className="fa fa-pen" /></button>
                          <button className="lact hist-btn" onClick={() => openHistory(loan)} title="History"><i className="fa fa-clock-rotate-left" /></button>
                          <button className="lact del-btn" onClick={() => handleDelete(loan)} disabled={deleting === loan.id} title="Delete">
                            {deleting === loan.id ? <i className="fa fa-spinner fa-spin" /> : <i className="fa fa-trash" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Loan Form Modal ─────────────────────────────────── */}
      {modal === 'form' && (
        <div className="lm-overlay" onClick={e => e.target === e.currentTarget && closeModal()}>
          <div className="lm-box lm-form-box">
            <div className="lm-hdr">
              <div className="lm-hdr-icon"><i className="fa fa-hand-holding-dollar" /></div>
              <div>
                <div className="lm-title">{editLoan ? 'Edit Loan' : 'Add New Loan'}</div>
                <div className="lm-sub">{editLoan ? `Editing: ${editLoan.title}` : 'Enter loan details below'}</div>
              </div>
              <button className="lm-close" onClick={closeModal}><i className="fa fa-xmark" /></button>
            </div>

            <div className="lm-body">
              {/* Title */}
              <div className="lf-field">
                <label className="lf-label">Loan Title *</label>
                <div className="lf-wrap"><i className="fa fa-file-invoice lf-ico" />
                  <input name="title" className="lf-input" value={form.title} onChange={fc} placeholder="e.g. Home Loan — SBI" autoFocus />
                </div>
              </div>

              {/* Loan type */}
              <div className="lf-field">
                <label className="lf-label">Loan Type</label>
                <div className="loan-type-grid">
                  {Object.entries(LOAN_TYPES).map(([k, v]) => (
                    <button key={k} type="button"
                      className={`lt-btn lt-${k}${form.loan_type === k ? ' selected' : ''}`}
                      onClick={() => { setForm(f => ({ ...f, loan_type: k })); setError(''); }}>
                      <i className={`fa ${v.icon}`} /><span>{v.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Lender */}
              <div className="lf-field">
                <label className="lf-label">Lender / Bank</label>
                <div className="lf-wrap"><i className="fa fa-building-columns lf-ico" />
                  <input name="lender" className="lf-input" value={form.lender} onChange={fc} placeholder="e.g. State Bank of India" />
                </div>
              </div>

              {/* Principal, rate, tenure */}
              <div className="lf-row">
                <div className="lf-field">
                  <label className="lf-label">Principal Amount *</label>
                  <div className="lf-wrap"><i className="fa fa-indian-rupee-sign lf-ico" />
                    <input name="principal_amount" className="lf-input" type="number" value={form.principal_amount} onChange={fc} placeholder="500000" />
                  </div>
                </div>
                <div className="lf-field">
                  <label className="lf-label">Interest Rate (% p.a.)</label>
                  <div className="lf-wrap"><i className="fa fa-percent lf-ico" />
                    <input name="interest_rate" className="lf-input" type="number" step="0.01" value={form.interest_rate} onChange={fc} placeholder="10.5" />
                  </div>
                </div>
                <div className="lf-field">
                  <label className="lf-label">Tenure (months)</label>
                  <div className="lf-wrap"><i className="fa fa-calendar-days lf-ico" />
                    <input name="tenure_months" className="lf-input" type="number" value={form.tenure_months} onChange={fc} placeholder="24" />
                  </div>
                </div>
              </div>

              {/* EMI calculator */}
              <div className="emi-calc-row">
                <button type="button" className="emi-calc-btn" onClick={autoCalc}>
                  <i className="fa fa-calculator" /> Auto-Calculate EMI
                </button>
                <div className="lf-field" style={{ flex: 1 }}>
                  <label className="lf-label">EMI Amount / Month</label>
                  <div className="lf-wrap"><i className="fa fa-indian-rupee-sign lf-ico" />
                    <input name="emi_amount" className="lf-input" type="number" value={form.emi_amount} onChange={fc} placeholder="Auto-calculated or enter manually" />
                  </div>
                </div>
              </div>

              {/* EMI preview */}
              {emiCalc && (
                <div className="emi-preview">
                  <div className="emi-prev-item"><span>Monthly EMI</span><strong>{fmtAmt(emiCalc.emi)}</strong></div>
                  <div className="emi-prev-sep" />
                  <div className="emi-prev-item"><span>Total Payable</span><strong>{fmtAmt(emiCalc.total)}</strong></div>
                  <div className="emi-prev-sep" />
                  <div className="emi-prev-item interest"><span>Total Interest</span><strong>{fmtAmt(emiCalc.interest)}</strong></div>
                </div>
              )}

              {/* Dates */}
              <div className="lf-row">
                <div className="lf-field">
                  <label className="lf-label">Loan Start Date</label>
                  <input name="start_date" className="lf-input" type="date" value={form.start_date} onChange={fc} />
                </div>
                <div className="lf-field">
                  <label className="lf-label">Next EMI Due Date</label>
                  <input name="next_due_date" className="lf-input" type="date" value={form.next_due_date} onChange={fc} />
                </div>
              </div>

              {/* Balance + account */}
              <div className="lf-row">
                <div className="lf-field">
                  <label className="lf-label">Current Outstanding Balance</label>
                  <div className="lf-wrap"><i className="fa fa-indian-rupee-sign lf-ico" />
                    <input name="outstanding_balance" className="lf-input" type="number" value={form.outstanding_balance} onChange={fc} placeholder="Same as principal if new loan" />
                  </div>
                </div>
                <div className="lf-field">
                  <label className="lf-label">Account / Reference No.</label>
                  <div className="lf-wrap"><i className="fa fa-hashtag lf-ico" />
                    <input name="account_no" className="lf-input" value={form.account_no} onChange={fc} placeholder="Optional" />
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div className="lf-field">
                <label className="lf-label">Notes</label>
                <textarea name="notes" className="lf-input lf-textarea" value={form.notes} onChange={fc} rows={2} placeholder="Any additional details…" />
              </div>

              {error && <div className="lf-error"><i className="fa fa-circle-exclamation" /> {error}</div>}
            </div>

            <div className="lm-footer">
              <button className="lm-cancel" onClick={closeModal} disabled={saving}>Cancel</button>
              <button className="lm-save" onClick={handleSave} disabled={saving}>
                {saving ? <><i className="fa fa-spinner fa-spin" /> Saving…</> : <><i className="fa fa-check" /> {editLoan ? 'Save Changes' : 'Add Loan'}</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Pay EMI Modal ───────────────────────────────────── */}
      {modal === 'pay' && payTarget && (
        <div className="lm-overlay" onClick={e => e.target === e.currentTarget && closeModal()}>
          <div className="lm-box">
            <div className="lm-hdr pay-hdr">
              <div className="lm-hdr-icon pay-icon"><i className="fa fa-circle-check" /></div>
              <div>
                <div className="lm-title">Record EMI Payment</div>
                <div className="lm-sub">{payTarget.title}</div>
              </div>
              <button className="lm-close" onClick={closeModal}><i className="fa fa-xmark" /></button>
            </div>

            <div className="lm-body">
              <div className="pay-summary">
                <div className="pay-sum-item"><span>EMI Amount</span><strong>{fmtAmt(payTarget.emi_amount)}</strong></div>
                <div className="pay-sum-item"><span>Outstanding</span><strong className="red-val">{fmtAmt(payTarget.outstanding_balance)}</strong></div>
                <div className="pay-sum-item"><span>Due Date</span>
                  <strong className={daysUntil(payTarget.next_due_date) < 0 ? 'red-val' : ''}>
                    {fmtDate(payTarget.next_due_date)}
                  </strong>
                </div>
              </div>

              <div className="lf-row">
                <div className="lf-field">
                  <label className="lf-label">Payment Date *</label>
                  <input className="lf-input" type="date" value={payForm.payment_date}
                    onChange={e => { setPayForm(f => ({ ...f, payment_date: e.target.value })); setError(''); }} />
                </div>
                <div className="lf-field">
                  <label className="lf-label">Amount Paid *</label>
                  <div className="lf-wrap"><i className="fa fa-indian-rupee-sign lf-ico" />
                    <input className="lf-input" type="number" value={payForm.amount}
                      onChange={e => { setPayForm(f => ({ ...f, amount: e.target.value })); setError(''); }}
                      placeholder={payTarget.emi_amount || ''} />
                  </div>
                </div>
              </div>

              <div className="lf-row">
                <div className="lf-field">
                  <label className="lf-label">Payment Method</label>
                  <select className="lf-input" value={payForm.payment_method}
                    onChange={e => setPayForm(f => ({ ...f, payment_method: e.target.value }))}>
                    {PAY_METHODS.map(m => <option key={m.val} value={m.val}>{m.label}</option>)}
                  </select>
                </div>
                <div className="lf-field">
                  <label className="lf-label">Receipt / Transaction ID</label>
                  <div className="lf-wrap"><i className="fa fa-receipt lf-ico" />
                    <input className="lf-input" value={payForm.receipt_no}
                      onChange={e => setPayForm(f => ({ ...f, receipt_no: e.target.value }))} placeholder="Optional" />
                  </div>
                </div>
              </div>

              <div className="lf-field">
                <label className="lf-label">Notes</label>
                <input className="lf-input" value={payForm.notes}
                  onChange={e => setPayForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional note…" />
              </div>

              {error && <div className="lf-error"><i className="fa fa-circle-exclamation" /> {error}</div>}
            </div>

            <div className="lm-footer">
              <button className="lm-cancel" onClick={closeModal} disabled={saving}>Cancel</button>
              <button className="lm-save pay-save" onClick={handlePay} disabled={saving}>
                {saving ? <><i className="fa fa-spinner fa-spin" /> Recording…</> : <><i className="fa fa-circle-check" /> Confirm Payment</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Payment History Modal ───────────────────────────── */}
      {modal === 'history' && histLoan && (
        <div className="lm-overlay" onClick={e => e.target === e.currentTarget && closeModal()}>
          <div className="lm-box">
            <div className="lm-hdr">
              <div className="lm-hdr-icon hist-icon"><i className="fa fa-clock-rotate-left" /></div>
              <div>
                <div className="lm-title">Payment History</div>
                <div className="lm-sub">{histLoan.title}</div>
              </div>
              <button className="lm-close" onClick={closeModal}><i className="fa fa-xmark" /></button>
            </div>
            <div className="lm-body">
              {payments.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#94a3b8', padding: '30px 0' }}>No payments recorded yet.</div>
              ) : (
                <>
                  <div className="hist-totals">
                    <span>Total Paid: <strong>{fmtAmt(payments.reduce((s, p) => s + (p.amount || 0), 0))}</strong></span>
                    <span>{payments.length} payment{payments.length > 1 ? 's' : ''}</span>
                  </div>
                  <div className="hist-list">
                    {payments.map(p => (
                      <div key={p.id} className="hist-row">
                        <div className="hist-date">{fmtDate(p.payment_date)}</div>
                        <div className="hist-mid">
                          <span className="hist-method">{(p.payment_method || '').replace('_', ' ')}</span>
                          {p.receipt_no && <span className="hist-receipt">#{p.receipt_no}</span>}
                          {p.notes && <span className="hist-note">{p.notes}</span>}
                        </div>
                        <div className="hist-amt">{fmtAmt(p.amount)}</div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
            <div className="lm-footer">
              <button className="lm-save" onClick={closeModal}><i className="fa fa-check" /> Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
