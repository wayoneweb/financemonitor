import React, { useEffect } from 'react';
import $ from 'jquery';

export default function Modal({ title, children, footer, onClose, size = '' }) {
  useEffect(() => {
    $('body').css('overflow', 'hidden');
    return () => $('body').css('overflow', '');
  }, []);

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal-box ${size}`}>
        <div className="modal-header">
          <h3 className="modal-title">{title}</h3>
          <button className="modal-close" onClick={onClose}><i className="fa fa-xmark" /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}
