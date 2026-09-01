import React from 'react';
import { LayoutDashboard, BookOpen, Pencil, MessageSquare, Settings, Sun, Moon, LogOut } from 'lucide-react';
import type { ActiveView } from '../types';

interface BottomNavProps {
  activeView: ActiveView;
  onNavigate: (view: ActiveView) => void;
  unreadMessages: number;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  onLogout: () => void;
}

const TABS: { id: ActiveView; label: string; icon: React.ReactNode }[] = [
  { id: 'dashboard', label: 'Tableau de bord', icon: <LayoutDashboard size={22} /> },
  { id: 'catalog', label: 'Catalogue', icon: <BookOpen size={22} /> },
  { id: 'studio', label: 'Studio', icon: <Pencil size={22} /> },
  { id: 'messaging', label: 'Messages', icon: <MessageSquare size={22} /> },
  { id: 'settings', label: 'Paramètres', icon: <Settings size={22} /> },
];

export function BottomNav({ activeView, onNavigate, unreadMessages, darkMode, onToggleDarkMode, onLogout }: BottomNavProps) {
  const bg = darkMode ? '#1A0A0F' : '#FFFFFF';
  const border = darkMode ? '1px solid #2D1220' : '1px solid #E5E7EB';
  const textInactive = darkMode ? '#9CA3AF' : '#6B7280';

  return (
    <nav className="print-hide bottom-nav" style={{ position: 'fixed', bottom: 0, left: 0, right: 0, height: '64px', backgroundColor: bg, borderTop: border, display: 'flex', alignItems: 'stretch', zIndex: 100, boxShadow: '0 -2px 12px rgba(0,0,0,0.15)' }}>
      {TABS.map((tab) => {
        const isActive = activeView === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onNavigate(tab.id)}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '3px', border: 'none', background: 'none', cursor: 'pointer', color: isActive ? '#6B1124' : textInactive, position: 'relative', transition: 'color 0.2s' }}
          >
            {isActive && <span style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: '32px', height: '3px', backgroundColor: '#6B1124', borderRadius: '0 0 3px 3px' }} />}
            <span style={{ position: 'relative' }}>
              {tab.icon}
              {tab.id === 'messaging' && unreadMessages > 0 && (
                <span style={{ position: 'absolute', top: '-6px', right: '-8px', minWidth: '16px', height: '16px', borderRadius: '8px', backgroundColor: '#E74C3C', color: '#FFFFFF', fontSize: '10px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px' }}>
                  {unreadMessages > 99 ? '99+' : unreadMessages}
                </span>
              )}
            </span>
            <span style={{ fontSize: '10px', fontWeight: isActive ? 700 : 500 }}>{tab.label}</span>
          </button>
        );
      })}

      {/* Theme + Logout */}
      <div style={{ display: 'flex', flexDirection: 'column', borderLeft: border, padding: '4px' }}>
        <button onClick={onToggleDarkMode} style={{ flex: 1, background: 'none', border: 'none', cursor: 'pointer', color: textInactive, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px' }} title={darkMode ? 'Mode clair' : 'Mode sombre'}>
          {darkMode ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        <button onClick={onLogout} style={{ flex: 1, background: 'none', border: 'none', cursor: 'pointer', color: '#E74C3C', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px' }} title="Déconnexion">
          <LogOut size={16} />
        </button>
      </div>
    </nav>
  );
}
