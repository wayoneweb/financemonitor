import React, { useState, useEffect, useContext, useMemo } from 'react';
import { ToastContext } from '../App';
import { investmentsApi } from '../api';
import './Investments.css';

// ── Constants ────────────────────────────────────────────────
const INV_TYPES = {
  mutual_fund:  { label: 'Mutual Fund',    icon: 'fa-chart-line',         color: 'it-mf' },
  fd:           { label: 'Fixed Deposit',  icon: 'fa-building-columns',   color: 'it-fd' },
  rd:           { label: 'Recurring Dep.', icon: 'fa-calendar-days',      color: 'it-rd' },
  stocks:       { label: 'Stocks',         icon: 'fa-arrow-trend-up',     color: 'it-stocks' },
  ppf:          { label: 'PPF',            icon: 'fa-shield-halved',      color: 'it-ppf' },
  nps:          { label: 'NPS / Pension',  icon: 'fa-umbrella',           color: 'it-nps' },
  gold:         { label: 'Gold / Bonds',   icon: 'fa-coins',              color: 'it-gold' },
  real_estate:  { label: 'Real Estate',    icon: 'fa-house-chimney',      color: 'it-re' },
  other:        { label: 'Other',          icon: 'fa-circle-dollar-to-slot', color: 'it-other' },
};
const FREQ_OPTS = [
  { val: 'one_time',  label: 'One-time (Lumpsum)' },
  { val: 'monthly',   label: 'Monthly (SIP/RD)' },
  { val: 'quarterly', label: 'Quarterly' },
  { val: 'yearly',    label: 'Yearly' },
];
const PAY_METHODS = [
  { val: 'bank_transfer', label: 'Bank Transfer' },
  { val: 'upi',           label: 'UPI / IMPS' },
  { val: 'auto_debit',    label: 'Auto Debit' },
  { val: 'cheque',        label: 'Cheque' },
  { val: 'neft',          label: 'NEFT / RTGS' },
];
const INV_EMPTY = {
  title: '', investment_type: 'mutual_fund', institution: '',
  principal_amount: '', expected_return_rate: '',
  start_date: '', maturity_date: '', maturity_amount: '',
  current_value: '', payment_frequency: 'one_time',
  payment_amount: '', next_payment_date: '', notes: '',
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

const getMaturityTag = (inv) => {
  if (inv.status === 'matured')   return { label: 'Matured',    cls: 'mat-done' };
  if (inv.status === 'withdrawn') return { label: 'Withdrawn',  cls: 'mat-withdrawn' };
  const d = daysUntil(inv.maturity_date);
  if (d === null) return { label: 'Active', cls: 'mat-ok' };
  if (d < 0)      return { label: `Matured ${-d}d ago`, cls: 'mat-done' };
  if (d <= 30)    return { label: `Matures in ${d}d`,   cls: 'mat-soon' };
  return          { label: fmtDate(inv.maturity_date),   cls: 'mat-ok' };
};

const getPaymentTag = (inv) => {
  if (inv.payment_frequency === 'one_time' || !inv.next_payment_date) return null;
  const d = daysUntil(inv.next_payment_date);
  if (d === null) return null;
  if (d < 0)  return { label: `Payment ${-d}d overdue`, cls: 'pt-overdue' };
  if (d === 0) return { label: 'Payment due today!', cls: 'pt-today' };
  if (d <= 7)  return { label: `Payment in ${d}d`, cls: 'pt-soon' };
  return null;
};

// ── Component ────────────────────────────────────────────────
export default function Investments() {
  const showToast = useContext(ToastContext);
  const [investments, setInvestments] = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [alerts,      setAlerts]      = useState({ due_soon: 0, maturing_soon: 0 });
  const [tab,         setTab]         = useState('active');
  const [modal,       setModal]       = useState(null);   // 'form' | 'pay' | 'history'
  const [editInv,     setEditInv]     = useState(null);
  const [payTarget,   setPayTarget]   = useState(null);
  const [histInv,     setHistInv]     = useState(null);
  const [payments,    setPayments]    = useState([]);
  const [form,        setForm]        = useState(INV_EMPTY);
  const [payForm,     setPayForm]     = useState({ payment_date: todayStr(), amount: '', payment_method: 'bank_transfer', notes: '' });
  const [saving,      setSaving]      = useState(false);
  const [deleting,    setDeleting]    = useState(null);
  const [error,       setError]       = useState('');

  // Load
  const load = async () => {
    setLoading(true);
    try { setInvestments(await investmentsApi.list()); } catch { showToast('Failed to load investments', 'error'); }
    finally { setLoading(false); }
  };
  const loadAlerts = async () => {
    try { setAlerts(await investmentsApi.reminders()); } catch {}
  };
  useEffect(() => { load(); loadAlerts(); }, []); // eslint-disable-line

  // Derived
  const filtered = investments.filter(inv =>
    tab === 'all'    ? true :
    tab === 'active' ? inv.status === 'active' :
    inv.status !== 'active'
  );

  const summary = useMemo(() => {
    const active = investments.filter(i => i.status === 'active');
    const totalInvested = active.reduce((s, i) => s + (i.total_invested || i.principal_amount || 0), 0);
    const currentValue  = active.reduce((s, i) => s + (i.current_value || 0), 0);
    const maturingSoon  = active.filter(i => { const d = daysUntil(i.maturity_date); return d !== null && d >= 0 && d <= 30; }).length;
    return { totalInvested, currentValue, returns: currentValue - totalInvested, maturingSoon };
  }, [investments]);

  // Modal helpers
  const openAdd = () => { setForm(INV_EMPTY); setEditInv(null); setError(''); setModal('form'); };
  const openEdit = (inv) => {
    setForm({
      title: inv.title || '', investment_type: inv.investment_type || 'mutual_fund',
      institution: inv.institution || '', principal_amount: inv.principal_amount || '',
      expected_return_rate: inv.expected_return_rate || '',
      start_date: inv.start_date || '', maturity_date: inv.maturity_date || '',
      maturity_amount: inv.maturity_amount || '', current_value: inv.current_value || '',
      payment_frequency: inv.payment_frequency || 'one_time',
      payment_amount: inv.payment_amount || '', next_payment_date: inv.next_payment_date || '',
      notes: inv.notes || '',
    });
    setEditInv(inv); setError(''); setModal('form');
  };
  const openPay = (inv) => {
    setPayTarget(inv);
    setPayForm({ payment_date: todayStr(), amount: inv.payment_amount || '', payment_method: 'bank_transfer', notes: '' });
    setError(''); setModal('pay');
  };
  const openHistory = async (inv) => {
    setHistInv(inv); setPayments([]); setModal('history');
    try { setPayments(await investmentsApi.payments(inv.id)); } catch {}
  };
  const closeModal = () => { setModal(null); setError(''); };

  const fc = (e) => { const { name, value } = e.target; setForm(f => ({ ...f, [name]: value })); setError(''); };

  // CRUD
  const handleSave = async () => {
    if (!form.title.trim()) return setError('Investment title is required.');
    setSaving(true); setError('');
    try {
      if (editInv) {
        const d = await investmentsApi.update(editInv.id, form);
        if (d.error) throw new Error(d.error);
        showToast('Investment updated', 'success');
      } else {
        const d = await investmentsApi.create(form);
        if (d.error) throw new Error(d.error);
        showToast('Investment added', 'success');
      }
      closeModal(); load(); loadAlerts();
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  const handlePay = async () => {
    if (!payForm.payment_date || !payForm.amount) return setError('Date and amount are required.');
    setSaving(true); setError('');
    try {
      const d = await investmentsApi.addPayment(payTarget.id, payForm);
      if (d.error) throw new Error(d.error);
      showToast('Contribution recorded successfully', 'success');
      closeModal(); load(); loadAlerts();
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  const handleMarkMatured = async (inv) => {
    try {
      await investmentsApi.update(inv.id, { status: 'matured' });
      showToast(`${inv.title} marked as matured`, 'success'); load(); loadAlerts();
    } catch { showToast('Failed to update', 'error'); }
  };

  const handleDelete = async (inv) => {
    if (!window.confirm(`Delete investment "${inv.title}"? All contribution history will be lost.`)) return;
    setDeleting(inv.id);
    try {
      const d = await investmentsApi.remove(inv.id);
      if (d.error) throw new Error(d.error);
      showToast('Investment deleted', 'success'); load(); loadAlerts();
    } catch (e) { showToast(e.message, 'error'); }
    finally { setDeleting(null); }
  };

  const tabCount = (t) =>
    t === 'active'   ? investments.filter(i => i.status === 'active').length :
    t === 'inactive' ? investments.filter(i => i.status !== 'active').length :
    investments.length;

  const showRecurring = ['monthly', 'quarterly', 'yearly'].includes(form.payment_frequency);

  return (
    <div className="inv-page">

      {/* ── Header ─────────────────────────────────────────── */}
      <div className="inv-header">
        <div className="inv-hdr-inner">
          <div className="inv-hdr-left">
            <div className="inv-hdr-icon"><i className="fa fa-chart-line" /></div>
            <div>
              <div className="inv-hdr-title">Investments Tracker</div>
              <div className="inv-hdr-sub">Monitor your investments, SIPs, FDs and portfolio growth</div>
            </div>
          </div>
          <button className="inv-btn-add" onClick={openAdd}>
            <i className="fa fa-plus" /> Add Investment
          </button>
        </div>
      </div>

      {/* ── Summary Cards ──────────────────────────────────── */}
      <div className="inv-summary-grid">
        <div className="istat invested-stat">
          <div className="istat-icon"><i className="fa fa-indian-rupee-sign" /></div>
          <div className="istat-body">
            <div className="istat-label">Total Invested</div>
            <div className="istat-value">{fmtAmt(summary.totalInvested)}</div>
          </div>
        </div>
        <div className="istat value-stat">
          <div className="istat-icon"><i className="fa fa-wallet" /></div>
          <div className="istat-body">
            <div className="istat-label">Current Value</div>
            <div className="istat-value">{fmtAmt(summary.currentValue)}</div>
          </div>
        </div>
        <div className={`istat ${summary.returns >= 0 ? 'gain-stat' : 'loss-stat'}`}>
          <div className="istat-icon">
            <i className={`fa ${summary.returns >= 0 ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down'}`} />
          </div>
          <div className="istat-body">
            <div className="istat-label">Total Returns</div>
            <div className="istat-value">{summary.returns >= 0 ? '+' : ''}{fmtAmt(summary.returns)}</div>
          </div>
        </div>
        <div className={`istat ${summary.maturingSoon > 0 ? 'mat-alert-stat' : 'mat-ok-stat'}`}>
          <div className="istat-icon"><i className="fa fa-flag" /></div>
          <div className="istat-body">
            <div className="istat-label">Maturing in 30 Days</div>
            <div className="istat-value">{summary.maturingSoon > 0 ? `${summary.maturingSoon} investment${summary.maturingSoon > 1 ? 's' : ''}` : 'None'}</div>
          </div>
        </div>
      </div>

      {/* ── Reminder Banner ────────────────────────────────── */}
      {(alerts.due_soon > 0 || alerts.maturing_soon > 0) && (
        <div className={`inv-reminder ${alerts.maturing_soon > 0 ? 'rem-mat' : 'rem-pay'}`}>
          <div className="rem-icon">
            <i className={`fa ${alerts.maturing_soon > 0 ? 'fa-flag' : 'fa-bell'}`} />
          </div>
          <div className="rem-text">
            {alerts.maturing_soon > 0 && (
              <p><strong>{alerts.maturing_soon} investment{alerts.maturing_soon > 1 ? 's' : ''} maturing within 30 days!</strong> Review and plan reinvestment or withdrawal.</p>
            )}
            {alerts.due_soon > 0 && (
              <p><strong>{alerts.due_soon} SIP / recurring payment{alerts.due_soon > 1 ? 's' : ''} due within 7 days.</strong> Ensure sufficient balance.</p>
            )}
          </div>
        </div>
      )}

      {/* ── Table Card ─────────────────────────────────────── */}
      <div className="inv-table-card">
        <div className="inv-table-hdr">
          <div className="inv-tabs">
            {[['active','Active'], ['inactive','Closed / Matured'], ['all','All']].map(([t, label]) => (
              <button key={t} className={`inv-tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
                {label}<span className="tab-count">{tabCount(t)}</span>
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="inv-state"><i className="fa fa-spinner fa-spin" /> Loading investments…</div>
        ) : filtered.length === 0 ? (
          <div className="inv-state">
            <i className="fa fa-chart-line" style={{ fontSize: '2rem', color: '#94a3b8', display: 'block', marginBottom: 10 }} />
            {tab === 'active' ? 'No active investments. Click "Add Investment" to get started.' : 'No investments in this category.'}
          </div>
        ) : (
          <div className="inv-table-wrap">
            <table className="inv-table">
              <thead>
                <tr>
                  <th>#</th><th>Investment</th><th>Institution</th>
                  <th>Principal / SIP</th><th>Return Rate</th>
                  <th>Maturity / Next Payment</th><th>Current Value</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((inv, i) => {
                  const ti = INV_TYPES[inv.investment_type] || INV_TYPES.other;
                  const matTag = getMaturityTag(inv);
                  const payTag = getPaymentTag(inv);
                  const returns = (inv.current_value || 0) - (inv.total_invested || inv.principal_amount || 0);
                  return (
                    <tr key={inv.id} className={inv.status !== 'active' ? 'row-inactive' : ''}>
                      <td className="col-num">{i + 1}</td>
                      <td>
                        <div className="inv-name-cell">
                          <div className={`inv-type-ico ${ti.color}`}><i className={`fa ${ti.icon}`} /></div>
                          <div>
                            <div className="inv-name">{inv.title}</div>
                            <div className="inv-type-badge">{ti.label}</div>
                          </div>
                        </div>
                      </td>
                      <td><span className="inv-institution">{inv.institution || '—'}</span></td>
                      <td>
                        <div className="inv-amt">{fmtAmt(inv.total_invested || inv.principal_amount)}</div>
                        {inv.payment_frequency !== 'one_time' && inv.payment_amount && (
                          <div className="inv-sip-amt">SIP: {fmtAmt(inv.payment_amount)} / {inv.payment_frequency === 'monthly' ? 'mo' : inv.payment_frequency === 'quarterly' ? 'qtr' : 'yr'}</div>
                        )}
                      </td>
                      <td>
                        {inv.expected_return_rate
                          ? <span className="inv-rate">{inv.expected_return_rate}% p.a.</span>
                          : <span style={{ color: '#94a3b8' }}>—</span>}
                      </td>
                      <td>
                        <div className="inv-due-cell">
                          {inv.maturity_date && (
                            <span className={`mat-tag ${matTag.cls}`}>{matTag.label}</span>
                          )}
                          {payTag && (
                            <span className={`pay-tag ${payTag.cls}`}>{payTag.label}</span>
                          )}
                          {inv.payment_frequency !== 'one_time' && inv.next_payment_date && !payTag && (
                            <span className="inv-next-pay">Next: {fmtDate(inv.next_payment_date)}</span>
                          )}
                          {!inv.maturity_date && !inv.next_payment_date && <span style={{ color: '#94a3b8' }}>—</span>}
                        </div>
                      </td>
                      <td>
                        <div className="inv-curr-val">{fmtAmt(inv.current_value || inv.principal_amount)}</div>
                        {returns !== 0 && (
                          <div className={`inv-returns ${returns >= 0 ? 'ret-pos' : 'ret-neg'}`}>
                            {returns >= 0 ? '+' : ''}{fmtAmt(returns)}
                          </div>
                        )}
                      </td>
                      <td>
                        <div className="inv-actions">
                          {inv.status === 'active' && (
                            <button className="iact pay-btn" onClick={() => openPay(inv)}>
                              <i className="fa fa-plus" /> Contribute
                            </button>
                          )}
                          {inv.status === 'active' && inv.maturity_date && daysUntil(inv.maturity_date) < 0 && (
                            <button className="iact mat-btn" onClick={() => handleMarkMatured(inv)} title="Mark Matured">
                              <i className="fa fa-flag" />
                            </button>
                          )}
                          <button className="iact edit-btn" onClick={() => openEdit(inv)} title="Edit"><i className="fa fa-pen" /></button>
                          <button className="iact hist-btn" onClick={() => openHistory(inv)} title="History"><i className="fa fa-clock-rotate-left" /></button>
                          <button className="iact del-btn" onClick={() => handleDelete(inv)} disabled={deleting === inv.id} title="Delete">
                            {deleting === inv.id ? <i className="fa fa-spinner fa-spin" /> : <i className="fa fa-trash" />}
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

      {/* ── Investment Form Modal ───────────────────────────── */}
      {modal === 'form' && (
        <div className="im-overlay" onClick={e => e.target === e.currentTarget && closeModal()}>
          <div className="im-box im-form-box">
            <div className="im-hdr">
              <div className="im-hdr-icon"><i className="fa fa-chart-line" /></div>
              <div>
                <div className="im-title">{editInv ? 'Edit Investment' : 'Add Investment'}</div>
                <div className="im-sub">{editInv ? `Editing: ${editInv.title}` : 'Enter investment details'}</div>
              </div>
              <button className="im-close" onClick={closeModal}><i className="fa fa-xmark" /></button>
            </div>

            <div className="im-body">
              {/* Title */}
              <div className="if-field">
                <label className="if-label">Investment Title *</label>
                <div className="if-wrap"><i className="fa fa-tag if-ico" />
                  <input name="title" className="if-input" value={form.title} onChange={fc} placeholder="e.g. SBI Mutual Fund - Bluechip" autoFocus />
                </div>
              </div>

              {/* Investment type */}
              <div className="if-field">
                <label className="if-label">Investment Type</label>
                <div className="inv-type-grid">
                  {Object.entries(INV_TYPES).map(([k, v]) => (
                    <button key={k} type="button"
                      className={`iv-btn ${v.color}${form.investment_type === k ? ' selected' : ''}`}
                      onClick={() => { setForm(f => ({ ...f, investment_type: k })); setError(''); }}>
                      <i className={`fa ${v.icon}`} /><span>{v.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Institution */}
              <div className="if-field">
                <label className="if-label">Institution / Bank / AMC</label>
                <div className="if-wrap"><i className="fa fa-building if-ico" />
                  <input name="institution" className="if-input" value={form.institution} onChange={fc} placeholder="e.g. HDFC Bank, Zerodha, SBI AMC" />
                </div>
              </div>

              {/* Principal + return rate */}
              <div className="if-row">
                <div className="if-field">
                  <label className="if-label">Principal / Initial Amount</label>
                  <div className="if-wrap"><i className="fa fa-indian-rupee-sign if-ico" />
                    <input name="principal_amount" className="if-input" type="number" value={form.principal_amount} onChange={fc} placeholder="50000" />
                  </div>
                </div>
                <div className="if-field">
                  <label className="if-label">Expected Return Rate (% p.a.)</label>
                  <div className="if-wrap"><i className="fa fa-percent if-ico" />
                    <input name="expected_return_rate" className="if-input" type="number" step="0.01" value={form.expected_return_rate} onChange={fc} placeholder="12.5" />
                  </div>
                </div>
              </div>

              {/* Dates */}
              <div className="if-row">
                <div className="if-field">
                  <label className="if-label">Start Date</label>
                  <input name="start_date" className="if-input" type="date" value={form.start_date} onChange={fc} />
                </div>
                <div className="if-field">
                  <label className="if-label">Maturity Date</label>
                  <input name="maturity_date" className="if-input" type="date" value={form.maturity_date} onChange={fc} />
                </div>
              </div>

              {/* Maturity amount + current value */}
              <div className="if-row">
                <div className="if-field">
                  <label className="if-label">Expected Maturity Amount</label>
                  <div className="if-wrap"><i className="fa fa-indian-rupee-sign if-ico" />
                    <input name="maturity_amount" className="if-input" type="number" value={form.maturity_amount} onChange={fc} placeholder="Optional" />
                  </div>
                </div>
                <div className="if-field">
                  <label className="if-label">Current Market Value</label>
                  <div className="if-wrap"><i className="fa fa-indian-rupee-sign if-ico" />
                    <input name="current_value" className="if-input" type="number" value={form.current_value} onChange={fc} placeholder="Update for real-time returns" />
                  </div>
                </div>
              </div>

              {/* Payment frequency */}
              <div className="if-field">
                <label className="if-label">Payment Frequency (SIP / RD / Recurring)</label>
                <div className="freq-grid">
                  {FREQ_OPTS.map(f => (
                    <button key={f.val} type="button"
                      className={`freq-btn${form.payment_frequency === f.val ? ' selected' : ''}`}
                      onClick={() => { setForm(prev => ({ ...prev, payment_frequency: f.val })); setError(''); }}>
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Recurring fields */}
              {showRecurring && (
                <div className="if-row">
                  <div className="if-field">
                    <label className="if-label">Payment Amount</label>
                    <div className="if-wrap"><i className="fa fa-indian-rupee-sign if-ico" />
                      <input name="payment_amount" className="if-input" type="number" value={form.payment_amount} onChange={fc} placeholder="5000" />
                    </div>
                  </div>
                  <div className="if-field">
                    <label className="if-label">Next Payment Date</label>
                    <input name="next_payment_date" className="if-input" type="date" value={form.next_payment_date} onChange={fc} />
                  </div>
                </div>
              )}

              {/* Notes */}
              <div className="if-field">
                <label className="if-label">Notes</label>
                <textarea name="notes" className="if-input if-textarea" value={form.notes} onChange={fc} rows={2} placeholder="Any additional details…" />
              </div>

              {error && <div className="if-error"><i className="fa fa-circle-exclamation" /> {error}</div>}
            </div>

            <div className="im-footer">
              <button className="im-cancel" onClick={closeModal} disabled={saving}>Cancel</button>
              <button className="im-save" onClick={handleSave} disabled={saving}>
                {saving ? <><i className="fa fa-spinner fa-spin" /> Saving…</> : <><i className="fa fa-check" /> {editInv ? 'Save Changes' : 'Add Investment'}</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Contribution Modal ──────────────────────────── */}
      {modal === 'pay' && payTarget && (
        <div className="im-overlay" onClick={e => e.target === e.currentTarget && closeModal()}>
          <div className="im-box">
            <div className="im-hdr">
              <div className="im-hdr-icon pay-icon"><i className="fa fa-plus" /></div>
              <div>
                <div className="im-title">Add Contribution</div>
                <div className="im-sub">{payTarget.title}</div>
              </div>
              <button className="im-close" onClick={closeModal}><i className="fa fa-xmark" /></button>
            </div>

            <div className="im-body">
              <div className="contrib-summary">
                <div className="cs-item"><span>Total Invested</span><strong>{fmtAmt(payTarget.total_invested || payTarget.principal_amount)}</strong></div>
                <div className="cs-item"><span>Current Value</span><strong>{fmtAmt(payTarget.current_value)}</strong></div>
                {payTarget.payment_frequency !== 'one_time' && payTarget.payment_amount && (
                  <div className="cs-item"><span>SIP Amount</span><strong>{fmtAmt(payTarget.payment_amount)}</strong></div>
                )}
              </div>

              <div className="if-row">
                <div className="if-field">
                  <label className="if-label">Payment Date *</label>
                  <input className="if-input" type="date" value={payForm.payment_date}
                    onChange={e => { setPayForm(f => ({ ...f, payment_date: e.target.value })); setError(''); }} />
                </div>
                <div className="if-field">
                  <label className="if-label">Amount *</label>
                  <div className="if-wrap"><i className="fa fa-indian-rupee-sign if-ico" />
                    <input className="if-input" type="number" value={payForm.amount}
                      onChange={e => { setPayForm(f => ({ ...f, amount: e.target.value })); setError(''); }}
                      placeholder={payTarget.payment_amount || ''} />
                  </div>
                </div>
              </div>

              <div className="if-row">
                <div className="if-field">
                  <label className="if-label">Payment Method</label>
                  <select className="if-input" value={payForm.payment_method}
                    onChange={e => setPayForm(f => ({ ...f, payment_method: e.target.value }))}>
                    {PAY_METHODS.map(m => <option key={m.val} value={m.val}>{m.label}</option>)}
                  </select>
                </div>
                <div className="if-field">
                  <label className="if-label">Notes</label>
                  <input className="if-input" value={payForm.notes}
                    onChange={e => setPayForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional" />
                </div>
              </div>

              {error && <div className="if-error"><i className="fa fa-circle-exclamation" /> {error}</div>}
            </div>

            <div className="im-footer">
              <button className="im-cancel" onClick={closeModal} disabled={saving}>Cancel</button>
              <button className="im-save" onClick={handlePay} disabled={saving}>
                {saving ? <><i className="fa fa-spinner fa-spin" /> Recording…</> : <><i className="fa fa-check" /> Add Contribution</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Contribution History Modal ──────────────────────── */}
      {modal === 'history' && histInv && (
        <div className="im-overlay" onClick={e => e.target === e.currentTarget && closeModal()}>
          <div className="im-box">
            <div className="im-hdr">
              <div className="im-hdr-icon hist-icon"><i className="fa fa-clock-rotate-left" /></div>
              <div>
                <div className="im-title">Contribution History</div>
                <div className="im-sub">{histInv.title}</div>
              </div>
              <button className="im-close" onClick={closeModal}><i className="fa fa-xmark" /></button>
            </div>
            <div className="im-body">
              {payments.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#94a3b8', padding: '30px 0' }}>No contributions recorded yet.</div>
              ) : (
                <>
                  <div className="chist-totals">
                    <span>Total Contributed: <strong>{fmtAmt(payments.reduce((s, p) => s + (p.amount || 0), 0))}</strong></span>
                    <span>{payments.length} contribution{payments.length > 1 ? 's' : ''}</span>
                  </div>
                  <div className="chist-list">
                    {payments.map(p => (
                      <div key={p.id} className="chist-row">
                        <div className="chist-date">{fmtDate(p.payment_date)}</div>
                        <div className="chist-mid">
                          <span className="chist-method">{(p.payment_method || '').replace('_', ' ')}</span>
                          {p.notes && <span className="chist-note">{p.notes}</span>}
                        </div>
                        <div className="chist-amt">{fmtAmt(p.amount)}</div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
            <div className="im-footer">
              <button className="im-save" onClick={closeModal}><i className="fa fa-check" /> Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
