import React, { useState, useEffect, useCallback, useContext } from 'react';
import { hrApi, projectsApi } from '../api';
import { ToastContext } from '../App';
import './Payroll.css';

const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];
const TODAY = new Date();

const fmt = (n) => parseFloat(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });

function PayDetailModal({ payroll: pr, projects, onClose, onPay, onUpdate, showToast }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(pr);
  const [paying, setPaying] = useState(false);
  const [payForm, setPayForm] = useState({ payment_date: TODAY.toISOString().slice(0,10), payment_mode: 'bank_transfer', notes: '' });
  const [showPayForm, setShowPayForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const gross = parseFloat(form.basic||0)+parseFloat(form.hra||0)+parseFloat(form.da||0)+parseFloat(form.ta||0)+parseFloat(form.other_allowance||0);
  const totalDed = parseFloat(form.pf_deduction||0)+parseFloat(form.esi_deduction||0)+parseFloat(form.advance_deduction||0)+parseFloat(form.other_deduction||0);
  const net = Math.max(0, gross - totalDed);

  const saveEdits = async () => {
    setSaving(true);
    try {
      const updated = await hrApi.payrollUpdate(pr.id, { ...form, gross, total_deduction: totalDed, net_salary: net });
      setEditing(false);
      setForm(updated);
      onUpdate(updated);
      showToast('Payroll updated');
    } catch (e) {
      showToast(e?.error || 'Failed to update', 'error');
    } finally { setSaving(false); }
  };

  const doPay = async () => {
    setPaying(true);
    try {
      const updated = await hrApi.payrollPay(pr.id, payForm);
      onPay(updated);
      onClose();
      showToast('Salary marked as paid!');
    } catch (e) {
      showToast(e?.error || 'Failed to pay', 'error');
    } finally { setPaying(false); }
  };

  const openPdf = () => {
    fetch(hrApi.payrollPdfUrl(pr.id))
      .then(r => { if (!r.ok) throw new Error(); return r.blob(); })
      .then(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.target = '_blank'; a.rel = 'noreferrer';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      })
      .catch(() => showToast('Failed to generate PDF', 'error'));
  };

  const row = (label, key, editable = true) => (
    <div className="pr-detail-row" key={key}>
      <span className="pr-detail-label">{label}</span>
      {editing && editable
        ? <input className="pr-detail-input" type="number" value={form[key] || 0}
            onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} min="0" step="0.01" />
        : <span className="pr-detail-value">₹ {fmt(pr[key])}</span>}
    </div>
  );

  return (
    <div className="pr-modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="pr-modal-box">
        <div className="pr-modal-header">
          <div>
            <div className="pr-modal-name">{pr.name}</div>
            <div className="pr-modal-month">{MONTHS[pr.month-1]} {pr.year} Payslip · {pr.employee_id}</div>
          </div>
          <div className="pr-modal-actions">
            {pr.status === 'draft' && !editing && (
              <button className="pr-act-btn pr-act-edit" onClick={() => setEditing(true)}><i className="fa fa-pen" /> Edit</button>
            )}
            {editing && (
              <>
                <button className="pr-act-btn pr-act-save" onClick={saveEdits} disabled={saving}><i className="fa fa-check" /> Save</button>
                <button className="pr-act-btn" onClick={() => { setEditing(false); setForm(pr); }}>Cancel</button>
              </>
            )}
            <button className="pr-act-btn" onClick={openPdf}><i className="fa fa-file-pdf" /> PDF</button>
            <button className="pr-modal-close" onClick={onClose}><i className="fa fa-xmark" /></button>
          </div>
        </div>

        <div className="pr-modal-body">
          {/* Attendance summary */}
          <div className="pr-att-row">
            {[['Working Days', pr.working_days], ['Present', pr.present_days], ['Absent', pr.absent_days],
              ['Leave', pr.leave_days], ['Half Day', pr.half_days], ['Paid Days', pr.paid_days]].map(([l,v]) => (
              <div key={l} className="pr-att-box">
                <div className="pr-att-val">{v}</div>
                <div className="pr-att-lbl">{l}</div>
              </div>
            ))}
          </div>

          <div className="pr-columns">
            {/* Earnings */}
            <div className="pr-col">
              <div className="pr-col-header pr-col-earn">Earnings</div>
              {row('Basic Salary', 'basic')}
              {row('HRA', 'hra')}
              {row('DA', 'da')}
              {row('Travel Allowance', 'ta')}
              {row('Other Allowance', 'other_allowance')}
              <div className="pr-detail-total pr-total-earn">
                <span>Gross Salary</span>
                <span>₹ {fmt(editing ? gross : pr.gross)}</span>
              </div>
            </div>

            {/* Deductions */}
            <div className="pr-col">
              <div className="pr-col-header pr-col-ded">Deductions</div>
              {row('PF (Employee)', 'pf_deduction')}
              {row('ESI', 'esi_deduction')}
              {row('Advance Recovery', 'advance_deduction')}
              {row('Other Deductions', 'other_deduction')}
              <div className="pr-detail-total pr-total-ded">
                <span>Total Deductions</span>
                <span>₹ {fmt(editing ? totalDed : pr.total_deduction)}</span>
              </div>
            </div>
          </div>

          <div className="pr-net-bar">
            <div>
              <div className="pr-net-label">NET SALARY PAYABLE</div>
              <div className="pr-net-amount">₹ {fmt(editing ? net : pr.net_salary)}</div>
            </div>
            <div className="pr-net-status-area">
              {pr.status === 'paid' ? (
                <div>
                  <span className="pr-paid-badge"><i className="fa fa-circle-check" /> PAID</span>
                  {pr.payment_date && <div className="pr-paid-date">{pr.payment_date} · {pr.payment_mode}</div>}
                </div>
              ) : (
                !showPayForm && !editing && (
                  <button className="pr-pay-btn" onClick={() => setShowPayForm(true)}>
                    <i className="fa fa-wallet" /> Pay Salary
                  </button>
                )
              )}
            </div>
          </div>

          {/* Pay form */}
          {showPayForm && pr.status === 'draft' && (
            <div className="pr-pay-form">
              <div className="pr-pay-form-title">Record Payment</div>
              <div className="pr-pay-form-row">
                <label className="pr-pay-label">
                  Payment Date
                  <input type="date" value={payForm.payment_date} onChange={e => setPayForm(f => ({ ...f, payment_date: e.target.value }))} />
                </label>
                <label className="pr-pay-label">
                  Payment Mode
                  <select value={payForm.payment_mode} onChange={e => setPayForm(f => ({ ...f, payment_mode: e.target.value }))}>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="cash">Cash</option>
                    <option value="cheque">Cheque</option>
                    <option value="upi">UPI</option>
                  </select>
                </label>
              </div>
              {pr.project_id && (
                <div className="pr-pay-txn-note">
                  <i className="fa fa-info-circle" /> An expense transaction of ₹ {fmt(pr.net_salary)} will be created in {pr.project_name}.
                </div>
              )}
              <div className="pr-pay-form-actions">
                <button className="pr-confirm-pay" onClick={doPay} disabled={paying}>
                  {paying ? <><i className="fa fa-spinner fa-spin" /> Processing…</> : <><i className="fa fa-check" /> Confirm Payment</>}
                </button>
                <button className="pr-cancel-pay" onClick={() => setShowPayForm(false)}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Payroll() {
  const showToast = useContext(ToastContext);
  const [month, setMonth]       = useState(TODAY.getMonth() + 1);
  const [year, setYear]         = useState(TODAY.getFullYear());
  const [projects, setProjects] = useState([]);
  const [projectFilter, setProjectFilter] = useState('');
  const [statusFilter, setStatusFilter]   = useState('');
  const [payrolls, setPayrolls] = useState([]);
  const [loading, setLoading]   = useState(false);
  const [generating, setGenerating] = useState(false);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    projectsApi.list().then(d => setProjects(d || [])).catch(() => {});
  }, []);

  const loadPayrolls = useCallback(() => {
    setLoading(true);
    const p = { month, year };
    if (projectFilter) p.project_id = projectFilter;
    if (statusFilter)  p.status = statusFilter;
    hrApi.payroll(p)
      .then(d => setPayrolls(d || []))
      .catch(() => showToast('Failed to load payroll', 'error'))
      .finally(() => setLoading(false));
  }, [month, year, projectFilter, statusFilter, showToast]);

  useEffect(() => { loadPayrolls(); }, [loadPayrolls]);

  const generate = async () => {
    setGenerating(true);
    try {
      const d = { month, year };
      if (projectFilter) d.project_id = projectFilter;
      const result = await hrApi.payrollGenerate(d);
      setPayrolls(result || []);
      showToast(`Generated payroll for ${result.length} staff`);
    } catch (e) {
      showToast(e?.error || 'Failed to generate', 'error');
    } finally { setGenerating(false); }
  };

  const downloadExcel = () => {
    const p = { month, year };
    if (projectFilter) p.project_id = projectFilter;
    const url = hrApi.payrollExcelUrl(p);
    const a = document.createElement('a');
    a.href = url; a.download = `payroll-${MONTHS[month-1]}-${year}.xlsx`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  const downloadBulkPdf = () => {
    const p = { month, year };
    if (projectFilter) p.project_id = projectFilter;
    fetch(hrApi.payrollBulkPdf(p))
      .then(r => r.blob())
      .then(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `payroll-${MONTHS[month-1]}-${year}.pdf`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      })
      .catch(() => showToast('Failed to generate PDF', 'error'));
  };

  const updateInList = (updated) => {
    setPayrolls(prev => prev.map(p => p.id === updated.id ? { ...p, ...updated } : p));
  };

  // Totals
  const totals = payrolls.reduce((acc, p) => ({
    gross: acc.gross + parseFloat(p.gross||0),
    total_deduction: acc.total_deduction + parseFloat(p.total_deduction||0),
    net_salary: acc.net_salary + parseFloat(p.net_salary||0),
    paid: acc.paid + (p.status === 'paid' ? 1 : 0),
  }), { gross: 0, total_deduction: 0, net_salary: 0, paid: 0 });

  const monthName = MONTHS[month - 1];

  return (
    <div className="pr-page">
      {/* Toolbar */}
      <div className="pr-toolbar">
        <div className="pr-toolbar-left">
          <h2 className="pr-title">Payroll</h2>
          <div className="pr-month-selector">
            <button className="pr-nav-btn" onClick={() => {
              if (month === 1) { setMonth(12); setYear(y => y - 1); }
              else setMonth(m => m - 1);
            }}><i className="fa fa-chevron-left" /></button>
            <span className="pr-month-label">{monthName} {year}</span>
            <button className="pr-nav-btn" onClick={() => {
              if (month === 12) { setMonth(1); setYear(y => y + 1); }
              else setMonth(m => m + 1);
            }}><i className="fa fa-chevron-right" /></button>
          </div>
        </div>
        <div className="pr-toolbar-right">
          <select className="pr-filter-sel" value={projectFilter} onChange={e => setProjectFilter(e.target.value)}>
            <option value="">All Projects</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select className="pr-filter-sel" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">All Status</option>
            <option value="draft">Draft</option>
            <option value="paid">Paid</option>
          </select>
          <button className="pr-btn-generate" onClick={generate} disabled={generating}>
            {generating ? <><i className="fa fa-spinner fa-spin" /> Generating…</> : <><i className="fa fa-calculator" /> Generate Payroll</>}
          </button>
          {payrolls.length > 0 && (
            <>
              <button className="pr-btn-export" onClick={downloadExcel} title="Export Excel">
                <i className="fa fa-file-excel" /> Excel
              </button>
              <button className="pr-btn-export" onClick={downloadBulkPdf} title="Export PDF Summary">
                <i className="fa fa-file-pdf" /> PDF
              </button>
            </>
          )}
        </div>
      </div>

      {/* Summary cards */}
      {payrolls.length > 0 && (
        <div className="pr-summary-row">
          <div className="pr-sum-card">
            <div className="pr-sum-label">Total Staff</div>
            <div className="pr-sum-val">{payrolls.length}</div>
            <div className="pr-sum-sub">{totals.paid} paid · {payrolls.length - totals.paid} pending</div>
          </div>
          <div className="pr-sum-card">
            <div className="pr-sum-label">Gross Payable</div>
            <div className="pr-sum-val">₹ {fmt(totals.gross)}</div>
          </div>
          <div className="pr-sum-card">
            <div className="pr-sum-label">Total Deductions</div>
            <div className="pr-sum-val pr-sum-red">₹ {fmt(totals.total_deduction)}</div>
          </div>
          <div className="pr-sum-card pr-sum-card-net">
            <div className="pr-sum-label">Net Salary</div>
            <div className="pr-sum-val pr-sum-green">₹ {fmt(totals.net_salary)}</div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="pr-table-wrap">
        {loading ? (
          <div className="pr-loading"><i className="fa fa-spinner fa-spin" /> Loading…</div>
        ) : payrolls.length === 0 ? (
          <div className="pr-empty">
            <i className="fa fa-calculator" />
            <h3>No payroll for {monthName} {year}</h3>
            <p>Click "Generate Payroll" to calculate salaries from attendance records.</p>
            <button className="pr-btn-generate" onClick={generate} disabled={generating}>
              {generating ? 'Generating…' : 'Generate Payroll'}
            </button>
          </div>
        ) : (
          <table className="pr-table">
            <thead>
              <tr>
                <th>Staff</th>
                <th>Designation</th>
                <th className="ta-r">Paid Days</th>
                <th className="ta-r">Basic</th>
                <th className="ta-r">Gross</th>
                <th className="ta-r">Deductions</th>
                <th className="ta-r">Net Salary</th>
                <th>Status</th>
                <th className="ta-c">Actions</th>
              </tr>
            </thead>
            <tbody>
              {payrolls.map(p => (
                <tr key={p.id} className={p.status === 'paid' ? 'pr-row-paid' : ''}>
                  <td>
                    <div className="pr-staff-cell">
                      {p.photo
                        ? <img className="pr-staff-thumb" src={`/api/uploads/${p.photo}`} alt={p.name} />
                        : <span className="pr-staff-initial">{p.name.charAt(0)}</span>}
                      <div>
                        <div className="pr-staff-name">{p.name}</div>
                        {p.employee_id && <div className="pr-staff-eid">{p.employee_id}</div>}
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="pr-desg">{p.designation || '—'}</div>
                    {p.department && <div className="pr-dept">{p.department}</div>}
                  </td>
                  <td className="ta-r pr-num">{p.paid_days}</td>
                  <td className="ta-r pr-num">₹ {fmt(p.basic)}</td>
                  <td className="ta-r pr-num">₹ {fmt(p.gross)}</td>
                  <td className="ta-r pr-num pr-red">₹ {fmt(p.total_deduction)}</td>
                  <td className="ta-r pr-num pr-bold">₹ {fmt(p.net_salary)}</td>
                  <td>
                    <span className={`pr-status-badge pr-status-${p.status}`}>
                      {p.status === 'paid' ? <><i className="fa fa-circle-check" /> Paid</> : <><i className="fa fa-clock" /> Draft</>}
                    </span>
                  </td>
                  <td className="ta-c">
                    <div className="pr-actions">
                      <button className="pr-action-btn" title="View / Edit Details" onClick={() => setSelected(p)}>
                        <i className="fa fa-eye" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="pr-tfoot">
                <td colSpan={4} className="ta-r pr-foot-label">TOTAL</td>
                <td className="ta-r pr-num">₹ {fmt(totals.gross)}</td>
                <td className="ta-r pr-num pr-red">₹ {fmt(totals.total_deduction)}</td>
                <td className="ta-r pr-num pr-bold">₹ {fmt(totals.net_salary)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {/* Detail modal */}
      {selected && (
        <PayDetailModal
          payroll={selected}
          projects={projects}
          showToast={showToast}
          onClose={() => setSelected(null)}
          onPay={(updated) => { updateInList(updated); }}
          onUpdate={(updated) => { updateInList(updated); setSelected(updated); }}
        />
      )}
    </div>
  );
}
