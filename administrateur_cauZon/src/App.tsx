import React, { useState } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AuthGate } from './components/AuthGate';
import { BottomNav } from './components/BottomNav';
import { DashboardView } from './views/DashboardView';
import { CatalogView } from './views/CatalogView';
import { StudioView } from './views/StudioView';
import { MessagingView } from './views/MessagingView';
import { SettingsView } from './views/SettingsView';
import { useAppData } from './hooks/useAppData';
import type { ActiveView } from './types';

export default function App() {
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('CAUZON_ADMIN_THEME');
    return saved === 'dark'; // Mode clair (blanc) par défaut !
  });
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() =>
    localStorage.getItem('CAUZON_ADMIN_AUTH') === 'true' || sessionStorage.getItem('CAUZON_ADMIN_AUTH') === 'true'
  );
  const [activeView, setActiveView] = useState<ActiveView>('dashboard');

  // Sync dark mode with DOM
  React.useEffect(() => {
    if (darkMode) { document.documentElement.classList.add('dark-mode'); document.body.classList.add('dark-mode'); }
    else { document.documentElement.classList.remove('dark-mode'); document.body.classList.remove('dark-mode'); }
  }, [darkMode]);

  const handleToggleDarkMode = () => {
    setDarkMode(prev => {
      const next = !prev;
      localStorage.setItem('CAUZON_ADMIN_THEME', next ? 'dark' : 'light');
      return next;
    });
  };

  const appData = useAppData();

  const handleLogout = () => {
    localStorage.removeItem('CAUZON_ADMIN_AUTH');
    sessionStorage.removeItem('CAUZON_ADMIN_AUTH');
    setIsAuthenticated(false);
  };

  if (!isAuthenticated) {
    return (
      <ErrorBoundary>
        <AuthGate onAuthenticated={() => setIsAuthenticated(true)} darkMode={darkMode} />
      </ErrorBoundary>
    );
  }

  const [studioTab, setStudioTab] = useState<'editor' | 'banners'>('editor');
  const [settingsTab, setSettingsTab] = useState<'config' | 'users' | 'finance'>('config');

  const unreadCount = appData.feedbacks.filter(f => !f.reponse_admin).length;

  const bg = darkMode ? '#0F0A0D' : '#F4F5F7';

  return (
    <ErrorBoundary>
      <div style={{ width: '100%', minWidth: '100%', minHeight: '100vh', flex: 1, backgroundColor: bg, fontFamily: 'Inter, sans-serif', color: darkMode ? '#FAF6EB' : '#1F2937', display: 'flex', flexDirection: 'column' }}>
        {/* Top header strip — Fixe & Dynamique avec Navigation et Sous-onglets Intégrés */}
        <header className="print-hide" style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          height: '60px',
          backgroundColor: '#6B1124',
          zIndex: 90,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 24px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.25)',
          gap: '16px'
        }}>
          {/* Logo + Titre de Section Active + Sous-onglets Intégrés */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flex: 1, minWidth: 0, overflowX: 'auto' }}>
            {/* Logo */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
              <span style={{ fontSize: '21px', fontWeight: 800, color: '#FAF6EB', fontFamily: 'Outfit, sans-serif', letterSpacing: '-0.5px' }}>cauZon</span>
              <span style={{ backgroundColor: 'rgba(250,246,235,0.18)', color: '#FAF6EB', fontSize: '10px', fontWeight: 800, padding: '2px 7px', borderRadius: '12px', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Admin</span>
            </div>

            <div style={{ width: '1px', height: '22px', backgroundColor: 'rgba(250,246,235,0.25)', flexShrink: 0 }} />

            {/* Titre de la vue active */}
            <span style={{ fontSize: '14px', fontWeight: 700, color: '#FAF6EB', whiteSpace: 'nowrap', flexShrink: 0 }}>
              {activeView === 'dashboard' && '📊 Tableau de bord'}
              {activeView === 'catalog' && '📚 Catalogue de Cours'}
              {activeView === 'studio' && '🎨 Studio de Création'}
              {activeView === 'messaging' && '💬 Messagerie & Retours'}
              {activeView === 'settings' && '⚙️ Paramètres & Finances'}
            </span>

            {/* Sous-onglets Studio intégrés au Header */}
            {activeView === 'studio' && (
              <div style={{ display: 'flex', gap: '4px', backgroundColor: 'rgba(0,0,0,0.22)', borderRadius: '20px', padding: '3px', marginLeft: '6px', flexShrink: 0 }}>
                {[
                  { id: 'editor' as const, label: '✏️ Éditeur PDF Académique' },
                  { id: 'banners' as const, label: '📢 Bannières & Annonces' },
                ].map(t => (
                  <button
                    key={t.id}
                    onClick={() => setStudioTab(t.id)}
                    style={{
                      padding: '5px 14px',
                      borderRadius: '16px',
                      border: 'none',
                      backgroundColor: studioTab === t.id ? '#FAF6EB' : 'transparent',
                      color: studioTab === t.id ? '#6B1124' : '#FAF6EB',
                      fontWeight: 700,
                      fontSize: '12px',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            )}

            {/* Sous-onglets Settings intégrés au Header */}
            {activeView === 'settings' && (
              <div style={{ display: 'flex', gap: '4px', backgroundColor: 'rgba(0,0,0,0.22)', borderRadius: '20px', padding: '3px', marginLeft: '6px', flexShrink: 0 }}>
                {[
                  { id: 'config' as const, label: '⚙️ Configuration' },
                  { id: 'users' as const, label: '👥 Utilisateurs' },
                  { id: 'finance' as const, label: '💰 Audit Financier' },
                ].map(t => (
                  <button
                    key={t.id}
                    onClick={() => setSettingsTab(t.id)}
                    style={{
                      padding: '5px 12px',
                      borderRadius: '16px',
                      border: 'none',
                      backgroundColor: settingsTab === t.id ? '#FAF6EB' : 'transparent',
                      color: settingsTab === t.id ? '#6B1124' : '#FAF6EB',
                      fontWeight: 700,
                      fontSize: '12px',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Statut & Profil à droite */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
            {appData.loading && <span style={{ color: 'rgba(250,246,235,0.8)', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>⏳ Chargement…</span>}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: 'rgba(250,246,235,0.12)', padding: '4px 10px', borderRadius: '20px' }}>
              <span style={{ display: 'inline-block', width: '7px', height: '7px', borderRadius: '50%', backgroundColor: '#2ECC71' }} />
              <span style={{ fontSize: '11px', color: '#FAF6EB', fontWeight: 600 }}>Supabase</span>
            </div>
            <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: 'rgba(250,246,235,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FAF6EB', fontWeight: 700, fontSize: '13px' }}>A</div>
          </div>
        </header>

        {/* Main scrollable content */}
        <main style={{ flex: 1, width: '100%', minWidth: '100%', paddingTop: '68px', paddingBottom: '80px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, width: '100%', padding: '16px 28px', boxSizing: 'border-box' }}>
            {activeView === 'dashboard' && (
              <DashboardView
                documents={appData.documents}
                profiles={appData.profiles}
                revenue={appData.revenue}
                revenueCours={appData.revenueCours}
                revenueVip={appData.revenueVip}
                revenueStockage={appData.revenueStockage}
                countCours={appData.countCours}
                countVip={appData.countVip}
                countStockage={appData.countStockage}
                transactionsCount={appData.transactionsCount}
                transactions={appData.transactions}
                loading={appData.loading}
                darkMode={darkMode}
                onReload={appData.reload}
              />
            )}
            {activeView === 'catalog' && (
              <CatalogView
                documents={appData.documents}
                setDocuments={appData.setDocuments}
                darkMode={darkMode}
                onReload={appData.reload}
              />
            )}
            {activeView === 'studio' && (
              <StudioView
                banners={appData.banners}
                setBanners={appData.setBanners}
                documents={appData.documents}
                darkMode={darkMode}
                onReload={appData.reload}
                studioTab={studioTab}
                setStudioTab={setStudioTab}
              />
            )}
            {activeView === 'messaging' && (
              <MessagingView
                feedbacks={appData.feedbacks}
                setFeedbacks={appData.setFeedbacks}
                darkMode={darkMode}
                onReload={appData.reload}
              />
            )}
            {activeView === 'settings' && (
              <SettingsView
                profiles={appData.profiles}
                setProfiles={appData.setProfiles}
                transactions={appData.transactions}
                revenue={appData.revenue}
                revenueCours={appData.revenueCours}
                revenueVip={appData.revenueVip}
                revenueStockage={appData.revenueStockage}
                countCours={appData.countCours}
                countVip={appData.countVip}
                countStockage={appData.countStockage}
                transactionsCount={appData.transactionsCount}
                config={appData.config}
                setConfig={appData.setConfig}
                darkMode={darkMode}
                onReload={appData.reload}
                subTab={settingsTab}
                setSubTab={setSettingsTab}
              />
            )}
          </div>
        </main>

        {/* Bottom Navigation */}
        <BottomNav
          activeView={activeView}
          onNavigate={setActiveView}
          unreadMessages={unreadCount}
          darkMode={darkMode}
          onToggleDarkMode={handleToggleDarkMode}
          onLogout={handleLogout}
        />
      </div>
    </ErrorBoundary>
  );
}
