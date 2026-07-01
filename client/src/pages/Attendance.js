import React, { useState, useEffect, useCallback, useContext } from 'react';
import { hrApi, projectsApi } from '../api';
import { ToastContext } from '../App';
import './Attendance.css';

const STATUS_OPTS = [
  { value: 'present',  label: 'P',  title: 'Present',  color: '#10b981' },
  { value: 'absent',   label: 'A',  title: 'Absent',   color: '#ef4444' },
  { value: 'half_day', label: 'H',  title: 'Half Day', color: '#f59e0b' },
  { value: 'leave',    label: 'L',  title: 'Leave',    color: '#3b82f6' },
  { value: 'holiday',  label: 'Ho', title: 'Holiday',  color: '#8b5cf6' },
];

const STATUS_MAP = {};
STATUS_OPTS.forEach(o => { STATUS_MAP[o.value] = o; });

const TODAY = new Date();

export default function Attendance() {
  const showToast = useContext(ToastContext);

  const [month, setMonth]       = useState(TODAY.getMonth() + 1);
  const [year, setYear]         = useState(TODAY.getFullYear());
  const [projects, setProjects] = useState([]);
  const [projectFilter, setProjectFilter] = useState('');
  const [staffList, setStaffList] = useState([]);
  const [attMap, setAttMap]     = useState({});   // staffId -> dateStr -> status
  const [modified, setModified] = useState({});   // same shape, only changed
  const [saving, setSaving]     = useState(false);
  const [loading, setLoading]   = useState(false);

  const daysInMonth = new Date(year, month, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const isSunday = (d) => new Date(year, month - 1, d).getDay() === 0;

  useEffect(() => {
    projectsApi.list().then(d => setProjects(d || [])).catch(() => {});
  }, []);

  const loadData = useCallback(() => {
    setLoading(true);
    const p = { month, year };
    if (projectFilter) p.project_id = projectFilter;

    Promise.all([
      hrApi.staff(projectFilter ? { project_id: projectFilter, status: 'active' } : { status: 'active' }),
      hrApi.attendance(p),
    ]).then(([staffData, attData]) => {
      setStaffList(staffData || []);
      const map = {};
      (staffData || []).forEach(s => { map[s.id] = {}; });
      (attData || []).forEach(a => {
        if (map[a.staff_id]) map[a.staff_id][a.date] = a.status;
      });
      setAttMap(map);
      setModified({});
    }).catch(() => showToast('Failed to load attendance', 'error'))
      .finally(() => setLoading(false));
  }, [month, year, projectFilter, showToast]);

  useEffect(() => { loadData(); }, [loadData]);

  const getStatus = (staffId, day) => {
    const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    return (modified[staffId] && modified[staffId][dateStr]) ||
           (attMap[staffId] && attMap[staffId][dateStr]) || '';
  };

  const cycleStatus = (staffId, day) => {
    if (isSunday(day)) return;
    const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const current = getStatus(staffId, day);
    const idx = STATUS_OPTS.findIndex(o => o.value === current);
    const next = idx >= STATUS_OPTS.length - 1 ? '' : STATUS_OPTS[idx + 1].value;

    setModified(prev => {
      const staffMod = { ...(prev[staffId] || {}) };
      if (next === '') {
        delete staffMod[dateStr];
      } else {
        staffMod[dateStr] = next;
      }
      return { ...prev, [staffId]: staffMod };
    });
  };

  const setAllForDay = (day, status) => {
    if (isSunday(day)) return;
    const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    setModified(prev => {
      const next = { ...prev };
      staffList.forEach(s => {
        next[s.id] = { ...(next[s.id] || {}), [dateStr]: status };
      });
      return next;
    });
  };

  const markAllPresentForMonth = () => {
    const next = {};
    staffList.forEach(s => {
      next[s.id] = {};
      days.forEach(d => {
        if (!isSunday(d)) {
          const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
          next[s.id][dateStr] = 'present';
        }
      });
    });
    setModified(next);
  };

  const saveChanges = async () => {
    const records = [];
    Object.entries(modified).forEach(([staffId, dates]) => {
      Object.entries(dates).forEach(([date, status]) => {
        if (status) records.push({ staff_id: parseInt(staffId), date, status });
      });
    });

    // Handle deletions (status cleared from modified)
    const deletions = [];
    Object.entries(modified).forEach(([staffId, dates]) => {
      Object.entries(dates).forEach(([date, status]) => {
        if (!status && attMap[staffId] && attMap[staffId][date]) {
          deletions.push({ staff_id: parseInt(staffId), date });
        }
      });
    });

    if (records.length === 0 && deletions.length === 0) {
      return showToast('No changes to save', 'error');
    }

    setSaving(true);
    try {
      if (records.length > 0) await hrApi.attendanceSave(records);
      for (const d of deletions) await hrApi.attendanceDel(d.staff_id, d.date);
      showToast(`Saved ${records.length} attendance record(s)`);
      loadData();
    } catch (e) {
      showToast(e?.error || 'Failed to save', 'error');
    } finally {
      setSaving(false);
    }
  };

  const modCount = Object.values(modified).reduce((s, d) => s + Object.keys(d).length, 0);

  const getSummary = (staffId) => {
    const merged = { ...(attMap[staffId] || {}), ...(modified[staffId] || {}) };
    const counts = { present: 0, absent: 0, half_day: 0, leave: 0, holiday: 0 };
    Object.values(merged).forEach(st => { if (counts[st] !== undefined) counts[st]++; });
    return counts;
  };

  const monthName = new Date(year, month - 1, 1).toLocaleString('default', { month: 'long' });

  return (
    <div className="att-page">
      {/* Toolbar */}
      <div className="att-toolbar">
        <div className="att-toolbar-left">
          <h2 className="att-title">Attendance</h2>
          <div className="att-month-selector">
            <button className="att-nav-btn" onClick={() => {
              if (month === 1) { setMonth(12); setYear(y => y - 1); }
              else setMonth(m => m - 1);
            }}><i className="fa fa-chevron-left" /></button>
            <span className="att-month-label">{monthName} {year}</span>
            <button className="att-nav-btn" onClick={() => {
              if (month === 12) { setMonth(1); setYear(y => y + 1); }
              else setMonth(m => m + 1);
            }}><i className="fa fa-chevron-right" /></button>
          </div>
        </div>
        <div className="att-toolbar-right">
          <select className="att-filter-sel" value={projectFilter} onChange={e => setProjectFilter(e.target.value)}>
            <option value="">All Projects</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button className="att-btn-secondary" onClick={markAllPresentForMonth} title="Mark all staff present for all weekdays">
            <i className="fa fa-check-double" /> Mark All Present
          </button>
          <button className="att-btn-save" onClick={saveChanges} disabled={saving || modCount === 0}>
            {saving ? <><i className="fa fa-spinner fa-spin" /> Saving…</> : <><i className="fa fa-floppy-disk" /> Save {modCount > 0 ? `(${modCount})` : ''}</>}
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="att-legend">
        {STATUS_OPTS.map(o => (
          <span key={o.value} className="att-legend-item">
            <span className="att-cell-badge" style={{ background: o.color }}>{o.label}</span>
            <span>{o.title}</span>
          </span>
        ))}
        <span className="att-legend-item">
          <span className="att-cell-badge" style={{ background: '#e2e8f0', color: '#94a3b8' }}>—</span>
          <span>Not marked</span>
        </span>
        <span className="att-legend-tip"><i className="fa fa-info-circle" /> Click cell to cycle status</span>
      </div>

      {/* Grid */}
      <div className="att-grid-wrap">
        {loading ? (
          <div className="att-loading"><i className="fa fa-spinner fa-spin" /> Loading…</div>
        ) : staffList.length === 0 ? (
          <div className="att-empty">
            <i className="fa fa-users" />
            <p>No active staff found</p>
          </div>
        ) : (
          <table className="att-table">
            <thead>
              <tr>
                <th className="att-th att-th-name">Staff</th>
                {days.map(d => (
                  <th key={d} className={`att-th att-th-day${isSunday(d) ? ' att-th-sunday' : ''}`}>
                    <div className="att-day-num">{d}</div>
                    <div className="att-day-of-week">{['S','M','T','W','T','F','S'][new Date(year, month-1, d).getDay()]}</div>
                    {!isSunday(d) && (
                      <div className="att-col-actions">
                        <button title="All Present" className="att-col-btn" onClick={() => setAllForDay(d, 'present')}>P</button>
                        <button title="All Absent" className="att-col-btn att-col-btn-a" onClick={() => setAllForDay(d, 'absent')}>A</button>
                      </div>
                    )}
                  </th>
                ))}
                <th className="att-th att-th-summary">Summary</th>
              </tr>
            </thead>
            <tbody>
              {staffList.map(s => {
                const summary = getSummary(s.id);
                return (
                  <tr key={s.id} className="att-row">
                    <td className="att-td att-td-name">
                      <div className="att-staff-name">
                        {s.photo
                          ? <img className="att-staff-thumb" src={`/api/uploads/${s.photo}`} alt={s.name} />
                          : <span className="att-staff-initial">{s.name.charAt(0)}</span>}
                        <div>
                          <div className="att-sname">{s.name}</div>
                          {s.employee_id && <div className="att-seid">{s.employee_id}</div>}
                        </div>
                      </div>
                    </td>
                    {days.map(d => {
                      const st = getStatus(s.id, d);
                      const opt = STATUS_MAP[st];
                      const isChanged = modified[s.id] && modified[s.id][`${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`] !== undefined;
                      return (
                        <td
                          key={d}
                          className={`att-td att-td-cell${isSunday(d) ? ' att-cell-sunday' : ''}${isChanged ? ' att-cell-modified' : ''}`}
                          onClick={() => cycleStatus(s.id, d)}
                          title={opt ? `${opt.title}${isChanged ? ' (modified)' : ''}` : ''}
                        >
                          {opt ? (
                            <span className="att-cell-badge" style={{ background: opt.color }}>{opt.label}</span>
                          ) : isSunday(d) ? (
                            <span className="att-cell-badge att-cell-sun">S</span>
                          ) : (
                            <span className="att-cell-empty">—</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="att-td att-td-summary">
                      <div className="att-summary-pills">
                        {summary.present > 0 && <span className="att-pill att-pill-p">{summary.present}P</span>}
                        {summary.absent  > 0 && <span className="att-pill att-pill-a">{summary.absent}A</span>}
                        {summary.half_day> 0 && <span className="att-pill att-pill-h">{summary.half_day}H</span>}
                        {summary.leave   > 0 && <span className="att-pill att-pill-l">{summary.leave}L</span>}
                        {summary.holiday > 0 && <span className="att-pill att-pill-ho">{summary.holiday}Ho</span>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
