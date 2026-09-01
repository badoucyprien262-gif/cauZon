import { useState, useEffect, useCallback } from 'react';
import { BookOpen, Search, Sparkles, ArrowRight, ShieldCheck } from 'lucide-react';

export default function App() {
  const [animationKey, setAnimationKey] = useState<number>(0);
  const [progress, setProgress] = useState<number>(0);
  const [autoLoop, setAutoLoop] = useState<boolean>(true);
  const [activePhase, setActivePhase] = useState<string>('Phase 1 : Révélation Logo');

  const totalDuration = 4000; // 4.0 secondes totales

  // Relancer l'animation
  const triggerReplay = useCallback(() => {
    setProgress(0);
    setAnimationKey(prev => prev + 1);
  }, []);

  // Gestion du chronomètre et des 6 phases
  useEffect(() => {
    const startTime = Date.now();

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const currentProgress = Math.min(100, (elapsed / totalDuration) * 100);
      setProgress(currentProgress);

      if (elapsed < 600) {
        setActivePhase('Phase 1 : Apparition Logo');
      } else if (elapsed < 1100) {
        setActivePhase('Phase 2 : Contraction Logo');
      } else if (elapsed < 1600) {
        setActivePhase('Phase 3 : Apparition Texte CAUZON');
      } else if (elapsed < 2200) {
        setActivePhase('Phase 4 : Condensation en Point');
      } else if (elapsed < 3000) {
        setActivePhase('Phase 5 : Élévation vers le haut');
      } else {
        setActivePhase('Phase 6 : Révélation & Interface');
      }

      if (elapsed >= totalDuration) {
        clearInterval(interval);
        if (autoLoop) {
          setTimeout(() => {
            triggerReplay();
          }, 1000);
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
        background: 'linear-gradient(135deg, #7F011F 0%, #6B1124 50%, #4A0817 100%)',
        position: 'relative',
        overflow: 'hidden',
        cursor: 'pointer',
        userSelect: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      {/* ======================================================== */}
      {/* COUCHE 1 : INTERFACE D'ACCUEIL CAUZON RÉVÉLÉE EN FOND     */}
      {/* ======================================================== */}
      <div 
        key={`home-${animationKey}`}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: '#FAF6EB',
          zIndex: 1,
          display: 'flex',
          flexDirection: 'column',
          opacity: 0,
          animation: 'revealHomeApp 1s cubic-bezier(0.16, 1, 0.3, 1) 3.1s forwards',
          pointerEvents: 'none'
        }}
      >
        {/* Top Header App Rouge Vin & Sable */}
        <header style={{
          backgroundColor: '#7F011F',
          color: '#F5EBD0',
          padding: '16px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: '0 4px 14px rgba(127, 1, 31, 0.25)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '34px',
              height: '34px',
              backgroundColor: '#F5EBD0',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 900,
              color: '#7F011F',
              fontSize: '17px'
            }}>
              cZ
            </div>
            <div>
              <div style={{ fontSize: '18px', fontWeight: 900, letterSpacing: '-0.3px', color: '#F5EBD0' }}>cauZon</div>
              <div style={{ fontSize: '10px', opacity: 0.85, fontWeight: 600, color: '#F5EBD0' }}>Catalogue Universitaire</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', backgroundColor: 'rgba(245,235,208,0.15)', color: '#F5EBD0', padding: '6px 12px', borderRadius: '20px', border: '1px solid rgba(245,235,208,0.2)' }}>
            <ShieldCheck size={14} color="#F5EBD0" />
            <span>Accès Étudiant</span>
          </div>
        </header>

        {/* Corps de l'Accueil */}
        <div style={{ flex: 1, padding: '24px', maxWidth: '800px', margin: '0 auto', width: '100%' }}>
          {/* Barre de Recherche */}
          <div style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid #EFE6D4',
            borderRadius: '12px',
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            boxShadow: '0 2px 8px rgba(59, 11, 20, 0.04)',
            marginBottom: '24px'
          }}>
            <Search size={18} color="#7D6B6E" />
            <span style={{ color: '#7D6B6E', fontSize: '13px' }}>Rechercher un cours, une matière, un TD...</span>
          </div>

          {/* Bannière Bienvenue */}
          <div style={{
            background: 'linear-gradient(135deg, #7F011F 0%, #9E1B38 100%)',
            color: '#FFFFFF',
            borderRadius: '16px',
            padding: '24px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '24px',
            boxShadow: '0 8px 22px rgba(127, 1, 31, 0.25)'
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#F5EBD0', fontWeight: 800, textTransform: 'uppercase', marginBottom: '6px' }}>
                <Sparkles size={13} color="#F5EBD0" /> Offre de Lancement
              </div>
              <h2 style={{ fontSize: '20px', fontWeight: 900, margin: '0 0 6px 0', color: '#FFFFFF' }}>Tous vos cours certifiés</h2>
              <p style={{ fontSize: '12px', color: '#F5EBD0', opacity: 0.95, margin: 0 }}>Consultez et achetez vos polycopiés à 100 FCFA</p>
            </div>
            <button style={{
              backgroundColor: '#F5EBD0',
              color: '#7F011F',
              border: 'none',
              borderRadius: '8px',
              padding: '10px 16px',
              fontWeight: 800,
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer'
            }}>
              Explorer <ArrowRight size={14} color="#7F011F" />
            </button>
          </div>

          {/* Liste des Cours Récentes */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
            {[
              { titre: 'Analyse Mathématique L1', ufr: 'Sciences & Technologies', pages: '48 pages', prix: '100 FCFA', badge: 'Populaire' },
              { titre: 'Droit Constitutionnel', ufr: 'Sciences Juridiques', pages: '62 pages', prix: '100 FCFA', badge: 'Recommandé' },
              { titre: 'Algorithmique & C', ufr: 'Informatique', pages: '35 pages', prix: '100 FCFA', badge: 'Nouveau' },
            ].map((c, i) => (
              <div key={i} style={{
                backgroundColor: '#FFFFFF',
                borderRadius: '12px',
                padding: '16px',
                border: '1px solid #EFE6D4',
                boxShadow: '0 2px 6px rgba(59, 11, 20, 0.04)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '10px', fontWeight: 800, color: '#7F011F', backgroundColor: '#FDF2F4', padding: '3px 8px', borderRadius: '4px' }}>{c.badge}</span>
                  <BookOpen size={14} color="#7D6B6E" />
                </div>
                <div style={{ fontWeight: 800, fontSize: '13.5px', color: '#3B0B14', marginBottom: '4px' }}>{c.titre}</div>
                <div style={{ fontSize: '11px', color: '#7D6B6E', marginBottom: '10px' }}>{c.ufr} • {c.pages}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 900, color: '#10B981', fontSize: '13px' }}>{c.prix}</span>
                  <span style={{ fontSize: '11px', color: '#7F011F', fontWeight: 700 }}>Aperçu gratuit →</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* COUCHE 2 : SÉQUENCE D'ANIMATION DE MÉTAMORPHOSE SPLASH   */}
      {/* ======================================================== */}

      {/* 1. ÉLÉMENT 1 : LOGO SABLE DORÉ (Phase 1 & 2 : 0.0s -> 1.1s) */}
      <div 
        key={`logo-${animationKey}`}
        style={{
          position: 'absolute',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 20,
          animation: 'logoPhase 1.1s cubic-bezier(0.2, 0.8, 0.2, 1) forwards'
        }}
      >
        <div style={{
          width: '110px',
          height: '110px',
          borderRadius: '26px',
          backgroundColor: '#F5EBD0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 12px 36px rgba(0, 0, 0, 0.45)',
          border: '2px solid rgba(255, 255, 255, 0.4)'
        }}>
          <div style={{
            fontFamily: "'Outfit', sans-serif",
            fontSize: '52px',
            fontWeight: 900,
            color: '#7F011F',
            letterSpacing: '-2px',
            lineHeight: 1
          }}>
            cZ
          </div>
        </div>
        <div style={{
          marginTop: '14px',
          color: '#F5EBD0',
          fontSize: '12.5px',
          fontWeight: 800,
          letterSpacing: '3px',
          textTransform: 'uppercase',
          textShadow: '0 2px 8px rgba(0,0,0,0.5)',
          opacity: 0.95
        }}>
          cauZon
        </div>
      </div>

      {/* 2. ÉLÉMENT 2 : TEXTE CAUZON EN CAPITALES SABLE (Phase 3 & 4 : 1.1s -> 2.2s) */}
      <div 
        key={`text-${animationKey}`}
        style={{
          position: 'absolute',
          zIndex: 20,
          opacity: 0,
          fontFamily: "'Outfit', 'Plus Jakarta Sans', sans-serif",
          fontSize: 'clamp(54px, 14vw, 100px)',
          fontWeight: 900,
          color: '#F5EBD0',
          letterSpacing: '5px',
          textShadow: '0 8px 30px rgba(0,0,0,0.5)',
          animation: 'textPhase 1.1s cubic-bezier(0.2, 0.8, 0.2, 1) 1.1s forwards'
        }}
      >
        CAUZON
      </div>

      {/* 3. ÉLÉMENT 3 : POINT SABLE DORÉ & EXPANSION EN CERCLE (Phase 5 & 6 : 2.2s -> 4.0s) */}
      <div 
        key={`dot-${animationKey}`}
        style={{
          position: 'absolute',
          width: '18px',
          height: '18px',
          borderRadius: '50%',
          backgroundColor: '#F5EBD0',
          boxShadow: '0 0 24px rgba(245, 235, 208, 0.9)',
          zIndex: 15,
          opacity: 0,
          animation: 'dotExpansionPhase 1.8s cubic-bezier(0.2, 0.9, 0.1, 1) 2.2s forwards'
        }}
      />

      {/* ======================================================== */}
      {/* COUCHE 3 : TIMELINE & CONTRÔLES DE DÉMONSTRATION         */}
      {/* ======================================================== */}
      <div 
        style={{
          position: 'absolute',
          bottom: '30px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '10px',
          zIndex: 50
        }}
      >
        {/* Indicateur de phase active */}
        <div style={{
          backgroundColor: 'rgba(0, 0, 0, 0.45)',
          backdropFilter: 'blur(10px)',
          color: '#F5EBD0',
          border: '1px solid rgba(245, 235, 208, 0.2)',
          padding: '4px 12px',
          borderRadius: '12px',
          fontSize: '11px',
          fontWeight: 700,
          letterSpacing: '0.3px'
        }}>
          {activePhase}
        </div>

        {/* Barre de timeline fluide */}
        <div 
          style={{
            width: '160px',
            height: '3px',
            backgroundColor: 'rgba(245, 235, 208, 0.25)',
            borderRadius: '99px',
            overflow: 'hidden'
          }}
        >
          <div 
            style={{
              height: '100%',
              width: `${progress}%`,
              backgroundColor: '#F5EBD0',
              borderRadius: '99px',
              transition: 'width 0.03s linear',
              boxShadow: '0 0 8px rgba(245, 235, 208, 0.6)'
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
            backgroundColor: 'rgba(0, 0, 0, 0.35)',
            backdropFilter: 'blur(8px)',
            padding: '6px 16px',
            borderRadius: '20px',
            fontSize: '11.5px',
            fontWeight: 700,
            color: '#F5EBD0',
            border: '1px solid rgba(245, 235, 208, 0.2)'
          }}
        >
          <button
            onClick={triggerReplay}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#F5EBD0',
              fontWeight: 800,
              fontSize: '11.5px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            ↻ Rejouer Métamorphose (4s)
          </button>
          <span style={{ opacity: 0.5 }}>•</span>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
            <input 
              type="checkbox" 
              checked={autoLoop} 
              onChange={(e) => setAutoLoop(e.target.checked)}
              style={{ accentColor: '#F5EBD0', cursor: 'pointer' }}
            />
            Boucle Auto
          </label>
        </div>
      </div>

      {/* ======================================================== */}
      {/* KEYFRAMES CSS ULTRA-FLUIDES DES 6 PHASES DE TRANSITION   */}
      {/* ======================================================== */}
      <style>{`
        /* PHASE 1 & 2 : LOGO SABLE (Apparition puis contraction) */
        @keyframes logoPhase {
          0% {
            opacity: 0;
            transform: scale(0.85);
          }
          45% {
            opacity: 1;
            transform: scale(1.0);
          }
          70% {
            opacity: 1;
            transform: scale(0.95);
          }
          100% {
            opacity: 0;
            transform: scale(0.18);
          }
        }

        /* PHASE 3 & 4 : TEXTE CAUZON (Apparition puis condensation en point) */
        @keyframes textPhase {
          0% {
            opacity: 0;
            transform: scale(0.8);
            letter-spacing: 2px;
          }
          45% {
            opacity: 1;
            transform: scale(1.0);
            letter-spacing: 6px;
          }
          75% {
            opacity: 1;
            transform: scale(0.85);
            letter-spacing: 1px;
          }
          100% {
            opacity: 0;
            transform: scale(0.04);
            letter-spacing: 0px;
          }
        }

        /* PHASE 5 & 6 : POINT SABLE (Montée en haut puis explosion en masque cercle) */
        @keyframes dotExpansionPhase {
          0% {
            opacity: 1;
            transform: translate(0, 0) scale(1);
          }
          20% {
            opacity: 1;
            transform: translate(0, 0) scale(1.2);
          }
          50% {
            opacity: 1;
            transform: translate(0, -260px) scale(1);
          }
          65% {
            opacity: 1;
            transform: translate(0, -260px) scale(3.5);
          }
          100% {
            opacity: 1;
            transform: translate(0, -260px) scale(160);
          }
        }

        /* RÉVÉLATION DE L'APPLICATION D'ACCUEIL */
        @keyframes revealHomeApp {
          0% {
            opacity: 0;
            transform: scale(0.96);
          }
          100% {
            opacity: 1;
            transform: scale(1.0);
          }
        }
      `}</style>
    </div>
  );
}


