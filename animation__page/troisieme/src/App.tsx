import { useState, useEffect, useCallback } from 'react';
import { 
  BookOpen, Search, Sparkles, ArrowRight, ShieldCheck, 
  Home, Compass, FolderOpen, User, Bell, Flame, ChevronRight, CheckCircle2 
} from 'lucide-react';

export default function App() {
  const [animationKey, setAnimationKey] = useState<number>(0);
  const [progress, setProgress] = useState<number>(0);
  const [autoLoop, setAutoLoop] = useState<boolean>(true);
  const [activePhase, setActivePhase] = useState<string>('Phase 1 : Mockup Centré');

  const totalDuration = 4200; // 4.2 secondes totales

  // Relancer l'animation
  const triggerReplay = useCallback(() => {
    setProgress(0);
    setAnimationKey(prev => prev + 1);
  }, []);

  // Gestion du chronomètre et des phases de transition
  useEffect(() => {
    const startTime = Date.now();

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const currentProgress = Math.min(100, (elapsed / totalDuration) * 100);
      setProgress(currentProgress);

      if (elapsed < 750) {
        setActivePhase('Phase 1 : Mockup Smartphone Flottant (0.0s - 0.7s)');
      } else if (elapsed < 1400) {
        setActivePhase('Phase 2 : Immersion & Zoom Plein Écran (0.7s - 1.4s)');
      } else if (elapsed < 2600) {
        setActivePhase('Phase 3 : Déploiement Carte & Bouton CTA (1.4s - 2.6s)');
      } else {
        setActivePhase('Phase 4 : Cascade des Polycopiés & Navigation (2.6s - 4.2s)');
      }

      if (elapsed >= totalDuration) {
        clearInterval(interval);
        if (autoLoop) {
          setTimeout(() => {
            triggerReplay();
          }, 1200);
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
        backgroundColor: '#0F172A',
        backgroundImage: 'radial-gradient(circle at 50% 40%, #1E293B 0%, #0F172A 70%)',
        position: 'relative',
        overflow: 'hidden',
        cursor: 'pointer',
        userSelect: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        perspective: '1200px'
      }}
    >
      {/* Halo lumineux d'ambiance vert vibrant cauZon */}
      <div 
        style={{
          position: 'absolute',
          width: '800px',
          height: '800px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(143, 234, 21, 0.22) 0%, rgba(16, 185, 129, 0.08) 45%, rgba(15, 23, 42, 0) 70%)',
          pointerEvents: 'none',
          filter: 'blur(60px)',
          zIndex: 1
        }}
      />

      {/* ========================================================================= */}
      {/* LE CONTENEUR PRINCIPAL : MOCKUP SMARTPHONE QUI ZOOM EN PLEIN ÉCRAN        */}
      {/* ========================================================================= */}
      <div 
        key={animationKey}
        className="phone-container-zoom"
        style={{
          position: 'relative',
          backgroundColor: '#FAF6EB',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 10,
          overflow: 'hidden',
          boxShadow: '0 30px 80px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255, 255, 255, 0.1)'
        }}
      >
        {/* Dynamic Island / Encoche du Smartphone (s'estompe lors du zoom) */}
        <div 
          className="phone-dynamic-island"
          style={{
            position: 'absolute',
            top: '12px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '95px',
            height: '24px',
            backgroundColor: '#000000',
            borderRadius: '20px',
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 8px'
          }}
        >
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10B981' }} />
          <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#1E293B', border: '1.5px solid #334155' }} />
        </div>

        {/* ========================================================================= */}
        {/* CORPS DE L'APPLICATION CAUZON                                             */}
        {/* ========================================================================= */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'hidden', position: 'relative' }}>
          
          {/* 1. TOP HEADER CAUZON */}
          <header 
            className="stagger-header"
            style={{
              backgroundColor: '#7F011F',
              color: '#F5EBD0',
              padding: '42px 20px 18px 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              boxShadow: '0 4px 18px rgba(127, 1, 31, 0.3)',
              zIndex: 30
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                width: '36px',
                height: '36px',
                backgroundColor: '#F5EBD0',
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
                <div style={{ fontSize: '19px', fontWeight: 900, letterSpacing: '-0.4px', color: '#F5EBD0', lineHeight: 1.1 }}>
                  cauZon
                </div>
                <div style={{ fontSize: '10px', opacity: 0.9, fontWeight: 600, color: '#F5EBD0', letterSpacing: '0.3px' }}>
                  Universités & Grandes Écoles
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                width: '34px',
                height: '34px',
                borderRadius: '50%',
                backgroundColor: 'rgba(245, 235, 208, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid rgba(245, 235, 208, 0.25)'
              }}>
                <Bell size={16} color="#F5EBD0" />
              </div>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                backgroundColor: '#8FEA15',
                color: '#111111',
                padding: '5px 10px',
                borderRadius: '16px',
                fontWeight: 800,
                fontSize: '11px',
                boxShadow: '0 2px 8px rgba(143, 234, 21, 0.35)'
              }}>
                <ShieldCheck size={14} color="#111111" />
                <span>Étudiant VIP</span>
              </div>
            </div>
          </header>

          {/* 2. ZONE CONTENU DÉFILANT */}
          <div style={{ flex: 1, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '750px', margin: '0 auto', width: '100%' }}>
            
            {/* BARRE DE RECHERCHE */}
            <div 
              className="stagger-search"
              style={{
                backgroundColor: '#FFFFFF',
                border: '1px solid #EFE6D4',
                borderRadius: '14px',
                padding: '11px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                boxShadow: '0 2px 10px rgba(59, 11, 20, 0.04)'
              }}
            >
              <Search size={18} color="#7D6B6E" />
              <span style={{ color: '#7D6B6E', fontSize: '13px', fontWeight: 500 }}>
                Rechercher un polycopié, matière, TD...
              </span>
            </div>

            {/* GRANDE CARTE HERO BANNER */}
            <div 
              className="stagger-hero-card"
              style={{
                background: 'linear-gradient(135deg, #7F011F 0%, #9E1B38 60%, #6B1124 100%)',
                color: '#FFFFFF',
                borderRadius: '20px',
                padding: '22px',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
                position: 'relative',
                overflow: 'hidden',
                boxShadow: '0 10px 28px rgba(127, 1, 31, 0.28)'
              }}
            >
              {/* Badge supérieur */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  backgroundColor: 'rgba(245, 235, 208, 0.18)',
                  color: '#F5EBD0',
                  padding: '4px 10px',
                  borderRadius: '12px',
                  fontSize: '11px',
                  fontWeight: 800,
                  letterSpacing: '0.4px',
                  textTransform: 'uppercase'
                }}>
                  <Sparkles size={13} color="#8FEA15" /> Offre de Rentrée
                </div>
                <div style={{ fontSize: '12px', color: '#8FEA15', fontWeight: 800 }}>
                  100% Certifié
                </div>
              </div>

              <div>
                <h2 style={{ fontSize: '21px', fontWeight: 900, margin: '0 0 6px 0', color: '#FFFFFF', lineHeight: 1.2 }}>
                  Accédez à tous vos cours officiels
                </h2>
                <p style={{ fontSize: '12.5px', color: '#F5EBD0', opacity: 0.95, margin: 0, lineHeight: 1.4 }}>
                  Polycopiés complets et annales corrigées à <strong style={{ color: '#8FEA15' }}>100 FCFA</strong> par cours.
                </p>
              </div>

              {/* BOUTON D'ACTION PRINCIPAL AVEC GLISSEMENT ET OVERSHOOT */}
              <button 
                className="stagger-cta-btn"
                style={{
                  alignSelf: 'flex-start',
                  backgroundColor: '#8FEA15',
                  color: '#111111',
                  border: 'none',
                  borderRadius: '12px',
                  padding: '11px 20px',
                  fontWeight: 900,
                  fontSize: '13px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  cursor: 'pointer',
                  boxShadow: '0 4px 14px rgba(143, 234, 21, 0.4)'
                }}
              >
                <span>Explorer le Catalogue</span>
                <ArrowRight size={16} color="#111111" />
              </button>
            </div>

            {/* SECTION TITRE SUGGESTIONS */}
            <div 
              className="stagger-section-title"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginTop: '4px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Flame size={16} color="#7F011F" />
                <span style={{ fontSize: '14px', fontWeight: 900, color: '#3B0B14' }}>
                  Cours Populaires & Nouveautés
                </span>
              </div>
              <span style={{ fontSize: '12px', color: '#7F011F', fontWeight: 800, cursor: 'pointer' }}>
                Voir tout →
              </span>
            </div>

            {/* GRILLE DE SUGGESTIONS EN CASCADE */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
              {[
                { titre: 'Analyse Mathématique L1', ufr: 'Sciences & Tech', pages: '48 p.', prix: '100 FCFA', badge: 'Populaire', color: '#7F011F', class: 'stagger-card-1' },
                { titre: 'Droit Constitutionnel', ufr: 'Sciences Juridiques', pages: '62 p.', prix: '100 FCFA', badge: 'Recommandé', color: '#7F011F', class: 'stagger-card-2' },
                { titre: 'Algorithmique & Langage C', ufr: 'Informatique', pages: '35 p.', prix: '100 FCFA', badge: 'Nouveau', color: '#10B981', class: 'stagger-card-3' },
                { titre: 'Électromagnétisme S2', ufr: 'Physique-Chimie', pages: '54 p.', prix: '100 FCFA', badge: 'Certifié', color: '#7F011F', class: 'stagger-card-4' },
              ].map((c, i) => (
                <div 
                  key={i} 
                  className={c.class}
                  style={{
                    backgroundColor: '#FFFFFF',
                    borderRadius: '14px',
                    padding: '14px',
                    border: '1px solid #EFE6D4',
                    boxShadow: '0 2px 8px rgba(59, 11, 20, 0.03)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between'
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{
                        fontSize: '10px',
                        fontWeight: 800,
                        color: c.color === '#10B981' ? '#047857' : '#7F011F',
                        backgroundColor: c.color === '#10B981' ? '#ECFDF5' : '#FDF2F4',
                        padding: '3px 7px',
                        borderRadius: '5px'
                      }}>
                        {c.badge}
                      </span>
                      <BookOpen size={13} color="#7D6B6E" />
                    </div>
                    <div style={{ fontWeight: 800, fontSize: '13px', color: '#3B0B14', marginBottom: '3px', lineHeight: 1.2 }}>
                      {c.titre}
                    </div>
                    <div style={{ fontSize: '11px', color: '#7D6B6E', marginBottom: '10px' }}>
                      {c.ufr} • {c.pages}
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '8px', borderTop: '1px dashed #F1E9DA' }}>
                    <span style={{ fontWeight: 900, color: '#10B981', fontSize: '13px' }}>{c.prix}</span>
                    <span style={{ fontSize: '11px', color: '#7F011F', fontWeight: 800, display: 'flex', alignItems: 'center' }}>
                      Aperçu <ChevronRight size={12} />
                    </span>
                  </div>
                </div>
              ))}
            </div>

          </div>

          {/* 3. BARRE DE NAVIGATION INFÉRIEURE (BOTTOM TABS) */}
          <nav 
            className="stagger-bottom-nav"
            style={{
              backgroundColor: '#FFFFFF',
              borderTop: '1px solid #EFE6D4',
              padding: '10px 24px 14px 24px',
              display: 'flex',
              justifyContent: 'space-around',
              alignItems: 'center',
              boxShadow: '0 -4px 16px rgba(0,0,0,0.03)',
              zIndex: 30
            }}
          >
            {[
              { icon: Home, label: 'Accueil', active: true },
              { icon: Compass, label: 'Catalogue', active: false },
              { icon: FolderOpen, label: 'Mes Cours', active: false },
              { icon: User, label: 'Profil', active: false },
            ].map((item, index) => (
              <div 
                key={index} 
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '4px',
                  color: item.active ? '#7F011F' : '#9CA3AF',
                  cursor: 'pointer'
                }}
              >
                <item.icon size={20} color={item.active ? '#7F011F' : '#9CA3AF'} strokeWidth={item.active ? 2.5 : 1.8} />
                <span style={{ fontSize: '10.5px', fontWeight: item.active ? 800 : 500 }}>{item.label}</span>
              </div>
            ))}
          </nav>

        </div>
      </div>

      {/* ========================================================================= */}
      {/* COUCHE CONTROLES & TIMELINE DE DÉMONSTRATION                              */}
      {/* ========================================================================= */}
      <div 
        style={{
          position: 'absolute',
          bottom: '24px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '10px',
          zIndex: 60
        }}
      >
        {/* Indicateur de Phase en temps réel */}
        <div style={{
          backgroundColor: 'rgba(15, 23, 42, 0.75)',
          backdropFilter: 'blur(12px)',
          color: '#8FEA15',
          border: '1px solid rgba(143, 234, 21, 0.3)',
          padding: '5px 14px',
          borderRadius: '14px',
          fontSize: '11.5px',
          fontWeight: 800,
          letterSpacing: '0.3px',
          boxShadow: '0 4px 14px rgba(0,0,0,0.3)'
        }}>
          {activePhase}
        </div>

        {/* Timeline des 4.2 secondes */}
        <div 
          style={{
            width: '180px',
            height: '3px',
            backgroundColor: 'rgba(255, 255, 255, 0.15)',
            borderRadius: '99px',
            overflow: 'hidden'
          }}
        >
          <div 
            style={{
              height: '100%',
              width: `${progress}%`,
              backgroundColor: '#8FEA15',
              borderRadius: '99px',
              transition: 'width 0.03s linear',
              boxShadow: '0 0 10px rgba(143, 234, 21, 0.8)'
            }}
          />
        </div>

        {/* Bouton de test et Boucle Auto */}
        <div 
          onClick={(e) => e.stopPropagation()}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(10px)',
            padding: '6px 16px',
            borderRadius: '20px',
            fontSize: '11.5px',
            fontWeight: 700,
            color: '#FFFFFF',
            border: '1px solid rgba(255, 255, 255, 0.12)'
          }}
        >
          <button
            onClick={triggerReplay}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#8FEA15',
              fontWeight: 900,
              fontSize: '11.5px',
              display: 'flex',
              alignItems: 'center',
              gap: '5px'
            }}
          >
            ↻ Relancer Zoom Immersion (4s)
          </button>
          <span style={{ opacity: 0.3 }}>•</span>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
            <input 
              type="checkbox" 
              checked={autoLoop} 
              onChange={(e) => setAutoLoop(e.target.checked)}
              style={{ accentColor: '#8FEA15', cursor: 'pointer' }}
            />
            Boucle Auto
          </label>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* KEYFRAMES CSS ULTRA-FLUIDES : CAMERA ZOOM-IN & CASCADE D'INTERFACE        */}
      {/* ========================================================================= */}
      <style>{`
        /* 1. MOCKUP VERS PLEIN ÉCRAN : ZOOM TRANSITION */
        .phone-container-zoom {
          width: 380px;
          height: 760px;
          border-radius: 44px;
          animation: phoneZoomFullscreen 1.25s cubic-bezier(0.16, 1, 0.3, 1) 0.65s forwards;
        }

        @keyframes phoneZoomFullscreen {
          0% {
            width: 380px;
            height: 760px;
            border-radius: 44px;
            transform: scale(1.0);
          }
          40% {
            transform: scale(1.03);
          }
          100% {
            width: 100vw;
            height: 100vh;
            border-radius: 0px;
            transform: scale(1.0);
          }
        }

        /* DYNAMIC ISLAND : DISPARITION AU ZOOM */
        .phone-dynamic-island {
          animation: fadeIsland 0.5s ease-out 0.8s forwards;
        }
        @keyframes fadeIsland {
          0% { opacity: 1; transform: translateX(-50%) scale(1); }
          100% { opacity: 0; transform: translateX(-50%) scale(0.6); pointer-events: none; }
        }

        /* CASCADE DES ÉLÉMENTS DE L'INTERFACE (STAGGER REVEAL) */
        .stagger-header {
          opacity: 0;
          transform: translateY(-20px);
          animation: itemReveal 0.6s cubic-bezier(0.16, 1, 0.3, 1) 1.1s forwards;
        }

        .stagger-search {
          opacity: 0;
          transform: translateY(18px);
          animation: itemReveal 0.6s cubic-bezier(0.16, 1, 0.3, 1) 1.3s forwards;
        }

        .stagger-hero-card {
          opacity: 0;
          transform: translateY(24px) scale(0.96);
          animation: itemRevealScale 0.75s cubic-bezier(0.16, 1, 0.3, 1) 1.45s forwards;
        }

        /* BOUTON D'ACTION PRINCIPAL AVEC LÉGER OVERSHOOT (SPRING) */
        .stagger-cta-btn {
          opacity: 0;
          transform: translateX(-35px) scale(0.85);
          animation: ctaOvershootReveal 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) 1.8s forwards;
        }

        @keyframes ctaOvershootReveal {
          0% {
            opacity: 0;
            transform: translateX(-35px) scale(0.85);
          }
          60% {
            opacity: 1;
            transform: translateX(4px) scale(1.06);
          }
          100% {
            opacity: 1;
            transform: translateX(0px) scale(1.0);
          }
        }

        .stagger-section-title {
          opacity: 0;
          transform: translateY(14px);
          animation: itemReveal 0.5s cubic-bezier(0.16, 1, 0.3, 1) 2.0s forwards;
        }

        /* CARTES DE COURS EN CASCADE SYNCHRONISÉE (STAGGER DE 120ms) */
        .stagger-card-1 {
          opacity: 0;
          transform: translateY(20px) scale(0.95);
          animation: itemRevealScale 0.55s cubic-bezier(0.16, 1, 0.3, 1) 2.15s forwards;
        }
        .stagger-card-2 {
          opacity: 0;
          transform: translateY(20px) scale(0.95);
          animation: itemRevealScale 0.55s cubic-bezier(0.16, 1, 0.3, 1) 2.27s forwards;
        }
        .stagger-card-3 {
          opacity: 0;
          transform: translateY(20px) scale(0.95);
          animation: itemRevealScale 0.55s cubic-bezier(0.16, 1, 0.3, 1) 2.39s forwards;
        }
        .stagger-card-4 {
          opacity: 0;
          transform: translateY(20px) scale(0.95);
          animation: itemRevealScale 0.55s cubic-bezier(0.16, 1, 0.3, 1) 2.51s forwards;
        }

        .stagger-bottom-nav {
          opacity: 0;
          transform: translateY(30px);
          animation: itemReveal 0.6s cubic-bezier(0.16, 1, 0.3, 1) 2.65s forwards;
        }

        /* KEYFRAMES GÉNÉRIQUES REVEAL */
        @keyframes itemReveal {
          0% {
            opacity: 0;
            transform: translateY(20px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes itemRevealScale {
          0% {
            opacity: 0;
            transform: translateY(24px) scale(0.95);
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


