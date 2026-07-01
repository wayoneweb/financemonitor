import React, { useState, useEffect } from 'react';
import './Home.css';

export default function Home({ onEnter }) {
  // Longer splash so animations can be seen fully
  const [phase, setPhase] = useState('logo');

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('logo-exit'), 5200);
    const t2 = setTimeout(() => setPhase('content'),   5900);
    const t3 = setTimeout(() => setPhase('cta'),       7000);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  const logoGone   = phase !== 'logo' && phase !== 'logo-exit';
  const contentIn  = phase === 'content' || phase === 'cta';
  const ctaIn      = phase === 'cta';

  return (
    <div className="home-page">
      <div className="home-deco home-deco-1" />
      <div className="home-deco home-deco-2" />
      <div className="home-deco home-deco-3" />

      {/* ── Logo Splash ──────────────────────────────────────── */}
      <div className={`home-logo-block${phase === 'logo-exit' ? ' logo-exiting' : ''}${logoGone ? ' logo-gone' : ''}`}>

        {/* Ambient glow ring behind logo */}
        <div className="home-logo-glow-ring" />

        {/* Logo container (no overflow:hidden so drop-shadow is not clipped) */}
        <div className="home-logo-container">
          <img
            src="/logo-badge.png"
            alt="Wayone Technologies"
            className="home-logo-img"
          />
          {/* Shine sweep — clipped to circle via clip-path */}
          <div className="home-logo-shine" aria-hidden="true" />
        </div>
      </div>

      {/* ── Home Content ─────────────────────────────────────── */}
      <div className={`home-content-block${contentIn ? ' content-in' : ''}`}>

        {/* Rectangular wordmark replaces the "Welcome to..." text */}
        <img
          src="/logo-brand.png"
          alt="Wayone Technologies"
          className="home-brand-img"
        />

        <p className="home-slogan">Expert Solutions, One True Way.</p>
        <div className="home-divider" />
        <p className="home-product-label">Wayone Business Mate</p>

        <div className={`home-cta${ctaIn ? ' cta-in' : ''}`}>
          <button className="home-btn" onClick={onEnter}>
            <i className="fa fa-right-to-bracket" />
            Sign In to Your Account
          </button>
          <p className="home-secure">
            <i className="fa fa-shield-halved" /> Secured &mdash; authorised access only
          </p>
        </div>
      </div>
    </div>
  );
}
