import React, { useState, useEffect, useContext, useMemo, useRef, useCallback } from 'react';
import { ToastContext } from '../App';
import { assetsApi } from '../api';
import './Assets.css';

// ── Constants ────────────────────────────────────────────────
const CATEGORIES = {
  electronics: { label: 'Electronics',  icon: 'fa-laptop',             color: 'ac-elec'  },
  furniture:   { label: 'Furniture',    icon: 'fa-couch',              color: 'ac-furn'  },
  vehicle:     { label: 'Vehicle',      icon: 'fa-car',                color: 'ac-veh'   },
  equipment:   { label: 'Equipment',    icon: 'fa-screwdriver-wrench', color: 'ac-equip' },
  property:    { label: 'Property',     icon: 'fa-building',           color: 'ac-prop'  },
  tools:       { label: 'Tools',        icon: 'fa-toolbox',            color: 'ac-tools' },
  other:       { label: 'Other',        icon: 'fa-box',                color: 'ac-other' },
};
const CONDITIONS = {
  excellent: { label: 'Excellent', cls: 'cond-excellent' },
  good:      { label: 'Good',      cls: 'cond-good'      },
  fair:      { label: 'Fair',      cls: 'cond-fair'      },
  poor:      { label: 'Poor',      cls: 'cond-poor'      },
  damaged:   { label: 'Damaged',   cls: 'cond-damaged'   },
};
const RESALE = {
  high:   { label: 'High',   cls: 'rs-high'   },
  medium: { label: 'Medium', cls: 'rs-medium' },
  low:    { label: 'Low',    cls: 'rs-low'    },
  none:   { label: 'None',   cls: 'rs-none'   },
};
const STATUSES = {
  active:       { label: 'Active',       cls: 'st-active'   },
  under_repair: { label: 'Under Repair', cls: 'st-repair'   },
  disposed:     { label: 'Disposed',     cls: 'st-disposed' },
  sold:         { label: 'Sold',         cls: 'st-sold'     },
};
const SORT_OPTS = [
  { val: 'name',           label: 'Name (A–Z)'           },
  { val: 'current_value',  label: 'Current Value'        },
  { val: 'purchase_value', label: 'Purchase Value'       },
  { val: 'purchase_date',  label: 'Purchase Date'        },
  { val: 'condition',      label: 'Condition'            },
  { val: 'created_at',     label: 'Date Added'           },
];
const ASSET_EMPTY = {
  name: '', asset_tag: '', category: 'electronics', project: '', location: '',
  purchase_date: '', purchase_value: '', current_value: '',
  condition: 'good', resale_chance: 'medium', status: 'active', notes: '',
};
const FILTER_EMPTY = {
  search: '', category: '', condition: '', resale_chance: '', status: '',
  val_min: '', val_max: '', sort: 'name', dir: 'asc',
};

const fmtAmt = (n) =>
  `Rs. ${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const fmtAmtFull = (n) =>
  `Rs. ${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (s) =>
  s ? new Date(s + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const calcAge = (purchaseDate) => {
  if (!purchaseDate) return null;
  const d = new Date(purchaseDate + 'T00:00:00');
  const now = new Date();
  const years = (now - d) / (365.25 * 24 * 3600 * 1000);
  if (years < 0) return '0 days';
  if (years < 1 / 12) return `${Math.round(years * 365)} day${Math.round(years * 365) !== 1 ? 's' : ''}`;
  if (years < 1) return `${Math.round(years * 12)} month${Math.round(years * 12) !== 1 ? 's' : ''}`;
  const y = Math.floor(years);
  const m = Math.round((years - y) * 12);
  return m > 0 ? `${y}y ${m}m` : `${y} yr${y !== 1 ? 's' : ''}`;
};

const photoUrl = (photo) => photo ? `/api/uploads/${photo}` : null;
const activeFilters = (f) =>
  ['category','condition','resale_chance','status','val_min','val_max'].filter(k => f[k]).length;

// ── Fetch with blob for download ──────────────────────────────
const downloadBlob = async (url, filename) => {
  const r = await fetch(url);
  const blob = await r.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); document.body.removeChild(a); }, 1000);
};

