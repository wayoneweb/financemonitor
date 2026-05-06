import React, { useEffect } from 'react';
import $ from 'jquery';

export default function Toast({ message, type, onClose }) {
  useEffect(() => {
    const t = setTimeout(() => {
      $('#app-toast').fadeOut(300, onClose);
    }, 3200);
    return () => clearTimeout(t);
  }, [onClose]);

  const icons = { success: 'fa-circle-check', error: 'fa-circle-xmark', warning: 'fa-triangle-exclamation', info: 'fa-circle-info' };
  const colors = { success: '#16a34a', error: '#dc2626', warning: '#d97706', info: '#2563eb' };

  return (
    <div id="app-toast" style={{
      position: 'fixed', bottom: '24px', right: '24px',
      background: '#fff', borderRadius: '12px',
      boxShadow: '0 8px 30px rgba(0,0,0,0.15)',
      padding: '14px 18px',
      display: 'flex', alignItems: 'center', gap: '12px',
      zIndex: 9999, minWidth: '280px', maxWidth: '400px',
      borderLeft: `4px solid ${colors[type] || colors.info}`,
      animation: 'slideUp 0.25s ease',
    }}>
      <i className={`fa ${icons[type] || icons.info}`} style={{ color: colors[type] || colors.info, fontSize: '1.2rem' }} />
      <span style={{ flex: 1, fontSize: '0.9rem', color: '#1e293b', fontWeight: 500 }}>{message}</span>
      <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '1rem' }}>
        <i className="fa fa-xmark" />
      </button>
    </div>
  );
}
