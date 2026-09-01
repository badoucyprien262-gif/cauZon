import React, { useState } from 'react';
import { ShieldCheck, ArrowRight } from 'lucide-react';

interface AuthGateProps {
  onAuthenticated: () => void;
  darkMode: boolean;
}

export function AuthGate({ onAuthenticated, darkMode }: AuthGateProps) {
  const [secretKey, setSecretKey] = useState('');
  const [authError, setAuthError] = useState('');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const serverSecret = (import.meta as any).env?.VITE_ADMIN_SECRET_KEY || 'cauZonAdmin2026';
    if (secretKey === serverSecret) {
      localStorage.setItem('CAUZON_ADMIN_AUTH', 'true');
      sessionStorage.setItem('CAUZON_ADMIN_AUTH', 'true');
      onAuthenticated();
    } else {
      setAuthError("Code d'accès incorrect. Veuillez réessayer.");
    }
  };

  const bg = darkMode ? '#121212' : '#F3F4F6';
  const cardBg = darkMode ? '#1e1e1e' : '#FFFFFF';
  const textColor = darkMode ? '#FFFFFF' : '#1F2937';
  const borderColor = darkMode ? '#27272A' : '#D1D5DB';

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', backgroundColor: bg, fontFamily: 'Inter, sans-serif' }}>
      <form onSubmit={handleLogin} style={{ width: '100%', maxWidth: '420px', padding: '40px', backgroundColor: cardBg, borderRadius: '16px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)', border: `1px solid ${borderColor}` }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <span style={{ display: 'inline-flex', padding: '12px', backgroundColor: '#6B1124', borderRadius: '12px', marginBottom: '16px', color: '#FFFFFF' }}>
            <ShieldCheck size={32} />
          </span>
          <h2 style={{ fontSize: '26px', color: '#6B1124', fontFamily: 'Outfit, sans-serif', fontWeight: 700 }}>cauZon Admin Panel</h2>
          <p style={{ fontSize: '14px', color: darkMode ? '#9CA3AF' : '#6B7280', marginTop: '6px' }}>Accès sécurisé réservé aux administrateurs</p>
        </div>
        <div style={{ marginBottom: '24px' }}>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', color: textColor, marginBottom: '8px', letterSpacing: '0.5px' }}>
            Clé d'Accès Secrète
          </label>
          <input
            type="password"
            placeholder="Saisissez la clé d'administration"
            value={secretKey}
            onChange={(e) => setSecretKey(e.target.value)}
            style={{ width: '100%', padding: '14px 16px', borderRadius: '8px', border: `1px solid ${borderColor}`, backgroundColor: darkMode ? '#121212' : '#FFFFFF', color: textColor, fontSize: '15px', outline: 'none', boxSizing: 'border-box' }}
            required
          />
          {authError && <p style={{ color: '#E74C3C', fontSize: '13px', marginTop: '8px', fontWeight: 500 }}>{authError}</p>}
        </div>
        <button type="submit" style={{ width: '100%', padding: '14px', backgroundColor: '#6B1124', color: '#FFFFFF', border: 'none', borderRadius: '8px', fontWeight: 'bold', fontSize: '15px', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
          S'authentifier <ArrowRight size={18} />
        </button>
      </form>
    </div>
  );
}
