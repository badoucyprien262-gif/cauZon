import { useState, useEffect, useCallback } from 'react';
import { 
  BookOpen, Search, Sparkles, ArrowRight, ShieldCheck, 
  Home, Compass, FolderOpen, User, Bell, Flame, ChevronRight 
} from 'lucide-react';

export default function App() {
  const letters = ['c', 'a', 'u', 'Z', 'o', 'n'];
  const [animationKey, setAnimationKey] = useState<number>(0);
  const [progress, setProgress] = useState<number>(0);
  const [autoLoop, setAutoLoop] = useState<boolean>(true);
  const [activePhase, setActivePhase] = useState<string>('Phase 1 : Écriture Bordeaux & Blanc');

  const totalDuration = 1800; // 1.8 seconde totale (rapide, fluide et dynamique)

  // Relancer l'animation
  const triggerReplay = useCallback(() => {
    setProgress(0);
    setAnimationKey(prev => prev + 1);
  }, []);

  // Gestion du chronomètre rapide
  useEffect(() => {
    const startTime = Date.now();

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const currentProgress = Math.min(100, (elapsed / totalDuration) * 100);
      setProgress(currentProgress);

      if (elapsed < 750) {
        setActivePhase('Phase 1 : Cascade de Lettres (0.0s - 0.7s)');
      } else if (elapsed < 1150) {
        setActivePhase('Phase 2 : Twist Zoom Immersif (0.7s - 1.1s)');
      } else {
        setActivePhase('Phase 3 : Interface Révélée (1.1s - 1.8s)');
      }

      if (elapsed >= totalDuration) {
        clearInterval(interval);
        if (autoLoop) {
          setTimeout(() => {
            triggerReplay();
          }, 800);
        }
      }
    }, 16);

    return () => clearInterval(interval);
  }, [animationKey, autoLoop, triggerReplay]);

  return (
    <div 
      onClick={triggerReplay}
      style={{
        width: '100vw',
        height: '100vh',
        backgroundColor: '#FFFFFF',
        position: 'relative',
        overflow: 'hidden',
        cursor: 'pointer',
        userSelect: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      {/* ========================================================================= */}
      {/* COUCHE 1 : INTERFACE D'ACCUEIL CAUZON 100% BORDEAUX & BLANC               */}
      {/* ========================================================================= */}
      <div 
        key={`home-${animationKey}`}
        className="home-app-reveal"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: '#F8FAFC',
          zIndex: 5,
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'hidden'
        }}
      >
        {/* Top Header App Rouge Bordeaux */}
        <header 
          className="stagger-header"
          style={{
            backgroundColor: '#7F011F',
            color: '#FFFFFF',
            padding: '16px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 4px 18px rgba(127, 1, 31, 0.25)',
            zIndex: 30
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '36px',
              height: '36px',
              backgroundColor: '#FFFFFF',
              borderRadius: '10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 900,
              color: '#7F011F',
              fontSize: '18px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
            }}>
              cZ
            </div>
            <div>
              <div style={{ fontSize: '19px', fontWeight: 900, letterSpacing: '-0.3px', color: '#FFFFFF' }}>
                cauZon
              </div>
              <div style={{ fontSize: '10px', opacity: 0.9, fontWeight: 600, color: '#FFFFFF' }}>
                Catalogue Universitaire
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              backgroundColor: 'rgba(255, 255, 255, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid rgba(255, 255, 255, 0.25)'
            }}>
              <Bell size={15} color="#FFFFFF" />
            </div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: '#FFFFFF',
              color: '#7F011F',
              padding: '5px 12px',
              borderRadius: '20px',
              fontWeight: 800,
              fontSize: '11px',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)'
            }}>
              <ShieldCheck size={14} color="#7F011F" />
              <span>Étudiant Certifié</span>
            </div>
          </div>
        </header>

        {/* Corps de l'Accueil */}
        <div style={{ flex: 1, padding: '18px 24px', maxWidth: '800px', margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          {/* Barre de Recherche */}
          <div 
            className="stagger-search"
            style={{
              backgroundColor: '#FFFFFF',
              border: '1px solid #E2E8F0',
              borderRadius: '12px',
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)'
            }}
          >
            <Search size={18} color="#64748B" />
            <span style={{ color: '#64748B', fontSize: '13px', fontWeight: 500 }}>Rechercher un polycopié, une matière...</span>
          </div>

          {/* Bannière Bienvenue Hero Card Bordeaux */}
          <div 
            className="stagger-hero-card"
            style={{
              background: 'linear-gradient(135deg, #7F011F 0%, #9B0F30 100%)',
              color: '#FFFFFF',
              borderRadius: '18px',
              padding: '22px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              boxShadow: '0 8px 22px rgba(127, 1, 31, 0.28)'
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#FFFFFF', opacity: 0.9, fontWeight: 800, textTransform: 'uppercase', marginBottom: '6px' }}>
                <Sparkles size={13} color="#FFFFFF" /> Offre Officielle cauZon
              </div>
              <h2 style={{ fontSize: '20px', fontWeight: 900, margin: '0 0 6px 0', color: '#FFFFFF' }}>Tous vos cours certifiés</h2>
              <p style={{ fontSize: '12.5px', color: '#FFFFFF', opacity: 0.95, margin: 0 }}>
                Polycopiés complets et annales d'examens à <strong>100 FCFA</strong>
              </p>
            </div>
            <button 
              className="stagger-cta-btn"
              style={{
                backgroundColor: '#FFFFFF',
                color: '#7F011F',
                border: 'none',
                borderRadius: '10px',
                padding: '11px 18px',
                fontWeight: 900,
                fontSize: '12.5px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(0, 0, 0, 0.15)'
              }}
            >
              <span>Explorer</span> <ArrowRight size={14} color="#7F011F" />
            </button>
          </div>

          {/* Titre Section */}
          <div className="stagger-section-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Flame size={16} color="#7F011F" />
              <span style={{ fontSize: '14px', fontWeight: 900, color: '#0F172A' }}>Polycopiés Populaires</span>
            </div>
            <span style={{ fontSize: '12px', color: '#7F011F', fontWeight: 800 }}>Voir tout →</span>
          </div>

          {/* Liste des Cours Récentes */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
            {[
              { titre: 'Analyse Mathématique L1', ufr: 'Sciences & Tech', pages: '48 p.', prix: '100 FCFA', badge: 'Populaire', class: 'stagger-card-1' },
              { titre: 'Droit Constitutionnel', ufr: 'Sciences Juridiques', pages: '62 p.', prix: '100 FCFA', badge: 'Recommandé', class: 'stagger-card-2' },
              { titre: 'Algorithmique & C', ufr: 'Informatique', pages: '35 p.', prix: '100 FCFA', badge: 'Nouveau', class: 'stagger-card-3' },
            ].map((c, i) => (
              <div 
                key={i} 
                className={c.class}
                style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: '12px',
                  padding: '14px',
                  border: '1px solid #E2E8F0',
                  boxShadow: '0 2px 6px rgba(0, 0, 0, 0.04)'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '10px', fontWeight: 800, color: '#7F011F', backgroundColor: '#FDF2F4', padding: '3px 8px', borderRadius: '4px' }}>
                    {c.badge}
                  </span>
                  <BookOpen size={14} color="#64748B" />
                </div>
                <div style={{ fontWeight: 800, fontSize: '13px', color: '#0F172A', marginBottom: '4px' }}>{c.titre}</div>
                <div style={{ fontSize: '11px', color: '#64748B', marginBottom: '10px' }}>{c.ufr} • {c.pages}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 900, color: '#7F011F', fontSize: '13.5px' }}>{c.prix}</span>
                  <span style={{ fontSize: '11px', color: '#7F011F', fontWeight: 800, display: 'flex', alignItems: 'center' }}>
                    Aperçu <ChevronRight size={12} />
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Barre de navigation inférieure */}
        <nav 
          className="stagger-bottom-nav"
          style={{
            backgroundColor: '#FFFFFF',
            borderTop: '1px solid #E2E8F0',
            padding: '10px 24px 14px 24px',
            display: 'flex',
            justifyContent: 'space-around',
            alignItems: 'center',
            boxShadow: '0 -4px 16px rgba(0,0,0,0.03)'
          }}
        >
          {[
            { icon: Home, label: 'Accueil', active: true },
            { icon: Compass, label: 'Catalogue', active: false },
            { icon: FolderOpen, label: 'Mes Cours', active: false },
            { icon: User, label: 'Profil', active: false },
          ].map((item, index) => (
            <div key={index} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', color: item.active ? '#7F011F' : '#94A3B8', cursor: 'pointer' }}>
              <item.icon size={20} color={item.active ? '#7F011F' : '#94A3B8'} strokeWidth={item.active ? 2.5 : 1.8} />
              <span style={{ fontSize: '10.5px', fontWeight: item.active ? 800 : 500 }}>{item.label}</span>
            </div>
          ))}
        </nav>
      </div>

      {/* ========================================================================= */}
      {/* COUCHE 2 : SPLASH SCREEN ROUGE BORDEAUX & LOGO BLANC PUR (0.0s -> 1.1s)   */}
      {/* ========================================================================= */}
      <div 
        key={`splash-${animationKey}`}
        className="splash-overlay-zoom"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'linear-gradient(135deg, #8B142A 0%, #7F011F 45%, #590014 100%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 20,
          overflow: 'hidden'
        }}
      >
        {/* Halo lumineux d'ambiance blanc pur */}
        <div 
          style={{
            position: 'absolute',
            width: '650px',
            height: '650px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(255, 255, 255, 0.15) 0%, rgba(127, 1, 31, 0) 70%)',
            pointerEvents: 'none',
            filter: 'blur(40px)'
          }}
        />

        {/* Conteneur du Logo "cauZon" en Blanc Pur */}
        <div 
          className="logo-zoom-transform"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 25
          }}
        >
          {letters.map((letter, index) => {
            const delay = index * 0.07; // Cascade rapide et vive
            const isSpecialZ = letter === 'Z';

            return (
              <span
                key={`${animationKey}-${index}`}
                style={{
                  fontFamily: "'Outfit', 'Plus Jakarta Sans', sans-serif",
                  fontSize: 'clamp(80px, 20vw, 150px)',
                  fontWeight: 900,
                  color: '#FFFFFF',
                  display: 'inline-block',
                  letterSpacing: isSpecialZ ? '-0.02em' : '-0.04em',
                  lineHeight: 1,
                  opacity: 0,
                  transform: 'translateX(-10px) scale(0.7)',
                  animation: 'staggerRevealLetter 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards',
                  animationDelay: `${delay}s`,
                  textShadow: '0 6px 28px rgba(0, 0, 0, 0.4)'
                }}
              >
                {letter}
              </span>
            );
          })}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* COUCHE 3 : TIMELINE & CONTRÔLES BORDEAUX & BLANC                          */}
      {/* ========================================================================= */}
      <div 
        style={{
          position: 'absolute',
          bottom: '24px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '10px',
          zIndex: 50
        }}
      >
        {/* Indicateur de phase active */}
        <div style={{
          backgroundColor: 'rgba(127, 1, 31, 0.85)',
          backdropFilter: 'blur(10px)',
          color: '#FFFFFF',
          border: '1px solid rgba(255, 255, 255, 0.25)',
          padding: '5px 14px',
          borderRadius: '12px',
          fontSize: '11px',
          fontWeight: 800,
          letterSpacing: '0.3px',
          boxShadow: '0 4px 14px rgba(0,0,0,0.25)'
        }}>
          {activePhase}
        </div>

        {/* Barre de timeline fluide */}
        <div 
          style={{
            width: '160px',
            height: '3px',
            backgroundColor: 'rgba(127, 1, 31, 0.2)',
            borderRadius: '99px',
            overflow: 'hidden'
          }}
        >
          <div 
            style={{
              height: '100%',
              width: `${progress}%`,
              backgroundColor: '#7F011F',
              borderRadius: '99px',
              transition: 'width 0.02s linear'
            }}
          />
        </div>

        {/* Boutons de contrôle */}
        <div 
          onClick={(e) => e.stopPropagation()}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            backgroundColor: 'rgba(127, 1, 31, 0.8)',
            backdropFilter: 'blur(10px)',
            padding: '6px 16px',
            borderRadius: '20px',
            fontSize: '11.5px',
            fontWeight: 700,
            color: '#FFFFFF',
            border: '1px solid rgba(255, 255, 255, 0.2)'
          }}
        >
          <button
            onClick={triggerReplay}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#FFFFFF',
              fontWeight: 900,
              fontSize: '11.5px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            ↻ Relancer (1.8s)
          </button>
          <span style={{ opacity: 0.4 }}>•</span>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
            <input 
              type="checkbox" 
              checked={autoLoop} 
              onChange={(e) => setAutoLoop(e.target.checked)}
              style={{ accentColor: '#FFFFFF', cursor: 'pointer' }}
            />
            Boucle Auto
          </label>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* KEYFRAMES CSS ULTRA-RAPIDES ET FLUIDES (1.8s TOTALE)                      */}
      {/* ========================================================================= */}
      <style>{`
        /* 1. CASCADE D'ÉCRITURE RAPIDE DU LOGO */
        @keyframes staggerRevealLetter {
          0% {
            opacity: 0;
            transform: translateX(-10px) scale(0.7);
          }
          100% {
            opacity: 1;
            transform: translateX(0) scale(1);
          }
        }

        /* 2. LE TWIST FINAL : ZOOM IMMERSIF ULTRA-VIF (0.75s -> 1.15s) */
        .logo-zoom-transform {
          animation: logoZoomImmersion 0.45s cubic-bezier(0.2, 0.8, 0.2, 1) 0.72s forwards;
        }

        @keyframes logoZoomImmersion {
          0% {
            transform: scale(1.0);
            opacity: 1;
          }
          30% {
            transform: scale(1.12);
            opacity: 1;
          }
          100% {
            transform: scale(4.8);
            opacity: 0;
          }
        }

        .splash-overlay-zoom {
          animation: splashDisappear 0.45s cubic-bezier(0.16, 1, 0.3, 1) 0.78s forwards;
        }

        @keyframes splashDisappear {
          0% {
            opacity: 1;
            transform: scale(1.0);
          }
          100% {
            opacity: 0;
            transform: scale(1.4);
            pointer-events: none;
            visibility: hidden;
          }
        }

        /* 3. RÉVÉLATION EN CASCADE DE L'INTERFACE D'ACCUEIL CAUZON */
        .home-app-reveal {
          opacity: 0;
          animation: homeAppFadeIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) 0.85s forwards;
        }

        @keyframes homeAppFadeIn {
          0% {
            opacity: 0;
            transform: scale(0.96);
          }
          100% {
            opacity: 1;
            transform: scale(1.0);
          }
        }

        .stagger-header {
          opacity: 0;
          transform: translateY(-14px);
          animation: itemSlideReveal 0.4s cubic-bezier(0.16, 1, 0.3, 1) 0.95s forwards;
        }

        .stagger-search {
          opacity: 0;
          transform: translateY(14px);
          animation: itemSlideReveal 0.4s cubic-bezier(0.16, 1, 0.3, 1) 1.05s forwards;
        }

        .stagger-hero-card {
          opacity: 0;
          transform: translateY(18px) scale(0.96);
          animation: itemScaleReveal 0.45s cubic-bezier(0.16, 1, 0.3, 1) 1.15s forwards;
        }

        .stagger-cta-btn {
          opacity: 0;
          transform: translateX(-20px) scale(0.9);
          animation: ctaBounce 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) 1.25s forwards;
        }

        @keyframes ctaBounce {
          0% {
            opacity: 0;
            transform: translateX(-20px) scale(0.9);
          }
          60% {
            opacity: 1;
            transform: translateX(3px) scale(1.04);
          }
          100% {
            opacity: 1;
            transform: translateX(0px) scale(1.0);
          }
        }

        .stagger-section-title {
          opacity: 0;
          transform: translateY(10px);
          animation: itemSlideReveal 0.35s cubic-bezier(0.16, 1, 0.3, 1) 1.30s forwards;
        }

        .stagger-card-1 {
          opacity: 0;
          transform: translateY(14px) scale(0.96);
          animation: itemScaleReveal 0.35s cubic-bezier(0.16, 1, 0.3, 1) 1.38s forwards;
        }
        .stagger-card-2 {
          opacity: 0;
          transform: translateY(14px) scale(0.96);
          animation: itemScaleReveal 0.35s cubic-bezier(0.16, 1, 0.3, 1) 1.46s forwards;
        }
        .stagger-card-3 {
          opacity: 0;
          transform: translateY(14px) scale(0.96);
          animation: itemScaleReveal 0.35s cubic-bezier(0.16, 1, 0.3, 1) 1.54s forwards;
        }

        .stagger-bottom-nav {
          opacity: 0;
          transform: translateY(20px);
          animation: itemSlideReveal 0.4s cubic-bezier(0.16, 1, 0.3, 1) 1.62s forwards;
        }

        @keyframes itemSlideReveal {
          0% {
            opacity: 0;
            transform: translateY(14px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes itemScaleReveal {
          0% {
            opacity: 0;
            transform: translateY(16px) scale(0.96);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
    </div>
  );
}




