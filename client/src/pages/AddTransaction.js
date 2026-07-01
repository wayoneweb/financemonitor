import React, { useState, useEffect, useContext, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import $ from 'jquery';
import { projectsApi, categoriesApi, transactionsApi } from '../api';
import { ToastContext } from '../App';
import './AddTransaction.css';

const PAYMENT_METHODS = [
  { value: 'cash',          label: 'Cash',    icon: 'fa-money-bill-wave'  },
  { value: 'bank_transfer', label: 'Bank',    icon: 'fa-building-columns' },
  { value: 'cheque',        label: 'Cheque',  icon: 'fa-file-invoice'     },
  { value: 'card',          label: 'Card',    icon: 'fa-credit-card'      },
  { value: 'upi',           label: 'UPI',     icon: 'fa-mobile-screen'    },
  { value: 'online',        label: 'Online',  icon: 'fa-globe'            },
  { value: 'other',         label: 'Other',   icon: 'fa-ellipsis'         },
];

const STATUSES = [
  { value: 'confirmed', label: 'Confirmed', icon: 'fa-circle-check' },
  { value: 'pending',   label: 'Pending',   icon: 'fa-clock'        },
  { value: 'cancelled', label: 'Cancelled', icon: 'fa-circle-xmark' },
];

const today = () => new Date().toISOString().slice(0, 10);
const EMPTY = {
  type: 'income', project_id: '', category_id: '',
  title: '', description: '', amount: '', currency: 'INR',
  date: today(), reference_no: '', payment_method: 'bank_transfer',
  party_name: '', tax_amount: '', discount: '', notes: '', status: 'confirmed',
};

const fileBoxCls = m => !m?'generic':m.startsWith('image/')?'img':m==='application/pdf'?'pdf':m.includes('word')?'doc':m.includes('excel')||m.includes('spreadsheet')?'xls':'generic';
const fileIconNm = m => !m?'fa-file':m.startsWith('image/')?'fa-image':m==='application/pdf'?'fa-file-pdf':m.includes('word')?'fa-file-word':m.includes('excel')||m.includes('spreadsheet')?'fa-file-excel':'fa-file-lines';
const fmtBytes  = b => b<1024?b+' B':b<1048576?(b/1024).toFixed(1)+' KB':(b/1048576).toFixed(1)+' MB';
const fmtNum    = n => Number(n||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});

