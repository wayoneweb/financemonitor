import React, { useState, useEffect, useContext, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { invoicesApi, projectsApi } from '../api';
import { ToastContext } from '../App';
import './Invoices.css';

const STATUS_META = {
  draft:     { label:'Draft',     cls:'inv-st-draft',     icon:'fa-pencil'       },
  sent:      { label:'Sent',      cls:'inv-st-sent',      icon:'fa-paper-plane'  },
  accepted:  { label:'Accepted',  cls:'inv-st-accepted',  icon:'fa-circle-check' },
  paid:      { label:'Paid',      cls:'inv-st-paid',      icon:'fa-check-double' },
  cancelled: { label:'Cancelled', cls:'inv-st-cancelled', icon:'fa-ban'          },
  overdue:   { label:'Overdue',   cls:'inv-st-overdue',   icon:'fa-clock'        },
};

const TABS = [
  { key:'',          label:'All' },
  { key:'invoice',   label:'Invoices' },
  { key:'quotation', label:'Quotations' },
  { key:'draft',     label:'Draft',    isStatus:true },
  { key:'sent',      label:'Sent',     isStatus:true },
  { key:'paid',      label:'Paid',     isStatus:true },
];

const fmt = (n) => 'Rs. ' + Number(n||0).toLocaleString('en-IN', { minimumFractionDigits:2, maximumFractionDigits:2 });
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : '—';

export default function Invoices() {
  const showToast = useContext(ToastContext);
  const navigate  = useNavigate();

  const [rows,      setRows]      = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [tab,       setTab]       = useState('');
  const [search,    setSearch]    = useState('');
  const [payModal,  setPayModal]  = useState(null);  // invoice obj for payment
  const [compModal, setCompModal] = useState(false); // company profile manager
  const [companies, setCompanies] = useState([]);
  const [editComp,  setEditComp]  = useState(null);
  const [compForm,  setCompForm]  = useState({});
  const [compFile,  setCompFile]  = useState(null);
  const [saving,    setSaving]    = useState(false);
  const [payForm,   setPayForm]   = useState({ payment_mode:'bank_transfer', payment_date:'', payment_ref:'', amount_paid:'', notes:'' });
  const [delConfirm, setDelConfirm] = useState(null);
  const [projects,  setProjects]  = useState([]);

  const load = useCallback(() => {
    setLoading(true);
    const params = {};
    if (tab && !TABS.find(t=>t.key===tab)?.isStatus) params.type = tab;
    if (tab && TABS.find(t=>t.key===tab)?.isStatus) params.status = tab;
    if (search) params.search = search;
    invoicesApi.list(params).then(setRows).finally(() => setLoading(false));
  }, [tab, search]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    invoicesApi.companies().then(setCompanies);
    projectsApi.list().done(setProjects).fail(() => {});
  }, []);

  // ── Stats ──────────────────────────────────────────────────────
  const stats = {
    total:     rows.length,
    invoices:  rows.filter(r => r.doc_type === 'invoice').length,
    quotations:rows.filter(r => r.doc_type === 'quotation').length,
    paid:      rows.filter(r => r.status === 'paid').length,
    outstanding: rows.filter(r => r.status === 'sent' || r.status === 'overdue').reduce((s,r) => s+r.balance_due, 0),
  };

  // ── PDF (fetch→blob to bypass CRA proxy Accept-header limitation) ──
  const openPdf = useCallback((inv) => {
    fetch(invoicesApi.pdfUrl(inv.id))
      .then(r => { if (!r.ok) throw new Error(); return r.blob(); })
      .then(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.target = '_blank'; a.rel = 'noreferrer';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      })
      .catch(() => showToast('Failed to generate PDF', 'error'));
  }, [showToast]);

  // ── Delete ─────────────────────────────────────────────────────
  const handleDelete = (inv) => {
    invoicesApi.remove(inv.id).then(() => {
      showToast('Deleted successfully');
      setDelConfirm(null);
      load();
    }).catch(() => showToast('Delete failed', 'error'));
  };

  // ── Payment modal ──────────────────────────────────────────────
  const openPay = (inv) => {
    setPayForm({
      payment_mode: inv.payment_mode || 'bank_transfer',
      payment_date: new Date().toISOString().slice(0,10),
      payment_ref:  inv.payment_ref  || '',
      amount_paid:  inv.balance_due  || inv.total || '',
      notes: '',
    });
    setPayModal(inv);
  };

  const submitPay = () => {
    if (!payModal) return;
    setSaving(true);
    invoicesApi.pay(payModal.id, payForm)
      .then(() => {
        showToast(payForm.amount_paid >= payModal.total ? 'Marked as paid!' : 'Partial payment recorded');
        setPayModal(null);
        load();
      })
      .catch(() => showToast('Failed to record payment', 'error'))
      .finally(() => setSaving(false));
  };

  // ── Company profiles ────────────────────────────────────────────
  const openCompNew  = () => { setCompForm({ country:'India', is_default:false }); setCompFile(null); setEditComp(null); };
  const openCompEdit = (c)  => { setCompForm({...c}); setCompFile(null); setEditComp(c); };

  const submitComp = () => {
    const fd = new FormData();
    Object.entries(compForm).forEach(([k,v]) => fd.append(k, v??''));
    if (compFile) fd.append('logo', compFile);
    setSaving(true);
    const call = editComp
      ? invoicesApi.updateCompany(editComp.id, fd)
      : invoicesApi.createCompany(fd);
    call.then(() => {
      showToast(editComp ? 'Company updated' : 'Company created');
      setEditComp(null);
      setCompForm({});
      invoicesApi.companies().then(setCompanies);
    }).catch(() => showToast('Save failed', 'error')).finally(() => setSaving(false));
  };

  const deleteComp = (c) => {
    if (!window.confirm(`Delete "${c.name}"?`)) return;
    invoicesApi.deleteCompany(c.id).then(() => {
      showToast('Deleted');
      invoicesApi.companies().then(setCompanies);
    });
  };

  // ── Project name helper ────────────────────────────────────────
  const projName = (id) => projects.find(p => p.id === id)?.name || '';

  return (
    <div className="inv-page">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="inv-header">
        <div>
          <h2 className="inv-title">Invoices &amp; Quotations</h2>
          <p className="inv-sub">Create, manage and track all documents</p>
        </div>
        <div className="inv-header-btns">
          <button className="inv-btn-ghost" onClick={() => setCompModal(true)}>
            <i className="fa fa-building"/> Company Profiles
          </button>
          <button className="inv-btn-quo" onClick={() => navigate('/invoices/new?type=quotation')}>
            <i className="fa fa-file-contract"/> New Quotation
          </button>
          <button className="inv-btn-inv" onClick={() => navigate('/invoices/new?type=invoice')}>
            <i className="fa fa-file-invoice"/> New Invoice
          </button>
        </div>
      </div>

      {/* ── Stats ──────────────────────────────────────────────── */}
      <div className="inv-stats">
        <div className="inv-stat-card"><span className="inv-stat-num">{stats.total}</span><span className="inv-stat-label">Total Documents</span></div>
        <div className="inv-stat-card"><span className="inv-stat-num">{stats.invoices}</span><span className="inv-stat-label">Invoices</span></div>
        <div className="inv-stat-card"><span className="inv-stat-num">{stats.quotations}</span><span className="inv-stat-label">Quotations</span></div>
        <div className="inv-stat-card inv-stat-paid"><span className="inv-stat-num">{stats.paid}</span><span className="inv-stat-label">Paid</span></div>
        <div className="inv-stat-card inv-stat-out"><span className="inv-stat-num">{fmt(stats.outstanding)}</span><span className="inv-stat-label">Outstanding</span></div>
      </div>

      {/* ── Filters ────────────────────────────────────────────── */}
      <div className="inv-filters">
        <div className="inv-tabs">
          {TABS.map(t => (
            <button key={t.key} className={`inv-tab${tab===t.key?' inv-tab-active':''}`} onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="inv-search-wrap">
          <i className="fa fa-magnifying-glass inv-search-icon"/>
          <input className="inv-search" placeholder="Search by client, number…" value={search} onChange={e=>setSearch(e.target.value)}/>
          {search && <button className="inv-search-clear" onClick={()=>setSearch('')}><i className="fa fa-xmark"/></button>}
        </div>
      </div>

      {/* ── Table ──────────────────────────────────────────────── */}
      {loading ? (
        <div className="inv-loading"><i className="fa fa-spinner fa-spin"/> Loading…</div>
      ) : rows.length === 0 ? (
        <div className="inv-empty">
          <i className="fa fa-file-invoice inv-empty-icon"/>
          <p>No documents found</p>
          <button className="inv-btn-inv" onClick={()=>navigate('/invoices/new?type=invoice')}>Create First Invoice</button>
        </div>
      ) : (
        <div className="inv-table-wrap">
          <table className="inv-table">
            <thead>
              <tr>
                <th>Number</th>
                <th>Type</th>
                <th>Client</th>
                <th>Date</th>
                <th>Due / Valid</th>
                <th>Amount</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(inv => {
                const sm = STATUS_META[inv.status] || STATUS_META.draft;
                return (
                  <tr key={inv.id} className="inv-row">
                    <td>
                      <div className="inv-num">{inv.inv_number}</div>
                      {inv.is_project_inv ? <div className="inv-proj-tag"><i className="fa fa-folder"/> {projName(inv.project_id)||'Project'}</div> : null}
                    </td>
                    <td>
                      <span className={`inv-type-badge inv-type-${inv.doc_type}`}>
                        <i className={`fa ${inv.doc_type==='invoice'?'fa-file-invoice':'fa-file-contract'}`}/> {inv.doc_type==='invoice'?'Invoice':'Quotation'}
                      </span>
                    </td>
                    <td>
                      <div className="inv-client">{inv.to_name || '—'}</div>
                      {inv.to_email && <div className="inv-client-sub">{inv.to_email}</div>}
                    </td>
                    <td className="inv-date">{fmtDate(inv.date)}</td>
                    <td className="inv-date">{fmtDate(inv.doc_type==='quotation'?inv.valid_until:inv.due_date)}</td>
                    <td>
                      <div className="inv-amount">{fmt(inv.total)}</div>
                      {inv.balance_due > 0 && inv.status !== 'draft' && (
                        <div className="inv-balance">Due: {fmt(inv.balance_due)}</div>
                      )}
                    </td>
                    <td>
                      <span className={`inv-status ${sm.cls}`}>
                        <i className={`fa ${sm.icon}`}/> {sm.label}
                      </span>
                    </td>
                    <td>
                      <div className="inv-actions">
                        <button className="inv-act-btn" title="View PDF" onClick={() => openPdf(inv)}>
                          <i className="fa fa-file-pdf"/>
                        </button>
                        <button className="inv-act-btn" title="Edit" onClick={()=>navigate(`/invoices/${inv.id}`)}>
                          <i className="fa fa-pen"/>
                        </button>
                        {inv.status !== 'paid' && (
                          <button className="inv-act-btn inv-act-pay" title="Record Payment" onClick={()=>openPay(inv)}>
                            <i className="fa fa-money-bill-wave"/>
                          </button>
                        )}
                        {inv.txn_created ? <span className="inv-txn-badge" title="Transaction created in project accounts"><i className="fa fa-link"/></span> : null}
                        <button className="inv-act-btn inv-act-del" title="Delete" onClick={()=>setDelConfirm(inv)}>
                          <i className="fa fa-trash"/>
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

      {/* ── Delete Confirm ─────────────────────────────────────── */}
      {delConfirm && (
        <div className="inv-modal-overlay" onClick={e=>e.target===e.currentTarget&&setDelConfirm(null)}>
          <div className="inv-modal-box inv-del-box">
            <div className="inv-modal-icon inv-del-icon"><i className="fa fa-trash"/></div>
            <h3>Delete {delConfirm.doc_type === 'quotation' ? 'Quotation' : 'Invoice'}?</h3>
            <p>#{delConfirm.inv_number} for <strong>{delConfirm.to_name||'—'}</strong> will be permanently deleted.</p>
            <div className="inv-modal-btns">
              <button className="inv-btn-ghost" onClick={()=>setDelConfirm(null)}>Cancel</button>
              <button className="inv-btn-danger" onClick={()=>handleDelete(delConfirm)}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Payment Modal ──────────────────────────────────────── */}
      {payModal && (
        <div className="inv-modal-overlay" onClick={e=>e.target===e.currentTarget&&setPayModal(null)}>
          <div className="inv-modal-box">
            <div className="inv-modal-header">
              <div className="inv-modal-icon inv-pay-icon"><i className="fa fa-money-bill-wave"/></div>
              <div>
                <div className="inv-modal-title">Record Payment</div>
                <div className="inv-modal-sub">#{payModal.inv_number} — {payModal.to_name}</div>
              </div>
              <button className="inv-modal-close" onClick={()=>setPayModal(null)}><i className="fa fa-xmark"/></button>
            </div>
            <div className="inv-modal-body">
              <div className="inv-pay-total">Total: <strong>{fmt(payModal.total)}</strong> &nbsp;|&nbsp; Balance: <strong className="inv-pay-bal">{fmt(payModal.balance_due||payModal.total)}</strong></div>
              <div className="inv-form-row">
                <div className="inv-field"><label>Amount Paid</label>
                  <input type="number" min="0" step="0.01" value={payForm.amount_paid} onChange={e=>setPayForm(f=>({...f,amount_paid:e.target.value}))} placeholder="0.00"/></div>
                <div className="inv-field"><label>Payment Date</label>
                  <input type="date" value={payForm.payment_date} onChange={e=>setPayForm(f=>({...f,payment_date:e.target.value}))}/></div>
              </div>
              <div className="inv-field"><label>Payment Method</label>
                <select value={payForm.payment_mode} onChange={e=>setPayForm(f=>({...f,payment_mode:e.target.value}))}>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="cash">Cash</option>
                  <option value="cheque">Cheque</option>
                  <option value="upi">UPI</option>
                  <option value="card">Card</option>
                  <option value="online">Online</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="inv-field"><label>Reference / UTR</label>
                <input value={payForm.payment_ref} onChange={e=>setPayForm(f=>({...f,payment_ref:e.target.value}))} placeholder="Transaction ID or cheque number"/></div>
              <div className="inv-field"><label>Notes</label>
                <textarea rows={2} value={payForm.notes} onChange={e=>setPayForm(f=>({...f,notes:e.target.value}))} placeholder="Remarks…"/></div>
              {payModal.is_project_inv ? (
                <div className="inv-pay-notice"><i className="fa fa-circle-info"/> Payment will automatically create an income transaction in the project accounts.</div>
              ) : null}
            </div>
            <div className="inv-modal-footer">
              <button className="inv-btn-ghost" onClick={()=>setPayModal(null)} disabled={saving}>Cancel</button>
              <button className="inv-btn-inv" onClick={submitPay} disabled={saving}>
                {saving ? <><i className="fa fa-spinner fa-spin"/> Saving…</> : <><i className="fa fa-check"/> Record Payment</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Company Profiles Modal ─────────────────────────────── */}
      {compModal && (
        <div className="inv-modal-overlay" onClick={e=>e.target===e.currentTarget&&(!editComp&&setCompModal(false))}>
          <div className="inv-modal-box inv-comp-modal">
            <div className="inv-modal-header">
              <div className="inv-modal-icon" style={{background:'#eff6ff',color:'#2563eb'}}><i className="fa fa-building"/></div>
              <div>
                <div className="inv-modal-title">{editComp ? 'Edit Company Profile' : 'Company Profiles'}</div>
                <div className="inv-modal-sub">Used as sender info on invoices</div>
              </div>
              <button className="inv-modal-close" onClick={()=>{setCompModal(false);setEditComp(null);setCompForm({});}}><i className="fa fa-xmark"/></button>
            </div>

            {!editComp ? (
              <div className="inv-modal-body">
                {companies.length === 0 ? (
                  <div className="inv-comp-empty"><i className="fa fa-building inv-empty-icon"/><p>No company profiles yet</p></div>
                ) : (
                  companies.map(c => (
                    <div key={c.id} className="inv-comp-item">
                      {c.logo && <img src={`/api/uploads/${c.logo}`} alt="" className="inv-comp-logo"/>}
                      <div className="inv-comp-info">
                        <div className="inv-comp-name">{c.name} {c.is_default?<span className="inv-default-badge">Default</span>:null}</div>
                        <div className="inv-comp-detail">{[c.city,c.state].filter(Boolean).join(', ')} · {c.phone} · {c.gstin&&`GSTIN: ${c.gstin}`}</div>
                      </div>
                      <button className="inv-act-btn" onClick={()=>openCompEdit(c)}><i className="fa fa-pen"/></button>
                      <button className="inv-act-btn inv-act-del" onClick={()=>deleteComp(c)}><i className="fa fa-trash"/></button>
                    </div>
                  ))
                )}
                <button className="inv-btn-inv inv-comp-add" onClick={openCompNew}>
                  <i className="fa fa-plus"/> Add Company Profile
                </button>
              </div>
            ) : (
              <div className="inv-modal-body">
                <div className="inv-form-grid">
                  <div className="inv-field inv-span2"><label>Company Name *</label>
                    <input value={compForm.name||''} onChange={e=>setCompForm(f=>({...f,name:e.target.value}))} placeholder="Your Company Ltd."/></div>
                  <div className="inv-field"><label>Phone</label>
                    <input value={compForm.phone||''} onChange={e=>setCompForm(f=>({...f,phone:e.target.value}))} placeholder="+91 9000000000"/></div>
                  <div className="inv-field"><label>Email</label>
                    <input value={compForm.email||''} onChange={e=>setCompForm(f=>({...f,email:e.target.value}))} placeholder="info@company.com"/></div>
                  <div className="inv-field inv-span2"><label>Address</label>
                    <input value={compForm.address||''} onChange={e=>setCompForm(f=>({...f,address:e.target.value}))} placeholder="Street address"/></div>
                  <div className="inv-field"><label>City</label>
                    <input value={compForm.city||''} onChange={e=>setCompForm(f=>({...f,city:e.target.value}))}/></div>
                  <div className="inv-field"><label>State</label>
                    <input value={compForm.state||''} onChange={e=>setCompForm(f=>({...f,state:e.target.value}))}/></div>
                  <div className="inv-field"><label>PIN Code</label>
                    <input value={compForm.pincode||''} onChange={e=>setCompForm(f=>({...f,pincode:e.target.value}))}/></div>
                  <div className="inv-field"><label>GSTIN</label>
                    <input value={compForm.gstin||''} onChange={e=>setCompForm(f=>({...f,gstin:e.target.value}))} placeholder="22AAAAA0000A1Z5"/></div>
                  <div className="inv-field"><label>PAN</label>
                    <input value={compForm.pan||''} onChange={e=>setCompForm(f=>({...f,pan:e.target.value}))}/></div>
                  <div className="inv-field"><label>Website</label>
                    <input value={compForm.website||''} onChange={e=>setCompForm(f=>({...f,website:e.target.value}))}/></div>
                  <div className="inv-field"><label>Bank Name</label>
                    <input value={compForm.bank_name||''} onChange={e=>setCompForm(f=>({...f,bank_name:e.target.value}))}/></div>
                  <div className="inv-field"><label>Account No.</label>
                    <input value={compForm.bank_ac||''} onChange={e=>setCompForm(f=>({...f,bank_ac:e.target.value}))}/></div>
                  <div className="inv-field"><label>IFSC Code</label>
                    <input value={compForm.bank_ifsc||''} onChange={e=>setCompForm(f=>({...f,bank_ifsc:e.target.value}))}/></div>
                  <div className="inv-field"><label>Branch</label>
                    <input value={compForm.bank_branch||''} onChange={e=>setCompForm(f=>({...f,bank_branch:e.target.value}))}/></div>
                  <div className="inv-field inv-span2"><label>Company Logo (max 5MB)</label>
                    <input type="file" accept="image/*" onChange={e=>setCompFile(e.target.files[0]||null)}/>
                    {editComp && editComp.logo && !compFile && (
                      <div className="inv-logo-preview"><img src={`/api/uploads/${editComp.logo}`} alt="logo" style={{height:40}}/></div>
                    )}
                  </div>
                  <div className="inv-field inv-span2">
                    <label className="inv-check-label">
                      <input type="checkbox" checked={!!compForm.is_default} onChange={e=>setCompForm(f=>({...f,is_default:e.target.checked}))}/>
                      Set as default company (auto-selected on new invoices)
                    </label>
                  </div>
                </div>
              </div>
            )}

            {editComp && (
              <div className="inv-modal-footer">
                <button className="inv-btn-ghost" onClick={()=>{setEditComp(null);setCompForm({});}} disabled={saving}>Back</button>
                <button className="inv-btn-inv" onClick={submitComp} disabled={saving}>
                  {saving ? <><i className="fa fa-spinner fa-spin"/> Saving…</> : <><i className="fa fa-check"/> Save Company</>}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
