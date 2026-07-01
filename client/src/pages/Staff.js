import React, { useState, useEffect, useCallback, useContext, useRef } from 'react';
import { hrApi, projectsApi } from '../api';
import { ToastContext } from '../App';
import './Staff.css';

const EMPTY_FORM = {
  employee_id: '', name: '', designation: '', department: '', gender: '',
  date_of_joining: '', date_of_birth: '', phone: '', email: '',
  address: '', city: '', state: '', pincode: '',
  bank_name: '', bank_account: '', bank_ifsc: '',
  emergency_contact: '', emergency_phone: '', notes: '', status: 'active',
};
const EMPTY_SALARY = {
  basic: '', hra_pct: '', da_pct: '', ta_fixed: '', other_fixed: '',
  pf_pct: '12', esi_pct: '0.75', working_days: '26', effective_from: '',
};
const EMPTY_ADV = { amount: '', date: '', reason: '', monthly_deduction: '', project_id: '' };
const EMPTY_PROJ = { project_id: '', role: '', from_date: '', is_primary: false };

const STATUS_COLORS = { active: '#10b981', inactive: '#f59e0b', terminated: '#ef4444' };

export default function Staff() {
  const showToast = useContext(ToastContext);
  const [staffList, setStaffList]     = useState([]);
  const [projects, setProjects]       = useState([]);
  const [departments, setDepartments] = useState([]);
  const [selected, setSelected]       = useState(null);
  const [tab, setTab]                 = useState('profile');
  const [loading, setLoading]         = useState(false);
  const [saving, setSaving]           = useState(false);
  const [isNew, setIsNew]             = useState(false);

  // Filters
  const [filterStatus, setFilterStatus] = useState('');
  const [filterDept, setFilterDept]     = useState('');
  const [search, setSearch]             = useState('');

  // Form state
  const [form, setForm]     = useState(EMPTY_FORM);
  const [salary, setSalary] = useState(EMPTY_SALARY);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState('');
  const photoRef = useRef(null);

  // Project assignment form
  const [projForm, setProjForm]   = useState(EMPTY_PROJ);
  const [addingProj, setAddingProj] = useState(false);

  // Advance form
  const [advForm, setAdvForm]   = useState(EMPTY_ADV);
  const [addingAdv, setAddingAdv] = useState(false);
  const [editingAdv, setEditingAdv] = useState(null);

  const loadList = useCallback(() => {
    setLoading(true);
    const p = {};
    if (filterStatus) p.status = filterStatus;
    if (filterDept)   p.department = filterDept;
    if (search)       p.search = search;
    hrApi.staff(p)
      .then(d => setStaffList(d || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [filterStatus, filterDept, search]);

  useEffect(() => { loadList(); }, [loadList]);

  useEffect(() => {
    projectsApi.list().then(d => setProjects(d || [])).catch(() => {});
    hrApi.departments().then(d => setDepartments(d || [])).catch(() => {});
  }, []);

  const selectStaff = useCallback((s) => {
    hrApi.staffGet(s.id).then(full => {
      setSelected(full);
      setForm({
        employee_id: full.employee_id || '', name: full.name || '',
        designation: full.designation || '', department: full.department || '',
        gender: full.gender || '', date_of_joining: full.date_of_joining || '',
        date_of_birth: full.date_of_birth || '', phone: full.phone || '',
        email: full.email || '', address: full.address || '', city: full.city || '',
        state: full.state || '', pincode: full.pincode || '',
        bank_name: full.bank_name || '', bank_account: full.bank_account || '',
        bank_ifsc: full.bank_ifsc || '', emergency_contact: full.emergency_contact || '',
        emergency_phone: full.emergency_phone || '', notes: full.notes || '',
        status: full.status || 'active',
      });
      setSalary(full.salary ? {
        basic: full.salary.basic || '', hra_pct: full.salary.hra_pct || '',
        da_pct: full.salary.da_pct || '', ta_fixed: full.salary.ta_fixed || '',
        other_fixed: full.salary.other_fixed || '', pf_pct: full.salary.pf_pct || '12',
        esi_pct: full.salary.esi_pct || '0.75', working_days: full.salary.working_days || '26',
        effective_from: full.salary.effective_from || '',
      } : EMPTY_SALARY);
      setPhotoFile(null);
      setPhotoPreview(full.photo ? `/api/uploads/${full.photo}` : '');
      setIsNew(false);
      setTab('profile');
    }).catch(() => showToast('Failed to load staff', 'error'));
  }, [showToast]);

  const startNew = () => {
    setSelected(null);
    setForm(EMPTY_FORM);
    setSalary(EMPTY_SALARY);
    setPhotoFile(null);
    setPhotoPreview('');
    setIsNew(true);
    setTab('profile');
  };

  const handlePhoto = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const removePhoto = () => {
    setPhotoFile(null);
    setPhotoPreview('');
    if (photoRef.current) photoRef.current.value = '';
  };

  const saveProfile = async () => {
    if (!form.name.trim()) return showToast('Name is required', 'error');
    setSaving(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      if (photoFile) fd.append('photo', photoFile);
      else if (!photoPreview && selected?.photo) fd.append('remove_photo', '1');

      const saved = isNew
        ? await hrApi.staffCreate(fd)
        : await hrApi.staffUpdate(selected.id, fd);

      if (saved && saved.id) {
        showToast(isNew ? 'Staff created!' : 'Profile updated!');
        loadList();
        hrApi.departments().then(d => setDepartments(d || [])).catch(() => {});
        if (isNew) { setIsNew(false); selectStaff(saved); }
        else selectStaff(saved);
      } else {
        showToast(saved?.error || 'Failed to save', 'error');
      }
    } catch (e) {
      showToast(e?.error || 'Failed to save', 'error');
    } finally {
      setSaving(false);
    }
  };

  const saveSalary = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await hrApi.salarySet(selected.id, salary);
      showToast('Salary structure saved!');
      selectStaff(selected);
    } catch (e) {
      showToast(e?.error || 'Failed to save salary', 'error');
    } finally {
      setSaving(false);
    }
  };

  const deleteStaff = async (s) => {
    if (!window.confirm(`Delete ${s.name}? This cannot be undone.`)) return;
    try {
      await hrApi.staffDelete(s.id);
      showToast('Staff deleted');
      if (selected?.id === s.id) { setSelected(null); setIsNew(false); }
      loadList();
    } catch (e) {
      showToast(e?.error || 'Failed to delete', 'error');
    }
  };

  // Project assignment
  const assignProject = async () => {
    if (!projForm.project_id) return showToast('Select a project', 'error');
    try {
      const updated = await hrApi.projectAssign(selected.id, projForm);
      setSelected(prev => ({ ...prev, projects: updated }));
      setProjForm(EMPTY_PROJ);
      setAddingProj(false);
      showToast('Project assigned!');
    } catch (e) {
      showToast(e?.error || 'Failed', 'error');
    }
  };

  const removeProject = async (projId, projName) => {
    if (!window.confirm(`Remove from ${projName}?`)) return;
    try {
      await hrApi.projectRemove(selected.id, projId);
      setSelected(prev => ({ ...prev, projects: prev.projects.filter(p => p.project_id !== projId) }));
      showToast('Removed from project');
    } catch (e) {
      showToast(e?.error || 'Failed', 'error');
    }
  };

  // Advances
  const saveAdvance = async () => {
    if (!advForm.amount) return showToast('Amount required', 'error');
    try {
      if (editingAdv) {
        await hrApi.advanceUpdate(editingAdv.id, {
          ...advForm,
          balance: advForm.balance !== undefined ? advForm.balance : advForm.amount,
        });
        showToast('Advance updated');
      } else {
        await hrApi.advanceCreate(selected.id, advForm);
        showToast('Advance added');
      }
      setAdvForm(EMPTY_ADV);
      setEditingAdv(null);
      setAddingAdv(false);
      selectStaff(selected);
    } catch (e) {
      showToast(e?.error || 'Failed', 'error');
    }
  };

  const deleteAdvance = async (adv) => {
    if (!window.confirm('Delete this advance record?')) return;
    try {
      await hrApi.advanceDelete(adv.id);
      showToast('Deleted');
      selectStaff(selected);
    } catch (e) {
      showToast(e?.error || 'Failed', 'error');
    }
  };

  const grossSalary = (() => {
    const b = parseFloat(salary.basic) || 0;
    const hra = b * (parseFloat(salary.hra_pct) || 0) / 100;
    const da  = b * (parseFloat(salary.da_pct)  || 0) / 100;
    const ta  = parseFloat(salary.ta_fixed)    || 0;
    const ot  = parseFloat(salary.other_fixed) || 0;
    return (b + hra + da + ta + ot).toFixed(2);
  })();

  const fmt = (n) => parseFloat(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });

  return (
    <div className="staff-page">
      {/* Left: list panel */}
      <div className="staff-list-panel">
        <div className="staff-list-header">
          <div className="staff-list-title">
            <h2>Staff <span className="staff-count">{staffList.length}</span></h2>
            <button className="btn-add-staff" onClick={startNew}>
              <i className="fa fa-plus" /> Add Staff
            </button>
          </div>
          <div className="staff-filters">
            <input
              className="staff-search"
              placeholder="Search name, ID, phone…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <div className="staff-filter-row">
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="staff-filter-sel">
                <option value="">All Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="terminated">Terminated</option>
              </select>
              <select value={filterDept} onChange={e => setFilterDept(e.target.value)} className="staff-filter-sel">
                <option value="">All Dept</option>
                {departments.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className="staff-list-body">
          {loading && <div className="staff-loading"><i className="fa fa-spinner fa-spin" /> Loading…</div>}
          {!loading && staffList.length === 0 && (
            <div className="staff-empty">
              <i className="fa fa-users" />
              <p>No staff found</p>
              <button className="btn-add-staff" onClick={startNew}>Add First Staff</button>
            </div>
          )}
          {staffList.map(s => (
            <div
              key={s.id}
              className={`staff-card${selected?.id === s.id || (isNew && !selected) ? '' : ''} ${selected?.id === s.id ? 'staff-card-active' : ''}`}
              onClick={() => selectStaff(s)}
            >
              <div className="staff-card-avatar">
                {s.photo
                  ? <img src={`/api/uploads/${s.photo}`} alt={s.name} />
                  : <span>{s.name.charAt(0).toUpperCase()}</span>}
              </div>
              <div className="staff-card-info">
                <div className="staff-card-name">{s.name}</div>
                <div className="staff-card-meta">
                  {s.employee_id && <span className="staff-card-eid">{s.employee_id}</span>}
                  {s.designation && <span>{s.designation}</span>}
                </div>
                {s.department && <div className="staff-card-dept">{s.department}</div>}
              </div>
              <div className="staff-card-actions">
                <span className="staff-status-dot" style={{ background: STATUS_COLORS[s.status] || '#94a3b8' }} title={s.status} />
                <button className="staff-del-btn" onClick={e => { e.stopPropagation(); deleteStaff(s); }} title="Delete">
                  <i className="fa fa-trash" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right: detail panel */}
      <div className="staff-detail-panel">
        {!isNew && !selected ? (
          <div className="staff-detail-empty">
            <i className="fa fa-user-plus" />
            <h3>Select a staff member or add new</h3>
            <button className="btn-add-staff" onClick={startNew}>
              <i className="fa fa-plus" /> Add Staff
            </button>
          </div>
        ) : (
          <>
            {/* Detail header */}
            <div className="staff-detail-header">
              <div className="staff-detail-avatar">
                <div className="staff-avatar-wrap" onClick={() => photoRef.current?.click()}>
                  {photoPreview
                    ? <img src={photoPreview} alt="photo" />
                    : <span>{(form.name || '?').charAt(0).toUpperCase()}</span>}
                  <div className="staff-avatar-overlay"><i className="fa fa-camera" /></div>
                </div>
                {photoPreview && (
                  <button className="staff-photo-remove" onClick={removePhoto} title="Remove photo">
                    <i className="fa fa-xmark" />
                  </button>
                )}
                <input ref={photoRef} type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
              </div>
              <div>
                <div className="staff-detail-name">{form.name || 'New Staff'}</div>
                <div className="staff-detail-role">{form.designation || 'No designation'} {form.department ? `· ${form.department}` : ''}</div>
              </div>
            </div>

            {/* Tabs */}
            <div className="staff-tabs">
              {['profile', 'salary', 'projects', 'advances'].map(t => (
                <button key={t} className={`staff-tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
                  <i className={`fa ${t === 'profile' ? 'fa-user' : t === 'salary' ? 'fa-indian-rupee-sign' : t === 'projects' ? 'fa-folder-open' : 'fa-hand-holding-dollar'}`} />
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>

            {/* Tab: Profile */}
            {tab === 'profile' && (
              <div className="staff-form">
                <div className="form-section-title">Basic Information</div>
                <div className="form-row-2">
                  <label className="form-field">
                    <span>Employee ID</span>
                    <input value={form.employee_id} onChange={e => setForm(f => ({ ...f, employee_id: e.target.value }))} placeholder="EMP001" />
                  </label>
                  <label className="form-field required">
                    <span>Full Name *</span>
                    <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Full name" />
                  </label>
                </div>
                <div className="form-row-2">
                  <label className="form-field">
                    <span>Designation</span>
                    <input value={form.designation} onChange={e => setForm(f => ({ ...f, designation: e.target.value }))} placeholder="e.g. Site Engineer" />
                  </label>
                  <label className="form-field">
                    <span>Department</span>
                    <input value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))} list="depts-list" placeholder="e.g. Civil" />
                    <datalist id="depts-list">{departments.map(d => <option key={d} value={d} />)}</datalist>
                  </label>
                </div>
                <div className="form-row-3">
                  <label className="form-field">
                    <span>Gender</span>
                    <select value={form.gender} onChange={e => setForm(f => ({ ...f, gender: e.target.value }))}>
                      <option value="">Select</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                    </select>
                  </label>
                  <label className="form-field">
                    <span>Date of Joining</span>
                    <input type="date" value={form.date_of_joining} onChange={e => setForm(f => ({ ...f, date_of_joining: e.target.value }))} />
                  </label>
                  <label className="form-field">
                    <span>Date of Birth</span>
                    <input type="date" value={form.date_of_birth} onChange={e => setForm(f => ({ ...f, date_of_birth: e.target.value }))} />
                  </label>
                </div>
                <div className="form-row-2">
                  <label className="form-field">
                    <span>Phone</span>
                    <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="Mobile number" />
                  </label>
                  <label className="form-field">
                    <span>Email</span>
                    <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="email@example.com" />
                  </label>
                </div>

                <div className="form-section-title">Address</div>
                <label className="form-field">
                  <span>Address</span>
                  <input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="Street address" />
                </label>
                <div className="form-row-3">
                  <label className="form-field">
                    <span>City</span>
                    <input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} />
                  </label>
                  <label className="form-field">
                    <span>State</span>
                    <input value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value }))} />
                  </label>
                  <label className="form-field">
                    <span>Pincode</span>
                    <input value={form.pincode} onChange={e => setForm(f => ({ ...f, pincode: e.target.value }))} maxLength={6} />
                  </label>
                </div>

                <div className="form-section-title">Bank Details</div>
                <div className="form-row-3">
                  <label className="form-field">
                    <span>Bank Name</span>
                    <input value={form.bank_name} onChange={e => setForm(f => ({ ...f, bank_name: e.target.value }))} placeholder="SBI, HDFC…" />
                  </label>
                  <label className="form-field">
                    <span>Account Number</span>
                    <input value={form.bank_account} onChange={e => setForm(f => ({ ...f, bank_account: e.target.value }))} />
                  </label>
                  <label className="form-field">
                    <span>IFSC Code</span>
                    <input value={form.bank_ifsc} onChange={e => setForm(f => ({ ...f, bank_ifsc: e.target.value }))} placeholder="SBIN0001234" style={{ textTransform: 'uppercase' }} />
                  </label>
                </div>

                <div className="form-section-title">Emergency Contact</div>
                <div className="form-row-2">
                  <label className="form-field">
                    <span>Contact Name</span>
                    <input value={form.emergency_contact} onChange={e => setForm(f => ({ ...f, emergency_contact: e.target.value }))} />
                  </label>
                  <label className="form-field">
                    <span>Contact Phone</span>
                    <input value={form.emergency_phone} onChange={e => setForm(f => ({ ...f, emergency_phone: e.target.value }))} />
                  </label>
                </div>

                <div className="form-row-2">
                  <label className="form-field">
                    <span>Status</span>
                    <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                      <option value="terminated">Terminated</option>
                    </select>
                  </label>
                  <label className="form-field">
                    <span>Notes</span>
                    <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Any remarks…" />
                  </label>
                </div>

                <div className="form-actions">
                  <button className="btn-save" onClick={saveProfile} disabled={saving}>
                    {saving ? <><i className="fa fa-spinner fa-spin" /> Saving…</> : <><i className="fa fa-check" /> Save Profile</>}
                  </button>
                </div>
              </div>
            )}

            {/* Tab: Salary */}
            {tab === 'salary' && (
              <div className="staff-form">
                {isNew && <div className="salary-notice"><i className="fa fa-info-circle" /> Save profile first to configure salary.</div>}
                <div className="form-section-title">Salary Structure</div>
                <div className="form-row-2">
                  <label className="form-field">
                    <span>Basic Salary (₹/month)</span>
                    <input type="number" value={salary.basic} onChange={e => setSalary(s => ({ ...s, basic: e.target.value }))} placeholder="0.00" min="0" />
                  </label>
                  <label className="form-field">
                    <span>Working Days / Month</span>
                    <input type="number" value={salary.working_days} onChange={e => setSalary(s => ({ ...s, working_days: e.target.value }))} min="1" max="31" />
                  </label>
                </div>

                <div className="form-section-title">Allowances</div>
                <div className="form-row-2">
                  <label className="form-field">
                    <span>HRA (%)</span>
                    <input type="number" value={salary.hra_pct} onChange={e => setSalary(s => ({ ...s, hra_pct: e.target.value }))} placeholder="0" min="0" max="100" />
                  </label>
                  <label className="form-field">
                    <span>DA (%)</span>
                    <input type="number" value={salary.da_pct} onChange={e => setSalary(s => ({ ...s, da_pct: e.target.value }))} placeholder="0" min="0" max="100" />
                  </label>
                </div>
                <div className="form-row-2">
                  <label className="form-field">
                    <span>Travel Allowance (₹ fixed)</span>
                    <input type="number" value={salary.ta_fixed} onChange={e => setSalary(s => ({ ...s, ta_fixed: e.target.value }))} placeholder="0" min="0" />
                  </label>
                  <label className="form-field">
                    <span>Other Allowance (₹ fixed)</span>
                    <input type="number" value={salary.other_fixed} onChange={e => setSalary(s => ({ ...s, other_fixed: e.target.value }))} placeholder="0" min="0" />
                  </label>
                </div>

                <div className="form-section-title">Deductions</div>
                <div className="form-row-2">
                  <label className="form-field">
                    <span>PF Employee (%)</span>
                    <input type="number" value={salary.pf_pct} onChange={e => setSalary(s => ({ ...s, pf_pct: e.target.value }))} placeholder="12" min="0" max="100" />
                  </label>
                  <label className="form-field">
                    <span>ESI Employee (%)</span>
                    <input type="number" value={salary.esi_pct} onChange={e => setSalary(s => ({ ...s, esi_pct: e.target.value }))} placeholder="0.75" min="0" max="100" step="0.01" />
                  </label>
                </div>
                <div className="form-row-2">
                  <label className="form-field">
                    <span>Effective From</span>
                    <input type="date" value={salary.effective_from} onChange={e => setSalary(s => ({ ...s, effective_from: e.target.value }))} />
                  </label>
                </div>

                {parseFloat(salary.basic) > 0 && (
                  <div className="salary-preview">
                    <div className="salary-preview-title">Estimated Gross Salary</div>
                    <div className="salary-preview-amount">₹ {grossSalary}</div>
                    <div className="salary-preview-breakdown">
                      Basic: ₹{fmt(salary.basic)}
                      {parseFloat(salary.hra_pct) > 0 && ` + HRA: ₹${fmt(parseFloat(salary.basic) * parseFloat(salary.hra_pct) / 100)}`}
                      {parseFloat(salary.da_pct) > 0 && ` + DA: ₹${fmt(parseFloat(salary.basic) * parseFloat(salary.da_pct) / 100)}`}
                      {parseFloat(salary.ta_fixed) > 0 && ` + TA: ₹${fmt(salary.ta_fixed)}`}
                      {parseFloat(salary.other_fixed) > 0 && ` + Other: ₹${fmt(salary.other_fixed)}`}
                    </div>
                  </div>
                )}

                <div className="form-actions">
                  <button className="btn-save" onClick={saveSalary} disabled={saving || isNew}>
                    {saving ? <><i className="fa fa-spinner fa-spin" /> Saving…</> : <><i className="fa fa-check" /> Save Salary</>}
                  </button>
                </div>
              </div>
            )}

            {/* Tab: Projects */}
            {tab === 'projects' && (
              <div className="staff-form">
                {isNew && <div className="salary-notice"><i className="fa fa-info-circle" /> Save profile first to assign projects.</div>}
                <div className="section-list-header">
                  <div className="form-section-title">Project Assignments</div>
                  {!isNew && (
                    <button className="btn-add-sm" onClick={() => { setProjForm(EMPTY_PROJ); setAddingProj(true); }}>
                      <i className="fa fa-plus" /> Assign
                    </button>
                  )}
                </div>

                {addingProj && (
                  <div className="inline-form">
                    <div className="form-row-2">
                      <label className="form-field">
                        <span>Project *</span>
                        <select value={projForm.project_id} onChange={e => setProjForm(f => ({ ...f, project_id: e.target.value }))}>
                          <option value="">Select project…</option>
                          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                      </label>
                      <label className="form-field">
                        <span>Role</span>
                        <input value={projForm.role} onChange={e => setProjForm(f => ({ ...f, role: e.target.value }))} placeholder="e.g. Site Supervisor" />
                      </label>
                    </div>
                    <div className="form-row-2">
                      <label className="form-field">
                        <span>From Date</span>
                        <input type="date" value={projForm.from_date} onChange={e => setProjForm(f => ({ ...f, from_date: e.target.value }))} />
                      </label>
                      <label className="form-field checkbox-field">
                        <input type="checkbox" checked={projForm.is_primary} onChange={e => setProjForm(f => ({ ...f, is_primary: e.target.checked }))} />
                        <span>Primary Project</span>
                      </label>
                    </div>
                    <div className="inline-form-actions">
                      <button className="btn-save-sm" onClick={assignProject}><i className="fa fa-check" /> Assign</button>
                      <button className="btn-cancel-sm" onClick={() => setAddingProj(false)}>Cancel</button>
                    </div>
                  </div>
                )}

                {(selected?.projects || []).length === 0 && !addingProj && (
                  <div className="list-empty-sm">No projects assigned yet</div>
                )}
                {(selected?.projects || []).map(p => (
                  <div key={p.project_id} className="proj-item">
                    <div className="proj-item-icon"><i className="fa fa-folder-open" /></div>
                    <div className="proj-item-info">
                      <div className="proj-item-name">{p.project_name}</div>
                      <div className="proj-item-meta">
                        {p.role && <span>{p.role}</span>}
                        {p.from_date && <span>From {p.from_date}</span>}
                        {p.is_primary === 1 && <span className="proj-primary-badge">Primary</span>}
                      </div>
                    </div>
                    <button className="proj-del-btn" onClick={() => removeProject(p.project_id, p.project_name)}>
                      <i className="fa fa-trash" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Tab: Advances */}
            {tab === 'advances' && (
              <div className="staff-form">
                {isNew && <div className="salary-notice"><i className="fa fa-info-circle" /> Save profile first to manage advances.</div>}
                <div className="section-list-header">
                  <div className="form-section-title">Advances & Recoveries</div>
                  {!isNew && (
                    <button className="btn-add-sm" onClick={() => { setAdvForm(EMPTY_ADV); setEditingAdv(null); setAddingAdv(true); }}>
                      <i className="fa fa-plus" /> Add Advance
                    </button>
                  )}
                </div>

                {addingAdv && (
                  <div className="inline-form">
                    <div className="form-row-2">
                      <label className="form-field">
                        <span>Amount (₹) *</span>
                        <input type="number" value={advForm.amount} onChange={e => setAdvForm(f => ({ ...f, amount: e.target.value }))} placeholder="0" min="0" />
                      </label>
                      <label className="form-field">
                        <span>Date</span>
                        <input type="date" value={advForm.date} onChange={e => setAdvForm(f => ({ ...f, date: e.target.value }))} />
                      </label>
                    </div>
                    <div className="form-row-2">
                      <label className="form-field">
                        <span>Monthly Deduction (₹)</span>
                        <input type="number" value={advForm.monthly_deduction} onChange={e => setAdvForm(f => ({ ...f, monthly_deduction: e.target.value }))} placeholder="Full amount" min="0" />
                      </label>
                      <label className="form-field">
                        <span>Linked Project</span>
                        <select value={advForm.project_id} onChange={e => setAdvForm(f => ({ ...f, project_id: e.target.value }))}>
                          <option value="">None</option>
                          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                      </label>
                    </div>
                    <label className="form-field">
                      <span>Reason</span>
                      <input value={advForm.reason} onChange={e => setAdvForm(f => ({ ...f, reason: e.target.value }))} placeholder="Reason for advance" />
                    </label>
                    <div className="inline-form-actions">
                      <button className="btn-save-sm" onClick={saveAdvance}><i className="fa fa-check" /> Save</button>
                      <button className="btn-cancel-sm" onClick={() => { setAddingAdv(false); setEditingAdv(null); }}>Cancel</button>
                    </div>
                  </div>
                )}

                {(selected?.advances || []).length === 0 && !addingAdv && (
                  <div className="list-empty-sm">No advance records</div>
                )}
                {(selected?.advances || []).map(adv => (
                  <div key={adv.id} className={`adv-item adv-${adv.status}`}>
                    <div className="adv-item-icon">
                      <i className={`fa ${adv.status === 'cleared' ? 'fa-circle-check' : 'fa-hand-holding-dollar'}`} />
                    </div>
                    <div className="adv-item-info">
                      <div className="adv-item-top">
                        <span className="adv-amount">₹ {fmt(adv.amount)}</span>
                        <span className={`adv-status-badge adv-badge-${adv.status}`}>{adv.status}</span>
                      </div>
                      <div className="adv-item-meta">
                        {adv.date && <span><i className="fa fa-calendar" /> {adv.date}</span>}
                        <span>Balance: ₹ {fmt(adv.balance)}</span>
                        <span>Monthly: ₹ {fmt(adv.monthly_deduction)}</span>
                      </div>
                      {adv.reason && <div className="adv-reason">{adv.reason}</div>}
                    </div>
                    <div className="adv-item-actions">
                      <button className="adv-edit-btn" title="Edit" onClick={() => {
                        setAdvForm({ amount: adv.amount, date: adv.date, reason: adv.reason, monthly_deduction: adv.monthly_deduction, project_id: adv.project_id || '', balance: adv.balance, status: adv.status });
                        setEditingAdv(adv);
                        setAddingAdv(true);
                      }}>
                        <i className="fa fa-pen" />
                      </button>
                      <button className="adv-del-btn" title="Delete" onClick={() => deleteAdvance(adv)}>
                        <i className="fa fa-trash" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
