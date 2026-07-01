import React, { useState, useEffect, useContext, useCallback } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { invoicesApi, projectsApi } from '../api';
import { ToastContext } from '../App';
import './InvoiceEditor.css';

const today  = () => new Date().toISOString().slice(0, 10);
const addDays = (d, n) => { const dt = new Date(d); dt.setDate(dt.getDate()+n); return dt.toISOString().slice(0,10); };
const fmtNum  = (n) => Number(n||0).toLocaleString('en-IN', { minimumFractionDigits:2, maximumFractionDigits:2 });

const EMPTY_ITEM = () => ({ description:'', details:'', hsn_sac:'', qty:1, unit:'pcs', rate:'', tax_rate:0, amount:0 });

const EMPTY_FORM = (type) => ({
  doc_type: type || 'invoice',
  template: 'modern-blue',
  inv_number: '',
  status: 'draft',
  date: today(),
  due_date: addDays(today(), 30),
  valid_until: addDays(today(), 30),
  po_number: '',
  currency: 'INR',
  from_name:'', from_address:'', from_city:'', from_state:'', from_pincode:'',
  from_phone:'', from_email:'', from_gstin:'', from_logo:'',
  from_bank_name:'', from_bank_ac:'', from_bank_ifsc:'', from_bank_branch:'',
  to_name:'', to_address:'', to_city:'', to_state:'', to_pincode:'',
  to_phone:'', to_email:'', to_gstin:'',
  tax_label:'GST', tax_rate:'18', tax_amount:'', discount:'0', shipping:'0',
  notes:'', terms:'Net 30 days. Payment is due within 30 days of invoice date.',
  is_project_inv: false, project_id:'', company_id:'',
  payment_mode:'', payment_date:'', payment_ref:'', txn_created: 0,
});

const UNITS = ['pcs','hrs','days','kg','gm','lt','ml','m','ft','sqft','sqm','set','lot','nos','job'];

// Template swatch colors (mirrors server TEMPLATES config)
const TEMPLATE_SWATCHES = [
  { id:'modern-blue',    name:'Modern Blue',    hBg:'#1e3a8a', accent:'#3b82f6', layout:'A' },
  { id:'classic-gray',   name:'Classic Gray',   hBg:'#374151', accent:'#6b7280', layout:'A' },
  { id:'emerald-green',  name:'Emerald Green',  hBg:'#064e3b', accent:'#10b981', layout:'A' },
  { id:'coral-orange',   name:'Coral Orange',   hBg:'#7c2d12', accent:'#ea580c', layout:'A' },
  { id:'deep-purple',    name:'Deep Purple',    hBg:'#4c1d95', accent:'#8b5cf6', layout:'A' },
  { id:'teal-ocean',     name:'Teal Ocean',     hBg:'#0f766e', accent:'#14b8a6', layout:'A' },
  { id:'rose-pink',      name:'Rose Pink',      hBg:'#9f1239', accent:'#f43f5e', layout:'A' },
  { id:'forest-deep',    name:'Forest Deep',    hBg:'#14532d', accent:'#22c55e', layout:'A' },
  { id:'minimal-clean',  name:'Minimal Clean',  hBg:'#f1f5f9', accent:'#3b82f6', layout:'B' },
  { id:'amber-warm',     name:'Amber Warm',     hBg:'#fef3c7', accent:'#d97706', layout:'B' },
  { id:'monochrome',     name:'Monochrome',     hBg:'#000000', accent:'#171717', layout:'B' },
  { id:'corporate-red',  name:'Corporate Red',  hBg:'#ffffff', accent:'#dc2626', layout:'B' },
  { id:'dark-executive', name:'Dark Executive', hBg:'#0f172a', accent:'#38bdf8', layout:'C' },
  { id:'gold-luxury',    name:'Gold Luxury',    hBg:'#1c1917', accent:'#f59e0b', layout:'C' },
  { id:'midnight-navy',  name:'Midnight Navy',  hBg:'#0f0f23', accent:'#818cf8', layout:'C' },
];