// ── Component ─────────────────────────────────────────────────
export default function Assets() {
  const showToast = useContext(ToastContext);
  const fileRef   = useRef(null);

  const [assets,       setAssets]       = useState([]);
  const [summary,      setSummary]      = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [viewMode,     setViewMode]     = useState('grid');   // 'grid' | 'table'
  const [filters,      setFilters]      = useState(FILTER_EMPTY);
  const [showFilters,  setShowFilters]  = useState(false);
  const [modal,        setModal]        = useState(null);     // 'form' | 'photo'
  const [editAsset,    setEditAsset]    = useState(null);
  const [viewPhoto,    setViewPhoto]    = useState(null);
  const [form,         setForm]         = useState(ASSET_EMPTY);
  const [photoFile,    setPhotoFile]    = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [removePhoto,  setRemovePhoto]  = useState(false);
  const [saving,       setSaving]       = useState(false);
  const [deleting,     setDeleting]     = useState(null);
  const [exporting,    setExporting]    = useState('');       // 'pdf' | 'excel' | ''
  const [error,        setError]        = useState('');

  // ── Load ────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const activeQ = {};
      Object.entries(filters).forEach(([k, v]) => { if (v) activeQ[k] = v; });
      const [list, sum] = await Promise.all([assetsApi.list(activeQ), assetsApi.summary()]);
      setAssets(list || []);
      setSummary(sum);
    } catch { showToast('Failed to load assets', 'error'); }
    finally { setLoading(false); }
  }, [filters]); // eslint-disable-line

  useEffect(() => { load(); }, [load]);

  // ── Summary totals ──────────────────────────────────────────
  const totals = useMemo(() => {
    if (!summary) return {};
    const t = summary.totals || {};
    return {
      count:       t.total_count         || 0,
      activeCount: t.active_count        || 0,
      purchaseVal: t.total_purchase_value || 0,
      currentVal:  t.total_current_value  || 0,
      depreciation: (t.total_purchase_value || 0) - (t.total_current_value || 0),
    };
  }, [summary]);

  const filterCount = activeFilters(filters);

  // ── Filter helpers ──────────────────────────────────────────
  const fch = (e) => setFilters(f => ({ ...f, [e.target.name]: e.target.value }));
  const resetFilters = () => setFilters(FILTER_EMPTY);
  const buildExportParams = () => {
    const p = {};
    Object.entries(filters).forEach(([k, v]) => { if (v) p[k] = v; });
    return p;
  };

  // ── Export ──────────────────────────────────────────────────
  const handleExport = async (type) => {
    setExporting(type);
    try {
      const params  = buildExportParams();
      const url     = type === 'pdf' ? assetsApi.exportPdf(params) : assetsApi.exportExcel(params);
      const fname   = type === 'pdf' ? `assets-${Date.now()}.pdf` : `assets-${Date.now()}.xlsx`;
      await downloadBlob(url, fname);
      showToast(`Assets exported as ${type.toUpperCase()}`, 'success');
    } catch { showToast('Export failed', 'error'); }
    finally { setExporting(''); }
  };

  // ── Modal helpers ───────────────────────────────────────────
  const openAdd = () => {
    setForm(ASSET_EMPTY); setEditAsset(null);
    setPhotoFile(null); setPhotoPreview(null); setRemovePhoto(false);
    setError(''); setModal('form');
  };
  const openEdit = (a) => {
    setForm({
      name: a.name || '', asset_tag: a.asset_tag || '', category: a.category || 'other',
      project: a.project || '', location: a.location || '', purchase_date: a.purchase_date || '',
      purchase_value: a.purchase_value || '', current_value: a.current_value || '',
      condition: a.condition || 'good', resale_chance: a.resale_chance || 'medium',
      status: a.status || 'active', notes: a.notes || '',
    });
    setEditAsset(a); setPhotoFile(null);
    setPhotoPreview(a.photo ? photoUrl(a.photo) : null);
    setRemovePhoto(false); setError(''); setModal('form');
  };
  const closeModal = () => { setModal(null); setError(''); };
  const fc = (e) => { const { name, value } = e.target; setForm(f => ({ ...f, [name]: value })); setError(''); };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setPhotoFile(file); setRemovePhoto(false);
    const reader = new FileReader();
    reader.onload = (ev) => setPhotoPreview(ev.target.result);
    reader.readAsDataURL(file);
  };
  const handleRemovePhoto = () => {
    setPhotoFile(null); setPhotoPreview(null); setRemovePhoto(true);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleSave = async () => {
    if (!form.name.trim()) return setError('Asset name is required.');
    setSaving(true); setError('');
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      if (photoFile) fd.append('photo', photoFile);
      if (removePhoto) fd.append('remove_photo', 'true');
      const d = editAsset ? await assetsApi.update(editAsset.id, fd) : await assetsApi.create(fd);
      if (d && d.error) throw new Error(d.error);
      showToast(editAsset ? 'Asset updated' : 'Asset added', 'success');
      closeModal(); load();
    } catch (e) { setError(e.message || 'Save failed'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (a) => {
    if (!window.confirm(`Delete "${a.name}"? This cannot be undone.`)) return;
    setDeleting(a.id);
    try { await assetsApi.remove(a.id); showToast('Asset deleted', 'success'); load(); }
    catch { showToast('Failed to delete', 'error'); }
    finally { setDeleting(null); }
  };

  // ── Render row for table view ───────────────────────────────
  const renderTableRow = (a, i) => {
    const cat  = CATEGORIES[a.category]    || CATEGORIES.other;
    const cond = CONDITIONS[a.condition]   || CONDITIONS.good;
    const rs   = RESALE[a.resale_chance]   || RESALE.medium;
    const st   = STATUSES[a.status]        || STATUSES.active;
    const age  = calcAge(a.purchase_date);
    const depr = (a.current_value || 0) - (a.purchase_value || 0);
    const img  = photoUrl(a.photo);
    return (
      <tr key={a.id} className={a.status !== 'active' ? 'row-inactive' : ''}>
        <td className="col-num">{i + 1}</td>
        <td>
          <div className="tbl-asset-cell">
            {img ? (
              <img src={img} alt={a.name} className="tbl-thumb"
                onClick={() => { setViewPhoto(img); setModal('photo'); }} />
            ) : (
              <div className={`tbl-thumb-ph ${cat.color}`}><i className={`fa ${cat.icon}`} /></div>
            )}
            <div>
              <div className="tbl-name">{a.name}</div>
              {a.asset_tag && <div className="tbl-tag"><i className="fa fa-tag" /> {a.asset_tag}</div>}
            </div>
          </div>
        </td>
        <td>
          <span className={`tbl-cat-badge ${cat.color}`}>
            <i className={`fa ${cat.icon}`} /> {cat.label}
          </span>
        </td>
        <td>
          {a.project  && <div className="tbl-meta"><i className="fa fa-folder-open" /> {a.project}</div>}
          {a.location && <div className="tbl-meta"><i className="fa fa-location-dot" /> {a.location}</div>}
        </td>
        <td>{fmtDate(a.purchase_date)}{age && <div className="tbl-age">{age} old</div>}</td>
        <td className="tbl-amt">{fmtAmtFull(a.purchase_value)}</td>
        <td className="tbl-amt tbl-cv">{fmtAmtFull(a.current_value)}</td>
        <td className={`tbl-amt ${depr < 0 ? 'dep-neg' : 'dep-pos'}`}>{depr < 0 ? '' : '+'}{fmtAmt(depr)}</td>
        <td><span className={`as-badge ${cond.cls}`}>{cond.label}</span></td>
        <td><span className={`as-badge ${rs.cls}`}>{rs.label}</span></td>
        <td><span className={`as-status-tbl ${st.cls}`}>{st.label}</span></td>
        <td>
          <div className="tbl-actions">
            <button className="ta-btn edit-btn" onClick={() => openEdit(a)}><i className="fa fa-pen" /></button>
            <button className="ta-btn del-btn" onClick={() => handleDelete(a)} disabled={deleting === a.id}>
              {deleting === a.id ? <i className="fa fa-spinner fa-spin" /> : <i className="fa fa-trash" />}
            </button>
          </div>
        </td>
      </tr>
    );
  };

  // ── Render card for grid view ───────────────────────────────
  const renderCard = (a) => {
    const cat  = CATEGORIES[a.category]    || CATEGORIES.other;
    const cond = CONDITIONS[a.condition]   || CONDITIONS.good;
    const rs   = RESALE[a.resale_chance]   || RESALE.medium;
    const st   = STATUSES[a.status]        || STATUSES.active;
    const age  = calcAge(a.purchase_date);
    const depr = (a.current_value || 0) - (a.purchase_value || 0);
    const img  = photoUrl(a.photo);
    return (
      <div key={a.id} className={`as-card ${a.status !== 'active' ? 'card-inactive' : ''}`}>
        <div className="as-card-photo" onClick={() => img && (setViewPhoto(img), setModal('photo'))}>
          {img
            ? <img src={img} alt={a.name} className="as-card-img" />
            : <div className={`as-card-placeholder ${cat.color}`}><i className={`fa ${cat.icon}`} /></div>
          }
          <span className={`as-status-badge ${st.cls}`}>{st.label}</span>
          {img && <div className="as-photo-zoom"><i className="fa fa-magnifying-glass-plus" /></div>}
        </div>
        <div className="as-card-body">
          <div className="as-card-top">
            <div>
              <div className="as-card-name">{a.name}</div>
              {a.asset_tag && <div className="as-card-tag"><i className="fa fa-tag" /> {a.asset_tag}</div>}
            </div>
            <div className={`as-cat-badge ${cat.color}`}><i className={`fa ${cat.icon}`} /> {cat.label}</div>
          </div>
          <div className="as-card-meta">
            {a.project  && <span><i className="fa fa-folder-open" /> {a.project}</span>}
            {a.location && <span><i className="fa fa-location-dot" /> {a.location}</span>}
            {age        && <span><i className="fa fa-clock" /> {age} old</span>}
          </div>
          <div className="as-card-values">
            <div className="asv-item">
              <div className="asv-label">Purchase Value</div>
              <div className="asv-amt">{fmtAmtFull(a.purchase_value)}</div>
            </div>
            <div className="asv-item">
              <div className="asv-label">Current Value</div>
              <div className="asv-amt current-val">{fmtAmtFull(a.current_value)}</div>
            </div>
            <div className="asv-item">
              <div className="asv-label">Depreciation</div>
              <div className={`asv-amt ${depr < 0 ? 'dep-neg' : 'dep-pos'}`}>
                {depr < 0 ? '' : '+'}{fmtAmt(depr)}
              </div>
            </div>
          </div>
          <div className="as-card-badges">
            <span className={`as-badge ${cond.cls}`}>{cond.label}</span>
            <span className={`as-badge rs-badge ${rs.cls}`}><i className="fa fa-recycle" /> Resale: {rs.label}</span>
          </div>
          <div className="as-card-actions">
            <button className="aa-btn edit-btn" onClick={() => openEdit(a)}><i className="fa fa-pen" /> Edit</button>
            <button className="aa-btn del-btn" onClick={() => handleDelete(a)} disabled={deleting === a.id}>
              {deleting === a.id ? <i className="fa fa-spinner fa-spin" /> : <><i className="fa fa-trash" /> Delete</>}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ────────────────────────────────────────────────────────────
  return (
    <div className="as-page">

      {/* ── Header ─────────────────────────────────────────── */}
      <div className="as-header">
        <div className="as-hdr-inner">
          <div className="as-hdr-left">
            <div className="as-hdr-icon"><i className="fa fa-boxes-stacked" /></div>
            <div>
              <div className="as-hdr-title">Asset Management</div>
              <div className="as-hdr-sub">Track all your assets — value, condition, location and more</div>
            </div>
          </div>
          <div className="as-hdr-actions">
            <button className="as-hdr-btn exp-xlsx" onClick={() => handleExport('excel')} disabled={!!exporting}>
              {exporting === 'excel' ? <><i className="fa fa-spinner fa-spin" /> Exporting…</> : <><i className="fa fa-file-excel" /> Excel</>}
            </button>
            <button className="as-hdr-btn exp-pdf" onClick={() => handleExport('pdf')} disabled={!!exporting}>
              {exporting === 'pdf' ? <><i className="fa fa-spinner fa-spin" /> Exporting…</> : <><i className="fa fa-file-pdf" /> PDF</>}
            </button>
            <button className="as-btn-add" onClick={openAdd}>
              <i className="fa fa-plus" /> Add Asset
            </button>
          </div>
        </div>
      </div>

      {/* ── Summary Cards ──────────────────────────────────── */}
      <div className="as-summary-grid">
        <div className="as-stat total-assets-stat">
          <div className="as-stat-bg-icon"><i className="fa fa-boxes-stacked" /></div>
          <div className="as-stat-label">Total Assets</div>
          <div className="as-stat-value">{totals.count || 0}</div>
          <div className="as-stat-sub">{totals.activeCount || 0} active</div>
        </div>
        <div className="as-stat purchase-stat">
          <div className="as-stat-bg-icon"><i className="fa fa-receipt" /></div>
          <div className="as-stat-label">Total Purchase Value</div>
          <div className="as-stat-value">{fmtAmt(totals.purchaseVal)}</div>
          <div className="as-stat-sub">Original cost</div>
        </div>
        <div className="as-stat current-stat">
          <div className="as-stat-bg-icon"><i className="fa fa-wallet" /></div>
          <div className="as-stat-label">Current Value</div>
          <div className="as-stat-value">{fmtAmt(totals.currentVal)}</div>
          <div className="as-stat-sub">Estimated today</div>
        </div>
        <div className={`as-stat ${(totals.depreciation || 0) > 0 ? 'depr-stat' : 'gain-stat'}`}>
          <div className="as-stat-bg-icon"><i className={`fa ${(totals.depreciation||0) > 0 ? 'fa-arrow-trend-down' : 'fa-arrow-trend-up'}`} /></div>
          <div className="as-stat-label">Depreciation</div>
          <div className="as-stat-value">{fmtAmt(Math.abs(totals.depreciation || 0))}</div>
          <div className="as-stat-sub">{(totals.depreciation||0) >= 0 ? 'Value lost' : 'Value gained'}</div>
        </div>
      </div>

      {/* ── Toolbar ────────────────────────────────────────── */}
      <div className="as-toolbar">
        {/* Search */}
        <div className="as-search-wrap">
          <i className="fa fa-magnifying-glass as-search-ico" />
          <input
            className="as-search"
            name="search"
            placeholder="Search by name, tag, project, location…"
            value={filters.search}
            onChange={fch}
          />
          {filters.search && <button className="as-search-clear" onClick={() => setFilters(f => ({ ...f, search: '' }))}><i className="fa fa-xmark" /></button>}
        </div>

        {/* Filter toggle */}
        <button
          className={`as-filter-btn${showFilters ? ' active' : ''}${filterCount > 0 ? ' has-filters' : ''}`}
          onClick={() => setShowFilters(s => !s)}>
          <i className="fa fa-sliders" />
          Filters
          {filterCount > 0 && <span className="filter-count">{filterCount}</span>}
        </button>

        {/* Sort */}
        <div className="as-sort-wrap">
          <select className="as-sort-sel" name="sort" value={filters.sort} onChange={fch}>
            {SORT_OPTS.map(o => <option key={o.val} value={o.val}>{o.label}</option>)}
          </select>
          <button
            className="as-sort-dir"
            onClick={() => setFilters(f => ({ ...f, dir: f.dir === 'asc' ? 'desc' : 'asc' }))}
            title={filters.dir === 'asc' ? 'Ascending' : 'Descending'}>
            <i className={`fa fa-sort-${filters.dir === 'asc' ? 'up' : 'down'}`} />
          </button>
        </div>

        {/* View toggle */}
        <div className="as-view-toggle">
          <button className={`vt-btn${viewMode === 'grid' ? ' active' : ''}`} onClick={() => setViewMode('grid')} title="Grid View">
            <i className="fa fa-grip" />
          </button>
          <button className={`vt-btn${viewMode === 'table' ? ' active' : ''}`} onClick={() => setViewMode('table')} title="Table View">
            <i className="fa fa-table-list" />
          </button>
        </div>

        {/* Result count */}
        {!loading && (
          <span className="as-result-count">{assets.length} asset{assets.length !== 1 ? 's' : ''}</span>
        )}
      </div>

      {/* ── Filter Panel ───────────────────────────────────── */}
      {showFilters && (
        <div className="as-filter-panel">
          <div className="afp-header">
            <span><i className="fa fa-sliders" /> Filter Assets</span>
            {filterCount > 0 && (
              <button className="afp-clear" onClick={resetFilters}><i className="fa fa-rotate-left" /> Clear all ({filterCount})</button>
            )}
          </div>
          <div className="afp-grid">
            {/* Category */}
            <div className="afp-group">
              <div className="afp-label">Category</div>
              <div className="afp-pill-row">
                <button className={`afp-pill${!filters.category ? ' sel' : ''}`} onClick={() => setFilters(f=>({...f,category:''}))}>All</button>
                {Object.entries(CATEGORIES).map(([k,v])=>(
                  <button key={k} className={`afp-pill ${v.color}${filters.category===k?' sel':''}`}
                    onClick={() => setFilters(f=>({...f,category:filters.category===k?'':k}))}>
                    <i className={`fa ${v.icon}`} /> {v.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Condition */}
            <div className="afp-group">
              <div className="afp-label">Condition</div>
              <div className="afp-pill-row">
                <button className={`afp-pill${!filters.condition ? ' sel' : ''}`} onClick={() => setFilters(f=>({...f,condition:''}))}>All</button>
                {Object.entries(CONDITIONS).map(([k,v])=>(
                  <button key={k} className={`afp-pill ${v.cls}${filters.condition===k?' sel':''}`}
                    onClick={() => setFilters(f=>({...f,condition:filters.condition===k?'':k}))}>
                    {v.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Resale Chance */}
            <div className="afp-group">
              <div className="afp-label">Resale Chance</div>
              <div className="afp-pill-row">
                <button className={`afp-pill${!filters.resale_chance ? ' sel' : ''}`} onClick={() => setFilters(f=>({...f,resale_chance:''}))}>All</button>
                {Object.entries(RESALE).map(([k,v])=>(
                  <button key={k} className={`afp-pill ${v.cls}${filters.resale_chance===k?' sel':''}`}
                    onClick={() => setFilters(f=>({...f,resale_chance:filters.resale_chance===k?'':k}))}>
                    {v.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Status */}
            <div className="afp-group">
              <div className="afp-label">Status</div>
              <div className="afp-pill-row">
                <button className={`afp-pill${!filters.status ? ' sel' : ''}`} onClick={() => setFilters(f=>({...f,status:''}))}>All</button>
                {Object.entries(STATUSES).map(([k,v])=>(
                  <button key={k} className={`afp-pill ${v.cls}${filters.status===k?' sel':''}`}
                    onClick={() => setFilters(f=>({...f,status:filters.status===k?'':k}))}>
                    {v.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Value Range */}
            <div className="afp-group afp-range-group">
              <div className="afp-label">Current Value Range</div>
              <div className="afp-range-row">
                <div className="afp-range-field">
                  <span>Min</span>
                  <div className="afp-range-wrap"><i className="fa fa-indian-rupee-sign afp-range-ico" />
                    <input className="afp-range-input" type="number" name="val_min" value={filters.val_min} onChange={fch} placeholder="0" />
                  </div>
                </div>
                <div className="afp-range-sep">—</div>
                <div className="afp-range-field">
                  <span>Max</span>
                  <div className="afp-range-wrap"><i className="fa fa-indian-rupee-sign afp-range-ico" />
                    <input className="afp-range-input" type="number" name="val_max" value={filters.val_max} onChange={fch} placeholder="Any" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Content ────────────────────────────────────────── */}
      <div className="as-content-card">
        {loading ? (
          <div className="as-state"><i className="fa fa-spinner fa-spin" /> Loading assets…</div>
        ) : assets.length === 0 ? (
          <div className="as-state">
            <i className="fa fa-boxes-stacked" style={{ fontSize: '2.5rem', color: '#f97316', display: 'block', marginBottom: 12 }} />
            {filterCount > 0 || filters.search ? 'No assets match the current filters.' : 'No assets yet. Click "Add Asset" to get started.'}
            {(filterCount > 0 || filters.search) && (
              <button className="as-clear-link" onClick={resetFilters}><i className="fa fa-rotate-left" /> Clear filters</button>
            )}
          </div>
        ) : viewMode === 'grid' ? (
          <div className="as-grid">{assets.map(a => renderCard(a))}</div>
        ) : (
          <div className="as-table-wrap">
            <table className="as-table">
              <thead>
                <tr>
                  <th>#</th><th>Asset</th><th>Category</th><th>Project / Location</th>
                  <th>Purchase Date</th><th>Purchase Value</th><th>Current Value</th>
                  <th>Depreciation</th><th>Condition</th><th>Resale</th><th>Status</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>{assets.map((a, i) => renderTableRow(a, i))}</tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Asset Form Modal ────────────────────────────────── */}
      {modal === 'form' && (
        <div className="am-overlay" onClick={e => e.target === e.currentTarget && closeModal()}>
          <div className="am-box">
            <div className="am-hdr">
              <div className="am-hdr-icon"><i className="fa fa-boxes-stacked" /></div>
              <div>
                <div className="am-title">{editAsset ? 'Edit Asset' : 'Add New Asset'}</div>
                <div className="am-sub">{editAsset ? `Editing: ${editAsset.name}` : 'Enter asset details'}</div>
              </div>
              <button className="am-close" onClick={closeModal}><i className="fa fa-xmark" /></button>
            </div>
            <div className="am-body">
              {/* Name + Tag */}
              <div className="af-row">
                <div className="af-field">
                  <label className="af-label">Asset Name *</label>
                  <div className="af-wrap"><i className="fa fa-box af-ico" />
                    <input name="name" className="af-input" value={form.name} onChange={fc} placeholder="e.g. Dell Laptop XPS 15" autoFocus />
                  </div>
                </div>
                <div className="af-field">
                  <label className="af-label">Asset Tag / Serial No.</label>
                  <div className="af-wrap"><i className="fa fa-tag af-ico" />
                    <input name="asset_tag" className="af-input" value={form.asset_tag} onChange={fc} placeholder="SN-2024-001" />
                  </div>
                </div>
              </div>

              {/* Category */}
              <div className="af-field">
                <label className="af-label">Category</label>
                <div className="as-type-grid">
                  {Object.entries(CATEGORIES).map(([k, v]) => (
                    <button key={k} type="button"
                      className={`astype-btn ${v.color}${form.category === k ? ' selected' : ''}`}
                      onClick={() => { setForm(f => ({ ...f, category: k })); setError(''); }}>
                      <i className={`fa ${v.icon}`} /><span>{v.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Project + Location */}
              <div className="af-row">
                <div className="af-field">
                  <label className="af-label">Project / Department</label>
                  <div className="af-wrap"><i className="fa fa-folder-open af-ico" />
                    <input name="project" className="af-input" value={form.project} onChange={fc} placeholder="e.g. Head Office, Site A" />
                  </div>
                </div>
                <div className="af-field">
                  <label className="af-label">Storage Location</label>
                  <div className="af-wrap"><i className="fa fa-location-dot af-ico" />
                    <input name="location" className="af-input" value={form.location} onChange={fc} placeholder="e.g. Room 201, Warehouse" />
                  </div>
                </div>
              </div>

              {/* Purchase details */}
              <div className="af-row">
                <div className="af-field">
                  <label className="af-label">Purchase Date</label>
                  <input name="purchase_date" className="af-input" type="date" value={form.purchase_date} onChange={fc} />
                </div>
                <div className="af-field">
                  <label className="af-label">Purchase Value</label>
                  <div className="af-wrap"><i className="fa fa-indian-rupee-sign af-ico" />
                    <input name="purchase_value" className="af-input" type="number" value={form.purchase_value} onChange={fc} placeholder="50000" />
                  </div>
                </div>
                <div className="af-field">
                  <label className="af-label">Current Value</label>
                  <div className="af-wrap"><i className="fa fa-indian-rupee-sign af-ico" />
                    <input name="current_value" className="af-input" type="number" value={form.current_value} onChange={fc} placeholder="35000" />
                  </div>
                </div>
              </div>

              {/* Condition */}
              <div className="af-field">
                <label className="af-label">Condition</label>
                <div className="cond-grid">
                  {Object.entries(CONDITIONS).map(([k, v]) => (
                    <button key={k} type="button"
                      className={`cond-btn ${v.cls}${form.condition === k ? ' selected' : ''}`}
                      onClick={() => { setForm(f => ({ ...f, condition: k })); setError(''); }}>
                      {v.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Resale + Status */}
              <div className="af-row">
                <div className="af-field">
                  <label className="af-label">Resale Chance</label>
                  <div className="rs-grid">
                    {Object.entries(RESALE).map(([k, v]) => (
                      <button key={k} type="button"
                        className={`rs-btn ${v.cls}${form.resale_chance === k ? ' selected' : ''}`}
                        onClick={() => { setForm(f => ({ ...f, resale_chance: k })); setError(''); }}>
                        {v.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="af-field">
                  <label className="af-label">Status</label>
                  <select name="status" className="af-input" value={form.status} onChange={fc}>
                    {Object.entries(STATUSES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
              </div>

              {/* Photo */}
              <div className="af-field">
                <label className="af-label">Asset Photo</label>
                <div className="photo-upload-area">
                  {photoPreview ? (
                    <div className="photo-preview-wrap">
                      <img src={photoPreview} alt="Preview" className="photo-preview-img" />
                      <div className="photo-preview-actions">
                        <button type="button" className="pp-btn pp-change" onClick={() => fileRef.current && fileRef.current.click()}>
                          <i className="fa fa-camera" /> Change
                        </button>
                        <button type="button" className="pp-btn pp-remove" onClick={handleRemovePhoto}>
                          <i className="fa fa-trash" /> Remove
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="photo-drop-zone" onClick={() => fileRef.current && fileRef.current.click()}>
                      <i className="fa fa-camera" />
                      <p>Click to upload asset photo</p>
                      <span>JPG, PNG, WEBP — max 8 MB</span>
                    </div>
                  )}
                  <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileChange} />
                </div>
              </div>

              {/* Notes */}
              <div className="af-field">
                <label className="af-label">Notes</label>
                <textarea name="notes" className="af-input af-textarea" value={form.notes} onChange={fc} rows={2} placeholder="Warranty info, serial notes, etc." />
              </div>

              {error && <div className="af-error"><i className="fa fa-circle-exclamation" /> {error}</div>}
            </div>
            <div className="am-footer">
              <button className="am-cancel" onClick={closeModal} disabled={saving}>Cancel</button>
              <button className="am-save" onClick={handleSave} disabled={saving}>
                {saving ? <><i className="fa fa-spinner fa-spin" /> Saving…</> : <><i className="fa fa-check" /> {editAsset ? 'Save Changes' : 'Add Asset'}</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Photo Lightbox ──────────────────────────────────── */}
      {modal === 'photo' && viewPhoto && (
        <div className="lightbox-overlay" onClick={() => setModal(null)}>
          <button className="lb-close" onClick={() => setModal(null)}><i className="fa fa-xmark" /></button>
          <img src={viewPhoto} alt="Asset" className="lightbox-img" onClick={e => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}
