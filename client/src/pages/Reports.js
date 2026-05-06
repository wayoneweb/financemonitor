import React, { useState, useEffect, useContext, useRef } from 'react';
import { projectsApi, exportApi, importApi } from '../api';
import { ToastContext } from '../App';

const today = () => new Date().toISOString().slice(0, 10);
const firstOfYear = () => new Date().getFullYear() + '-01-01';

export default function Reports() {
  const showToast = useContext(ToastContext);
  const fileRef = useRef(null);

  const [projects, setProjects] = useState([]);
  const [exportFilters, setExportFilters] = useState({ type: '', project_id: '', date_from: firstOfYear(), date_to: today(), status: '' });
  const [excelLoading, setExcelLoading] = useState(false);
  const [pdfLoading,   setPdfLoading]   = useState(false);

  const [importFile, setImportFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [importing, setImporting] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [dragover, setDragover] = useState(false);

  useEffect(() => { projectsApi.list().done(setProjects); }, []);

  const setEF = (k, v) => setExportFilters((f) => ({ ...f, [k]: v }));

  const cleanFilters = () => {
    const f = {};
    Object.entries(exportFilters).forEach(([k, v]) => { if (v) f[k] = v; });
    return f;
  };

  // ── Core download helper (fetch → Blob → anchor click) ──────
  const triggerDownload = async (url, filename, setLoading) => {
    setLoading(true);
    try {
      const res = await fetch(url);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Server error ${res.status}`);
      }
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objUrl);
      showToast(`${filename} downloaded successfully!`);
    } catch (err) {
      showToast('Download failed: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleExcelExport = () => {
    const ts = new Date().toISOString().slice(0, 10);
    triggerDownload(exportApi.excelUrl(cleanFilters()), `finance-report-${ts}.xlsx`, setExcelLoading);
  };

  const handlePdfExport = () => {
    const ts = new Date().toISOString().slice(0, 10);
    triggerDownload(exportApi.pdfUrl(cleanFilters()), `finance-report-${ts}.pdf`, setPdfLoading);
  };

  const handleTemplate = () => {
    triggerDownload(exportApi.templateUrl(), 'finance-import-template.xlsx', () => {});
  };

  const handlePreview = () => {
    if (!importFile) return;
    const fd = new FormData();
    fd.append('file', importFile);
    setPreviewing(true);
    importApi.preview(fd)
      .done((data) => setPreview(data))
      .fail((xhr) => showToast(xhr.responseJSON?.error || 'Preview failed', 'error'))
      .always(() => setPreviewing(false));
  };

  const handleImport = () => {
    if (!importFile || !preview) return;
    if (!window.confirm(`Import ${preview.valid?.length} transactions? This cannot be undone.`)) return;
    const fd = new FormData();
    fd.append('file', importFile);
    setImporting(true);
    importApi.confirm(fd)
      .done((data) => {
        showToast(`Successfully imported ${data.inserted} transactions!`);
        setImportFile(null);
        setPreview(null);
        if (fileRef.current) fileRef.current.value = '';
      })
      .fail((xhr) => showToast(xhr.responseJSON?.error || 'Import failed', 'error'))
      .always(() => setImporting(false));
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Reports <span>Export &amp; Import</span></h1>
      </div>

      <div className="reports-grid">

        {/* ── Export Section ───────────────────────────────────────── */}
        <div>
          <div className="card">
            <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
              <i className="fa fa-file-export" style={{ color: '#2563eb' }} /> Export Report
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="form-group">
                <label className="form-label">Transaction Type</label>
                <select className="form-control" value={exportFilters.type} onChange={(e) => setEF('type', e.target.value)}>
                  <option value="">All Types</option>
                  <option value="income">Income Only</option>
                  <option value="expense">Expense Only</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Project</label>
                <select className="form-control" value={exportFilters.project_id} onChange={(e) => setEF('project_id', e.target.value)}>
                  <option value="">All Projects</option>
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Status</label>
                <select className="form-control" value={exportFilters.status} onChange={(e) => setEF('status', e.target.value)}>
                  <option value="">All Statuses</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="pending">Pending</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">Date From</label>
                  <input type="date" className="form-control" value={exportFilters.date_from} onChange={(e) => setEF('date_from', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Date To</label>
                  <input type="date" className="form-control" value={exportFilters.date_to} onChange={(e) => setEF('date_to', e.target.value)} />
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, marginTop: 22 }}>
              <button
                className="btn btn-success" style={{ flex: 1 }}
                onClick={handleExcelExport}
                disabled={excelLoading || pdfLoading}
              >
                {excelLoading
                  ? <><i className="fa fa-spinner fa-spin" /> Generating…</>
                  : <><i className="fa fa-file-excel" /> Export Excel</>}
              </button>
              <button
                className="btn btn-danger" style={{ flex: 1 }}
                onClick={handlePdfExport}
                disabled={excelLoading || pdfLoading}
              >
                {pdfLoading
                  ? <><i className="fa fa-spinner fa-spin" /> Generating…</>
                  : <><i className="fa fa-file-pdf" /> Export PDF</>}
              </button>
            </div>

            <div style={{ marginTop: 14, padding: '12px 14px', background: '#f8fafc', borderRadius: 8, fontSize: '0.8rem', color: '#64748b' }}>
              <i className="fa fa-circle-info" style={{ color: '#3b82f6' }} /> Excel export includes all columns, totals, and color-coded rows. PDF export generates a formatted landscape report suitable for sharing.
            </div>
          </div>
        </div>

        {/* ── Import Section ───────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card">
            <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <i className="fa fa-file-import" style={{ color: '#16a34a' }} /> Import from Excel
            </h2>

            <div style={{ marginBottom: 16 }}>
              <button className="btn btn-outline" onClick={handleTemplate} style={{ width: '100%' }}>
                <i className="fa fa-download" /> Download Import Template
              </button>
              <p style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: 6, textAlign: 'center' }}>
                Fill the template, then upload it below. Projects and categories are auto-created if they don't exist.
              </p>
            </div>

            {/* File Drop */}
            <div
              className={`file-drop ${dragover ? 'dragover' : ''}`}
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragover(true); }}
              onDragLeave={() => setDragover(false)}
              onDrop={(e) => { e.preventDefault(); setDragover(false); const f = e.dataTransfer.files[0]; if (f) { setImportFile(f); setPreview(null); } }}
            >
              <i className="fa fa-file-excel" style={{ color: '#16a34a' }} />
              <p style={{ fontWeight: 600, color: '#475569' }}>Drop Excel file here or click to browse</p>
              <p style={{ fontSize: '0.78rem', color: '#94a3b8' }}>Supports .xlsx and .xls files</p>
              <input ref={fileRef} type="file" hidden accept=".xlsx,.xls" onChange={(e) => { if (e.target.files[0]) { setImportFile(e.target.files[0]); setPreview(null); } }} />
            </div>

            {importFile && (
              <div className="file-preview" style={{ marginTop: 12 }}>
                <i className="fa fa-file-excel" style={{ color: '#16a34a', fontSize: '1.8rem' }} />
                <div className="file-info">
                  <div className="file-name">{importFile.name}</div>
                  <div className="file-size">{(importFile.size / 1024).toFixed(1)} KB</div>
                </div>
                <button className="btn btn-ghost btn-xs" onClick={() => { setImportFile(null); setPreview(null); if (fileRef.current) fileRef.current.value = ''; }}>
                  <i className="fa fa-xmark" />
                </button>
              </div>
            )}

            {importFile && !preview && (
              <button className="btn btn-primary" style={{ width: '100%', marginTop: 12 }} onClick={handlePreview} disabled={previewing}>
                {previewing ? <><i className="fa fa-spinner fa-spin" /> Analyzing...</> : <><i className="fa fa-magnifying-glass" /> Preview Import</>}
              </button>
            )}
          </div>

          {/* Preview Results */}
          {preview && (
            <div className="card">
              <h3 style={{ fontWeight: 700, marginBottom: 14, color: '#1e293b' }}>
                <i className="fa fa-list-check" /> Import Preview
              </h3>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 16 }}>
                <div style={{ textAlign: 'center', background: '#f0fdf4', borderRadius: 8, padding: '10px' }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#16a34a' }}>{preview.valid?.length || 0}</div>
                  <div style={{ fontSize: '0.72rem', color: '#16a34a', fontWeight: 700, textTransform: 'uppercase' }}>Valid</div>
                </div>
                <div style={{ textAlign: 'center', background: '#fef2f2', borderRadius: 8, padding: '10px' }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#dc2626' }}>{preview.errors?.length || 0}</div>
                  <div style={{ fontSize: '0.72rem', color: '#dc2626', fontWeight: 700, textTransform: 'uppercase' }}>Errors</div>
                </div>
                <div style={{ textAlign: 'center', background: '#f8fafc', borderRadius: 8, padding: '10px' }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#475569' }}>{preview.total || 0}</div>
                  <div style={{ fontSize: '0.72rem', color: '#475569', fontWeight: 700, textTransform: 'uppercase' }}>Total Rows</div>
                </div>
              </div>

              {preview.errors?.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.82rem', color: '#dc2626', marginBottom: 6 }}>
                    <i className="fa fa-triangle-exclamation" /> Rows with errors (will be skipped):
                  </div>
                  <div style={{ maxHeight: 140, overflowY: 'auto', background: '#fef2f2', borderRadius: 8, padding: '10px 12px' }}>
                    {preview.errors.map((e, i) => (
                      <div key={i} style={{ fontSize: '0.8rem', color: '#dc2626', marginBottom: 3 }}>
                        Row {e.row}: {e.error}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {preview.valid?.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.82rem', color: '#16a34a', marginBottom: 6 }}>
                    <i className="fa fa-circle-check" /> Preview of valid rows:
                  </div>
                  <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                    <table style={{ fontSize: '0.78rem' }}>
                      <thead>
                        <tr>
                          <th>Type</th><th>Title</th><th>Amount</th><th>Date</th><th>Project</th><th>Category</th><th>Party</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.valid.slice(0, 8).map((r, i) => (
                          <tr key={i} className={`${r.type}-row`}>
                            <td><span className={`badge badge-${r.type}`}>{r.type}</span></td>
                            <td>{r.title}</td>
                            <td className={`amount-${r.type}`}>₹{Number(r.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                            <td>{r.date}</td>
                            <td>{r.project_name || '—'}</td>
                            <td>{r.category_name || '—'}</td>
                            <td>{r.party_name || '—'}</td>
                          </tr>
                        ))}
                        {preview.valid.length > 8 && (
                          <tr><td colSpan={7} style={{ textAlign: 'center', color: '#94a3b8', padding: '8px' }}>...and {preview.valid.length - 8} more rows</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => { setPreview(null); setImportFile(null); if (fileRef.current) fileRef.current.value = ''; }}>Cancel</button>
                <button className="btn btn-success" style={{ flex: 2 }} onClick={handleImport} disabled={importing || !preview.valid?.length}>
                  {importing ? <><i className="fa fa-spinner fa-spin" /> Importing...</> : <><i className="fa fa-upload" /> Confirm Import ({preview.valid?.length} rows)</>}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Quick Tips */}
      <div className="card" style={{ marginTop: 24 }}>
        <h3 style={{ fontWeight: 700, marginBottom: 14, color: '#1e293b' }}><i className="fa fa-lightbulb" style={{ color: '#f59e0b' }} /> Import Tips</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          {[
            ['fa-1', '#3b82f6', 'Download the template first — it includes sample rows and all supported columns.'],
            ['fa-2', '#8b5cf6', 'Type must be exactly "income" or "expense". Date must be YYYY-MM-DD format.'],
            ['fa-3', '#16a34a', 'Project and Category names are matched case-insensitively. New ones are auto-created.'],
            ['fa-4', '#f59e0b', 'Always use Preview before importing to catch formatting errors.'],
          ].map(([icon, color, text]) => (
            <div key={icon} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 12px', background: '#f8fafc', borderRadius: 8 }}>
              <i className={`fa ${icon}`} style={{ color, marginTop: 2, fontSize: '1rem' }} />
              <span style={{ fontSize: '0.82rem', color: '#475569', lineHeight: 1.5 }}>{text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