export default function InvoiceEditor() {
  const showToast   = useContext(ToastContext);
  const navigate    = useNavigate();
  const { id }      = useParams();
  const [sp]        = useSearchParams();
  const typeParam   = sp.get('type') || 'invoice';
  const isEdit      = !!id;

  const [form,      setForm]      = useState(EMPTY_FORM(typeParam));
  const [items,     setItems]     = useState([EMPTY_ITEM()]);
  const [companies, setCompanies] = useState([]);
  const [projects,  setProjects]  = useState([]);
  const [saving,    setSaving]    = useState(false);
  const [loading,   setLoading]   = useState(isEdit);
  const [showFrom,  setShowFrom]  = useState(true);

  // Load data
  useEffect(() => {
    invoicesApi.companies().then(setCompanies);
    projectsApi.list().done(setProjects).fail(() => {});
  }, []);

  useEffect(() => {
    if (!isEdit) {
      // Auto-assign next number
      invoicesApi.nextNumber(typeParam).then(data => setForm(f => ({ ...f, inv_number: data.number })));
      return;
    }
    setLoading(true);
    invoicesApi.get(id).then(data => {
      const { items: its, ...inv } = data;
      setForm({ ...EMPTY_FORM(), ...inv, is_project_inv: !!inv.is_project_inv });
      setItems(its && its.length > 0 ? its : [EMPTY_ITEM()]);
    }).finally(() => setLoading(false));
  }, [id, isEdit, typeParam]);

  // Auto-fill from selected company profile
  const applyCompany = useCallback((compId, formSetter) => {
    if (!compId) return;
    const c = companies.find(x => x.id === parseInt(compId));
    if (!c) return;
    formSetter(f => ({
      ...f, company_id: compId,
      from_name: c.name, from_address: c.address, from_city: c.city,
      from_state: c.state, from_pincode: c.pincode, from_phone: c.phone,
      from_email: c.email, from_gstin: c.gstin, from_logo: c.logo,
      from_bank_name: c.bank_name, from_bank_ac: c.bank_ac,
      from_bank_ifsc: c.bank_ifsc, from_bank_branch: c.bank_branch,
    }));
  }, [companies]);

  // Auto-select default company on new invoice
  useEffect(() => {
    if (isEdit || companies.length === 0) return;
    const def = companies.find(c => c.is_default) || companies[0];
    if (def) applyCompany(def.id, setForm);
  }, [companies, isEdit, applyCompany]);

  // Auto-fill from project
  const applyProject = useCallback((projId) => {
    const p = projects.find(x => x.id === parseInt(projId));
    if (!p) return;
    setForm(f => ({
      ...f, project_id: projId,
      to_name: p.client || '',
      to_address: p.client_address || '',
      to_email:   p.client_email   || '',
      to_phone:   p.client_phone   || '',
      to_gstin:   p.client_gstin   || '',
    }));
    // Also load company for this project if set
    if (p.company_id) applyCompany(p.company_id, setForm);
  }, [projects, applyCompany]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // ── Items management ───────────────────────────────────────────
  const setItem = (idx, k, v) => {
    setItems(its => {
      const arr = [...its];
      arr[idx] = { ...arr[idx], [k]: v };
      // Auto-calc amount
      if (k === 'qty' || k === 'rate') {
        const qty  = parseFloat(k==='qty' ? v : arr[idx].qty) || 0;
        const rate = parseFloat(k==='rate' ? v : arr[idx].rate) || 0;
        arr[idx].amount = qty * rate;
      }
      return arr;
    });
  };
  const addItem    = ()    => setItems(its => [...its, EMPTY_ITEM()]);
  const removeItem = (idx) => setItems(its => its.length > 1 ? its.filter((_,i)=>i!==idx) : its);

  // ── Computed totals ────────────────────────────────────────────
  const subtotal = items.reduce((s, it) => s + (parseFloat(it.amount)||0), 0);
  const taxRate  = parseFloat(form.tax_rate) || 0;
  const taxAmt   = subtotal * taxRate / 100;
  const disc     = parseFloat(form.discount) || 0;
  const shipping = parseFloat(form.shipping) || 0;
  const total    = subtotal + taxAmt - disc + shipping;

  // ── PDF helper (fetch→blob to bypass CRA proxy limitation) ───
  const openPdf = useCallback((invId, invNum) => {
    fetch(invoicesApi.pdfUrl(invId))
      .then(r => { if (!r.ok) throw new Error('PDF error'); return r.blob(); })
      .then(blob => {
        const url = URL.createObjectURL(blob);
        const a   = document.createElement('a');
        a.href    = url;
        a.target  = '_blank';
        a.rel     = 'noreferrer';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      })
      .catch(() => showToast('Failed to generate PDF', 'error'));
  }, [showToast]);

  // ── Save ───────────────────────────────────────────────────────
  const save = (asPdf = false, status) => {
    const payload = {
      ...form,
      status: status || form.status,
      subtotal, tax_amount: taxAmt, total,
      amount_paid: form.amount_paid || 0,
      items: items.map(it => ({
        ...it,
        qty: parseFloat(it.qty)||1,
        rate: parseFloat(it.rate)||0,
        amount: parseFloat(it.amount)||(parseFloat(it.qty||1)*parseFloat(it.rate||0)),
      })),
    };
    setSaving(true);
    const call = isEdit ? invoicesApi.update(id, payload) : invoicesApi.create(payload);
    call.then(saved => {
      showToast(isEdit ? 'Invoice updated!' : 'Invoice saved!');
      navigate('/invoices');
      if (asPdf) openPdf(saved.id, saved.inv_number);
    }).catch(e => {
      showToast(e?.error || 'Failed to save', 'error');
      setSaving(false);
    });
  };

  if (loading) return <div className="ied-loading"><i className="fa fa-spinner fa-spin"/> Loading…</div>;

  const isQ = form.doc_type === 'quotation';

  return (
    <div className="ied-page">
      {/* ── Page header ────────────────────────────────────────── */}
      <div className="ied-header">
        <div className="ied-header-left">
          <button className="ied-back" onClick={() => navigate('/invoices')}><i className="fa fa-arrow-left"/></button>
          <div>
            <h2 className="ied-title">{isEdit ? 'Edit' : 'New'} {isQ ? 'Quotation' : 'Invoice'}</h2>
            <p className="ied-sub">{isEdit ? `Editing #${form.inv_number}` : 'Fill in the details below'}</p>
          </div>
        </div>
        <div className="ied-header-btns">
          <button className="ied-btn-ghost" onClick={() => navigate('/invoices')}>Cancel</button>
          <button className="ied-btn-draft" onClick={() => save(false,'draft')} disabled={saving}>
            <i className="fa fa-floppy-disk"/> Save Draft
          </button>
          <button className="ied-btn-save" onClick={() => save(false)} disabled={saving}>
            {saving ? <><i className="fa fa-spinner fa-spin"/> Saving…</> : <><i className="fa fa-check"/> Save</>}
          </button>
          <button className="ied-btn-pdf" onClick={() => save(true)} disabled={saving}>
            <i className="fa fa-file-pdf"/> Save &amp; PDF
          </button>
        </div>
      </div>

      <div className="ied-body">
        {/* ── Left column ────────────────────────────────────────── */}
        <div className="ied-main">

          {/* Document type + Info */}
          <div className="ied-card">
            <div className="ied-card-head">
              <div className="ied-doc-type-toggle">
                <button type="button" className={`ied-type-btn${form.doc_type==='invoice'?' ied-type-on-inv':''}`}
                  onClick={() => { set('doc_type','invoice'); if (!isEdit) invoicesApi.nextNumber('invoice').then(d=>set('inv_number',d.number)); }}>
                  <i className="fa fa-file-invoice"/> Invoice
                </button>
                <button type="button" className={`ied-type-btn${form.doc_type==='quotation'?' ied-type-on-quo':''}`}
                  onClick={() => { set('doc_type','quotation'); if (!isEdit) invoicesApi.nextNumber('quotation').then(d=>set('inv_number',d.number)); }}>
                  <i className="fa fa-file-contract"/> Quotation
                </button>
              </div>
              <div className="ied-status-sel">
                <label>Status</label>
                <select value={form.status} onChange={e=>set('status',e.target.value)}>
                  <option value="draft">Draft</option>
                  <option value="sent">Sent</option>
                  <option value="accepted">Accepted</option>
                  <option value="paid">Paid</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
            </div>
            <div className="ied-grid-4">
              <div className="ied-field">
                <label>{isQ ? 'Quotation No.' : 'Invoice No.'}</label>
                <input value={form.inv_number} onChange={e=>set('inv_number',e.target.value)}/>
              </div>
              <div className="ied-field">
                <label>Date</label>
                <input type="date" value={form.date} onChange={e=>set('date',e.target.value)}/>
              </div>
              <div className="ied-field">
                <label>{isQ ? 'Valid Until' : 'Due Date'}</label>
                <input type="date" value={isQ ? form.valid_until : form.due_date}
                  onChange={e=>set(isQ?'valid_until':'due_date', e.target.value)}/>
              </div>
              <div className="ied-field">
                <label>{isQ ? 'PO Reference' : 'Reference No.'}</label>
                <input value={form.po_number} onChange={e=>set('po_number',e.target.value)} placeholder="Optional"/>
              </div>
              <div className="ied-field">
                <label>Currency</label>
                <select value={form.currency} onChange={e=>set('currency',e.target.value)}>
                  <option value="INR">INR — Indian Rupee</option>
                  <option value="USD">USD — US Dollar</option>
                  <option value="EUR">EUR — Euro</option>
                  <option value="GBP">GBP — British Pound</option>
                </select>
              </div>
            </div>
          </div>

          {/* FROM section */}
          <div className="ied-card">
            <div className="ied-card-head ied-sec-head" onClick={() => setShowFrom(s=>!s)}>
              <div className="ied-sec-title"><i className="fa fa-building"/> From (Your Company)</div>
              <i className={`fa fa-chevron-${showFrom?'up':'down'} ied-toggle-icon`}/>
            </div>
            {showFrom && (
              <>
                {companies.length > 0 && (
                  <div className="ied-comp-select">
                    <label>Company Profile</label>
                    <select value={form.company_id||''} onChange={e=>applyCompany(e.target.value, setForm)}>
                      <option value="">— Select profile to auto-fill —</option>
                      {companies.map(c => <option key={c.id} value={c.id}>{c.name}{c.is_default?' (Default)':''}</option>)}
                    </select>
                    {form.company_id && <p className="ied-autofill-note"><i className="fa fa-circle-info"/> Fields auto-filled from company profile. Edit below to customise for this document.</p>}
                  </div>
                )}
                <div className="ied-grid-2">
                  <div className="ied-field ied-span2"><label>Company Name</label><input value={form.from_name} onChange={e=>set('from_name',e.target.value)} placeholder="Your Company Ltd."/></div>
                  <div className="ied-field"><label>Phone</label><input value={form.from_phone} onChange={e=>set('from_phone',e.target.value)} placeholder="+91 9000000000"/></div>
                  <div className="ied-field"><label>Email</label><input value={form.from_email} onChange={e=>set('from_email',e.target.value)} placeholder="info@company.com"/></div>
                  <div className="ied-field ied-span2"><label>Address</label><input value={form.from_address} onChange={e=>set('from_address',e.target.value)} placeholder="Street address"/></div>
                  <div className="ied-field"><label>City</label><input value={form.from_city} onChange={e=>set('from_city',e.target.value)}/></div>
                  <div className="ied-field"><label>State</label><input value={form.from_state} onChange={e=>set('from_state',e.target.value)}/></div>
                  <div className="ied-field"><label>PIN Code</label><input value={form.from_pincode} onChange={e=>set('from_pincode',e.target.value)}/></div>
                  <div className="ied-field"><label>GSTIN</label><input value={form.from_gstin} onChange={e=>set('from_gstin',e.target.value)} placeholder="22AAAAA0000A1Z5"/></div>
                </div>
                <div className="ied-bank-section">
                  <div className="ied-bank-title">Bank Details (printed on PDF)</div>
                  <div className="ied-grid-2">
                    <div className="ied-field"><label>Bank Name</label><input value={form.from_bank_name} onChange={e=>set('from_bank_name',e.target.value)}/></div>
                    <div className="ied-field"><label>Account No.</label><input value={form.from_bank_ac} onChange={e=>set('from_bank_ac',e.target.value)}/></div>
                    <div className="ied-field"><label>IFSC Code</label><input value={form.from_bank_ifsc} onChange={e=>set('from_bank_ifsc',e.target.value)}/></div>
                    <div className="ied-field"><label>Branch</label><input value={form.from_bank_branch} onChange={e=>set('from_bank_branch',e.target.value)}/></div>
                  </div>
                </div>
                {form.from_logo && (
                  <div className="ied-logo-preview">
                    <span>Logo:</span>
                    <img src={`/api/uploads/${form.from_logo}`} alt="logo"/>
                    <button type="button" className="ied-logo-rm" onClick={()=>set('from_logo','')}>
                      <i className="fa fa-xmark"/> Remove
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* TO section */}
          <div className="ied-card">
            <div className="ied-card-head">
              <div className="ied-sec-title"><i className="fa fa-user"/> Bill To (Client)</div>
            </div>
            <div className="ied-grid-2">
              <div className="ied-field ied-span2"><label>Client / Company Name</label><input value={form.to_name} onChange={e=>set('to_name',e.target.value)} placeholder="Client name or company"/></div>
              <div className="ied-field"><label>Phone</label><input value={form.to_phone} onChange={e=>set('to_phone',e.target.value)}/></div>
              <div className="ied-field"><label>Email</label><input value={form.to_email} onChange={e=>set('to_email',e.target.value)}/></div>
              <div className="ied-field ied-span2"><label>Address</label><input value={form.to_address} onChange={e=>set('to_address',e.target.value)} placeholder="Client address"/></div>
              <div className="ied-field"><label>City</label><input value={form.to_city} onChange={e=>set('to_city',e.target.value)}/></div>
              <div className="ied-field"><label>State</label><input value={form.to_state} onChange={e=>set('to_state',e.target.value)}/></div>
              <div className="ied-field"><label>PIN Code</label><input value={form.to_pincode} onChange={e=>set('to_pincode',e.target.value)}/></div>
              <div className="ied-field"><label>GSTIN</label><input value={form.to_gstin} onChange={e=>set('to_gstin',e.target.value)} placeholder="Client GSTIN (optional)"/></div>
            </div>
          </div>

          {/* Items table */}
          <div className="ied-card">
            <div className="ied-card-head">
              <div className="ied-sec-title"><i className="fa fa-list"/> Products / Services</div>
            </div>
            <div className="ied-items-table">
              <div className="ied-items-head">
                <span style={{flex:'1 1 220px'}}>Description</span>
                <span style={{width:70}}>HSN/SAC</span>
                <span style={{width:60}}>Qty</span>
                <span style={{width:70}}>Unit</span>
                <span style={{width:90}}>Rate (₹)</span>
                <span style={{width:90}}>Amount</span>
                <span style={{width:30}}></span>
              </div>
              {items.map((it, idx) => (
                <div key={idx} className="ied-item-row">
                  <div className="ied-item-main">
                    <input className="ied-inp-desc" value={it.description} onChange={e=>setItem(idx,'description',e.target.value)} placeholder={`Item ${idx+1} description`}/>
                    <input className="ied-inp-hsn" value={it.hsn_sac} onChange={e=>setItem(idx,'hsn_sac',e.target.value)} placeholder="HSN"/>
                    <input className="ied-inp-num" type="number" min="0" step="any" value={it.qty} onChange={e=>setItem(idx,'qty',e.target.value)}/>
                    <select className="ied-inp-unit" value={it.unit} onChange={e=>setItem(idx,'unit',e.target.value)}>
                      {UNITS.map(u=><option key={u}>{u}</option>)}
                    </select>
                    <input className="ied-inp-num" type="number" min="0" step="0.01" value={it.rate} onChange={e=>setItem(idx,'rate',e.target.value)} placeholder="0.00"/>
                    <div className="ied-inp-amt">Rs. {fmtNum(it.amount || (parseFloat(it.qty||0)*parseFloat(it.rate||0)))}</div>
                    <button className="ied-item-del" onClick={()=>removeItem(idx)}><i className="fa fa-xmark"/></button>
                  </div>
                  <input className="ied-inp-details" value={it.details} onChange={e=>setItem(idx,'details',e.target.value)} placeholder="Details / additional notes (optional)"/>
                </div>
              ))}
              <button className="ied-add-item" onClick={addItem}>
                <i className="fa fa-plus"/> Add Line Item
              </button>
            </div>
          </div>

          {/* Notes & Terms */}
          <div className="ied-card">
            <div className="ied-card-head"><div className="ied-sec-title"><i className="fa fa-note-sticky"/> Notes &amp; Terms</div></div>
            <div className="ied-grid-2">
              <div className="ied-field">
                <label>Notes (printed on invoice)</label>
                <textarea rows={3} value={form.notes} onChange={e=>set('notes',e.target.value)} placeholder="Thank you for your business!"/>
              </div>
              <div className="ied-field">
                <label>Terms &amp; Conditions</label>
                <textarea rows={3} value={form.terms} onChange={e=>set('terms',e.target.value)} placeholder="Payment terms, validity, etc."/>
              </div>
            </div>
          </div>

          {/* Project Invoice toggle */}
          <div className="ied-card">
            <div className="ied-proj-toggle">
              <label className="ied-proj-switch">
                <input type="checkbox" checked={!!form.is_project_inv} onChange={e=>set('is_project_inv',e.target.checked)}/>
                <span className="ied-proj-slider"/>
              </label>
              <div>
                <div className="ied-proj-label">Project Invoice</div>
                <div className="ied-proj-sub">Link to a project — payment will create an income transaction in project accounts</div>
              </div>
            </div>
            {form.is_project_inv && (
              <div className="ied-proj-select">
                <div className="ied-field">
                  <label>Select Project</label>
                  <select value={form.project_id||''} onChange={e=>applyProject(e.target.value)}>
                    <option value="">— Choose a project —</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}{p.client?` (${p.client})`:''}</option>)}
                  </select>
                </div>
                {form.project_id && <div className="ied-proj-notice"><i className="fa fa-circle-check"/> Project details auto-applied. Client info loaded into "Bill To" section above.</div>}
              </div>
            )}
          </div>

        </div>{/* end .ied-main */}

        {/* ── Right column: Totals + Template ────────────────────── */}
        <div className="ied-side">

          {/* Live Totals */}
          <div className="ied-card ied-totals-card">
            <div className="ied-card-head"><div className="ied-sec-title"><i className="fa fa-calculator"/> Totals</div></div>
            <div className="ied-tax-row">
              <div className="ied-field" style={{flex:1}}>
                <label>Tax Label</label>
                <input value={form.tax_label} onChange={e=>set('tax_label',e.target.value)} placeholder="GST" style={{width:'100%'}}/>
              </div>
              <div className="ied-field" style={{width:80}}>
                <label>Rate %</label>
                <input type="number" min="0" max="100" step="0.1" value={form.tax_rate} onChange={e=>set('tax_rate',e.target.value)} style={{width:'100%'}}/>
              </div>
            </div>
            <div className="ied-field">
              <label>Discount (Rs.)</label>
              <input type="number" min="0" step="0.01" value={form.discount} onChange={e=>set('discount',e.target.value)}/>
            </div>
            <div className="ied-field">
              <label>Shipping / Handling (Rs.)</label>
              <input type="number" min="0" step="0.01" value={form.shipping} onChange={e=>set('shipping',e.target.value)}/>
            </div>
            <div className="ied-totals-lines">
              <div className="ied-tot-row"><span>Subtotal</span><span>Rs. {fmtNum(subtotal)}</span></div>
              <div className="ied-tot-row"><span>{form.tax_label||'Tax'} ({taxRate}%)</span><span>Rs. {fmtNum(taxAmt)}</span></div>
              <div className="ied-tot-row"><span>Discount</span><span>− Rs. {fmtNum(disc)}</span></div>
              {shipping > 0 && <div className="ied-tot-row"><span>Shipping</span><span>Rs. {fmtNum(shipping)}</span></div>}
            </div>
            <div className="ied-grand-total">
              <span>Total</span>
              <span>Rs. {fmtNum(total)}</span>
            </div>
          </div>

          {/* Template Picker */}
          <div className="ied-card ied-tpl-card">
            <div className="ied-card-head"><div className="ied-sec-title"><i className="fa fa-palette"/> PDF Template</div></div>
            <div className="ied-tpl-legend">
              <span className="ied-tpl-lay-a">A</span> Banner &nbsp;
              <span className="ied-tpl-lay-b">B</span> Minimal &nbsp;
              <span className="ied-tpl-lay-c">C</span> Dark
            </div>
            <div className="ied-tpl-grid">
              {TEMPLATE_SWATCHES.map(t => (
                <button key={t.id} type="button"
                  className={`ied-tpl-card${form.template===t.id?' ied-tpl-selected':''}`}
                  onClick={() => set('template', t.id)}
                  title={t.name}>
                  <div className="ied-tpl-swatch" style={{ background: t.hBg }}>
                    <div className="ied-tpl-accent-bar" style={{ background: t.accent }}/>
                    <span className={`ied-tpl-lay-badge ied-tpl-lay-${t.layout.toLowerCase()}`}>{t.layout}</span>
                    {form.template === t.id && <i className="fa fa-check ied-tpl-check"/>}
                  </div>
                  <div className="ied-tpl-name">{t.name}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Quick actions */}
          <div className="ied-side-actions">
            {isEdit && (
              <a href={invoicesApi.pdfUrl(id)} target="_blank" rel="noreferrer" className="ied-btn-pdf-sm">
                <i className="fa fa-file-pdf"/> Download Current PDF
              </a>
            )}
          </div>

        </div>
      </div>{/* end .ied-body */}
    </div>
  );
}