export default function AddTransaction({ editData, onSaved }) {
  const showToast = useContext(ToastContext);
  const navigate  = useNavigate();
  const fileRef   = useRef(null);

  const [form,       setForm]       = useState(editData ? { ...EMPTY, ...editData, project_id: editData.project_id||'', category_id: editData.category_id||'' } : EMPTY);
  const [projects,   setProjects]   = useState([]);
  const [categories, setCategories] = useState([]);
  const [file,       setFile]       = useState(null);
  const [saving,     setSaving]     = useState(false);
  const [errors,     setErrors]     = useState({});
  const [dragover,   setDragover]   = useState(false);

  const isEdit   = !!editData;
  const isIncome = form.type === 'income';

  useEffect(() => {
    projectsApi.list().done(setProjects);
    categoriesApi.list().done(setCategories);
  }, []);

  const filteredCats = categories.filter(c => c.type === form.type);
  const set = (k, v) => { setForm(f => ({...f,[k]:v})); if (errors[k]) setErrors(e => ({...e,[k]:null})); };
  const switchType = t => { set('type', t); set('category_id', ''); };

  const validate = () => {
    const errs = {};
    if (!form.title.trim()) errs.title = 'Title is required';
    if (!form.amount || isNaN(form.amount) || Number(form.amount) <= 0) errs.amount = 'Enter a valid amount';
    if (!form.date) errs.date = 'Date is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleFile = f => {
    if (f && f.size > 10*1024*1024) { showToast('File must be under 10 MB','error'); return; }
    setFile(f||null);
  };

  const handleSubmit = e => {
    e.preventDefault();
    if (!validate()) {
      $('#at-form').css('animation','none').offset();
      $('#at-form').css('animation','atShake 0.4s ease');
      return;
    }
    setSaving(true);
    const fd = new FormData();
    Object.entries(form).forEach(([k,v]) => fd.append(k, v??''));
    if (file) fd.append('attachment', file);
    const call = isEdit ? transactionsApi.update(editData.id, fd) : transactionsApi.create(fd);
    call
      .done(saved => { showToast(isEdit?'Transaction updated!':`${isIncome?'Income':'Expense'} recorded!`); if (onSaved) { onSaved(saved); return; } navigate('/history'); })
      .fail(xhr => showToast(xhr.responseJSON?.error||'Failed to save','error'))
      .always(() => setSaving(false));
  };

  const net     = (Number(form.amount)||0) + (Number(form.tax_amount)||0) - (Number(form.discount)||0);
  const showNet = (form.tax_amount||form.discount) && form.amount;

  return (
    <div className="at-page">

      {/* Page header */}
      <div className="at-header">
        <div>
          <h2 className="at-title">{isEdit ? 'Edit Transaction' : 'New Transaction'}</h2>
          <p className="at-subtitle">{isIncome ? 'Record money received or earned' : 'Record money paid or spent'}</p>
        </div>
        <div className="at-type-toggle">
          <button type="button"
            className={`at-type-btn${isIncome?' at-tb-active':''}`}
            onClick={() => switchType('income')}>
            <i className="fa fa-arrow-trend-up"/> Income
          </button>
          <button type="button"
            className={`at-type-btn${!isIncome?' at-tb-active':''}`}
            onClick={() => switchType('expense')}>
            <i className="fa fa-arrow-trend-down"/> Expense
          </button>
        </div>
      </div>

      <form id="at-form" onSubmit={handleSubmit}>
        <div className="at-layout">

          {/* ── LEFT: Main details ──────────────────────────── */}
          <div className="at-main">
            <div className="at-card">

              {/* Core fields */}
              <div className="at-body">
                <p className="at-group-label">Transaction Details</p>
                <div className="at-grid">
                  <div className="at-field at-span2">
                    <label>Title <span className="at-req">*</span></label>
                    <input
                      className={errors.title?'at-inp-err':''}
                      value={form.title}
                      onChange={e=>set('title',e.target.value)}
                      placeholder={isIncome?'e.g. Project Milestone, Sales Invoice…':'e.g. Office Rent, Software License…'}
                    />
                    {errors.title && <span className="at-field-err"><i className="fa fa-circle-exclamation"/> {errors.title}</span>}
                  </div>
                  <div className="at-field">
                    <label>Date <span className="at-req">*</span></label>
                    <input type="date" className={errors.date?'at-inp-err':''} value={form.date} onChange={e=>set('date',e.target.value)}/>
                  </div>
                  <div className="at-field">
                    <label>Reference No.</label>
                    <input value={form.reference_no} onChange={e=>set('reference_no',e.target.value)} placeholder="INV-2026-001"/>
                  </div>
                  <div className="at-field">
                    <label>Project</label>
                    <select value={form.project_id} onChange={e=>set('project_id',e.target.value)}>
                      <option value="">— No Project —</option>
                      {projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div className="at-field">
                    <label>Category</label>
                    <select value={form.category_id} onChange={e=>set('category_id',e.target.value)}>
                      <option value="">— Select Category —</option>
                      {filteredCats.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div className="at-field">
                    <label>{isIncome ? 'Client / Payer' : 'Vendor / Payee'}</label>
                    <input value={form.party_name} onChange={e=>set('party_name',e.target.value)} placeholder={isIncome?'Client name':'Vendor / supplier'}/>
                  </div>
                  <div className="at-field">
                    <label>Status</label>
                    <select value={form.status} onChange={e=>set('status',e.target.value)}>
                      {STATUSES.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              <div className="at-sep"/>

              {/* Payment method */}
              <div className="at-body">
                <p className="at-group-label">Payment Method</p>
                <div className="at-methods">
                  {PAYMENT_METHODS.map(m => (
                    <button key={m.value} type="button"
                      className={`at-meth${form.payment_method===m.value?' at-meth-on':''}`}
                      onClick={() => set('payment_method', m.value)}>
                      <i className={`fa ${m.icon}`}/> {m.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="at-sep"/>

              {/* Adjustments & Notes */}
              <div className="at-body">
                <p className="at-group-label">Adjustments &amp; Notes</p>
                <div className="at-grid">
                  <div className="at-field">
                    <label>Tax Amount (₹)</label>
                    <input type="number" min="0" step="0.01" value={form.tax_amount} onChange={e=>set('tax_amount',e.target.value)} placeholder="0.00"/>
                  </div>
                  <div className="at-field">
                    <label>Discount (₹)</label>
                    <input type="number" min="0" step="0.01" value={form.discount} onChange={e=>set('discount',e.target.value)} placeholder="0.00"/>
                  </div>
                  <div className="at-field at-span2">
                    <label>Description</label>
                    <textarea rows={2} value={form.description} onChange={e=>set('description',e.target.value)} placeholder="What is this transaction for?"/>
                  </div>
                  <div className="at-field at-span2">
                    <label>Notes</label>
                    <textarea rows={2} value={form.notes} onChange={e=>set('notes',e.target.value)} placeholder="Remarks, follow-up notes…"/>
                  </div>
                </div>
              </div>

              <div className="at-sep"/>

              {/* Attachment */}
              <div className="at-body">
                <p className="at-group-label">{isIncome ? 'Receipt / Proof' : 'Bill / Invoice'}</p>
                {isEdit && editData.attachment_name && !file && (
                  <div className="at-fprev">
                    <div className={`at-ficon at-fi-${fileBoxCls(editData.attachment_type)}`}><i className={`fa ${fileIconNm(editData.attachment_type)}`}/></div>
                    <div className="at-fmeta">
                      <div className="at-fn">{editData.attachment_name}</div>
                      <div className="at-fs">Existing attachment</div>
                    </div>
                    <a href={`/api/uploads/${editData.attachment_path}`} target="_blank" rel="noreferrer" className="at-fview">
                      <i className="fa fa-eye"/> View
                    </a>
                  </div>
                )}
                <div className={`at-drop${dragover?' at-drag':''}`}
                  onClick={() => fileRef.current?.click()}
                  onDragOver={e=>{e.preventDefault();setDragover(true);}}
                  onDragLeave={() => setDragover(false)}
                  onDrop={e=>{e.preventDefault();setDragover(false);handleFile(e.dataTransfer.files[0]);}}>
                  <i className={`fa ${file?'fa-circle-check':'fa-cloud-arrow-up'} at-drop-icon${file?' at-di-done':''}`}/>
                  <div>
                    <div className="at-drop-title">{file ? file.name : 'Drop file or click to upload'}</div>
                    <div className="at-drop-sub">{file ? fmtBytes(file.size) : 'JPG, PNG, PDF, Excel · Max 10 MB'}</div>
                  </div>
                  {file && (
                    <button type="button" className="at-drop-remove"
                      onClick={e=>{e.stopPropagation();setFile(null);fileRef.current.value='';}}>
                      <i className="fa fa-xmark"/>
                    </button>
                  )}
                  <input ref={fileRef} type="file" hidden accept=".jpg,.jpeg,.png,.gif,.pdf,.doc,.docx,.xls,.xlsx" onChange={e=>handleFile(e.target.files[0])}/>
                </div>
              </div>

            </div>
          </div>

          {/* ── RIGHT: Amount + Summary + Actions (sticky) ──── */}
          <div className="at-sidebar">

            <div className="at-amount-card">
              <p className="at-group-label at-group-label-light">Amount</p>
              <div className="at-amt-row">
                <span className="at-amt-sym">₹</span>
                <input
                  className={`at-amt-inp${errors.amount?' at-inp-err':''}`}
                  type="number" min="0" step="0.01"
                  value={form.amount}
                  onChange={e => set('amount', e.target.value)}
                  placeholder="0.00"
                  autoFocus={!isEdit}
                />
              </div>
              {errors.amount && <p className="at-field-err"><i className="fa fa-circle-exclamation"/> {errors.amount}</p>}

              <div className="at-type-pill-row">
                <span className={`at-type-pill ${isIncome ? 'pill-income' : 'pill-expense'}`}>
                  <i className={`fa fa-${isIncome ? 'arrow-trend-up' : 'arrow-trend-down'}`} />
                  {isIncome ? 'Income' : 'Expense'}
                </span>
              </div>
            </div>

            {showNet && (
              <div className="at-summary-card">
                <div className="at-summary-row">
                  <span>Base Amount</span>
                  <span>₹{fmtNum(form.amount)}</span>
                </div>
                {form.tax_amount > 0 && (
                  <div className="at-summary-row">
                    <span>+ Tax</span>
                    <span>₹{fmtNum(form.tax_amount)}</span>
                  </div>
                )}
                {form.discount > 0 && (
                  <div className="at-summary-row">
                    <span>− Discount</span>
                    <span>₹{fmtNum(form.discount)}</span>
                  </div>
                )}
                <div className="at-summary-row at-summary-net">
                  <span>Net Amount</span>
                  <span>₹{fmtNum(net)}</span>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="at-actions">
              <button type="submit" className="at-btn-submit" disabled={saving}>
                {saving
                  ? <><i className="fa fa-spinner fa-spin"/> Saving…</>
                  : <><i className={`fa fa-${isIncome?'arrow-trend-up':'arrow-trend-down'}`}/>
                      {isEdit ? 'Update Transaction' : `Record ${isIncome?'Income':'Expense'}`}</>
                }
              </button>
              {!isEdit && (
                <button type="button" className="at-btn-cancel" onClick={() => navigate(-1)}>
                  Cancel
                </button>
              )}
            </div>

          </div>

        </div>
      </form>
    </div>
  );
}
