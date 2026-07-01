import React, { useState } from 'react';
import { companiesApi, setActiveCompany } from '../api';
import './CompanySwitcher.css';

const EMPTY = { name: '', gstin: '', pan: '', address: '', city: '', state: '', pincode: '', phone: '', email: '' };

// Company picker + "create new company" used across the Accounting pages only —
// this keeps multi-company scoped to Accounting instead of the global sidebar.
export default function CompanySwitcher({ companies, companyId, onChange, onCreated, showToast }) {
  const [modal, setModal]   = useState(false);
  const [form, setForm]     = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const openModal = () => { setForm(EMPTY); setModal(true); };

  const save = async () => {
    if (!form.name.trim()) return showToast && showToast('Company name is required', 'error');
    setSaving(true);
    try {
      const created = await companiesApi.create(form);
      showToast && showToast('Company created', 'success');
      setModal(false);
      setActiveCompany(created.id);
      onChange(String(created.id));
      onCreated && onCreated(created);
    } catch (e) { showToast && showToast(e?.error || 'Failed to create company', 'error'); }
    finally { setSaving(false); }
  };

  return (
    <>
      <div className="cs-wrap">
        <i className="fa fa-building cs-ico" />
        <select className="cs-select" value={companyId} onChange={(e) => onChange(e.target.value)}>
          {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button className="cs-new-btn" onClick={openModal} title="Create new company">
          <i className="fa fa-plus" /> New Company
        </button>
      </div>

      {modal && (
        <div className="cs-overlay" onClick={(e) => e.target === e.currentTarget && setModal(false)}>
          <div className="cs-modal">
            <div className="cs-modal-hdr">
              <div className="cs-modal-title"><i className="fa fa-building" /> New Company</div>
              <button className="cs-modal-close" onClick={() => setModal(false)}><i className="fa fa-xmark" /></button>
            </div>
            <div className="cs-modal-body">
              <div className="cs-field"><label>Company Name *</label>
                <input value={form.name} onChange={set('name')} autoFocus placeholder="e.g. Wayone Traders Pvt Ltd" />
              </div>
              <div className="cs-field-row">
                <div className="cs-field"><label>GSTIN</label><input value={form.gstin} onChange={set('gstin')} placeholder="Optional" /></div>
                <div className="cs-field"><label>PAN</label><input value={form.pan} onChange={set('pan')} placeholder="Optional" /></div>
              </div>
              <div className="cs-field"><label>Address</label>
                <input value={form.address} onChange={set('address')} placeholder="Optional" />
              </div>
              <div className="cs-field-row">
                <div className="cs-field"><label>City</label><input value={form.city} onChange={set('city')} /></div>
                <div className="cs-field"><label>State</label><input value={form.state} onChange={set('state')} /></div>
                <div className="cs-field"><label>Pincode</label><input value={form.pincode} onChange={set('pincode')} /></div>
              </div>
              <div className="cs-field-row">
                <div className="cs-field"><label>Phone</label><input value={form.phone} onChange={set('phone')} /></div>
                <div className="cs-field"><label>Email</label><input value={form.email} onChange={set('email')} /></div>
              </div>
            </div>
            <div className="cs-modal-footer">
              <button className="cs-btn-cancel" onClick={() => setModal(false)} disabled={saving}>Cancel</button>
              <button className="cs-btn-save" onClick={save} disabled={saving}>
                {saving ? <><i className="fa fa-spinner fa-spin" /> Creating…</> : <><i className="fa fa-check" /> Create Company</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
