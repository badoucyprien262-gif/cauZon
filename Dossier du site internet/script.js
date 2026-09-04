/* ==============================================================================
   cauZon.ci — Scripts JavaScript Vanille Optimisés & Sans Dépendance
   - Navigation mobile & Sticky Header
   - Modale PWA interactive (Iframe plein écran & fallback direct)
   - Simulateur de smartphone interactif (Filtres de matières, onglets)
   - FAQ Accordéon fluide
   - Modale juridique (CGU & Politique de confidentialité)
============================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  // 1. Menu Mobile
  const menuBtn = document.getElementById('menu-btn');
  const mobileMenu = document.getElementById('mobile-menu');

  if (menuBtn && mobileMenu) {
    menuBtn.addEventListener('click', () => {
      mobileMenu.classList.toggle('hidden');
    });

    const mobileLinks = mobileMenu.querySelectorAll('a');
    mobileLinks.forEach(link => {
      link.addEventListener('click', () => {
        mobileMenu.classList.add('hidden');
      });
    });
  }

  // 2. FAQ Accordéon fluide
  const faqItems = document.querySelectorAll('.faq-item');
  faqItems.forEach(item => {
    const header = item.querySelector('.faq-header');
    if (header) {
      header.addEventListener('click', () => {
        const isActive = item.classList.contains('active');
        faqItems.forEach(other => {
          if (other !== item) {
            other.classList.remove('active');
          }
        });
        item.classList.toggle('active', !isActive);
      });
    }
  });

  // 3. Gestion du Tunnel d'Authentification Google & Application Web PWA
  const webModal = document.getElementById('web-modal');
  const openModalBtns = document.querySelectorAll('.btn-open-web-app');
  const closeModalBtns = document.querySelectorAll('.btn-close-modal');
  const openNewTabBtns = document.querySelectorAll('.btn-open-new-tab');
  const appIframe = document.getElementById('app-iframe');

  // Configuration Supabase officielle pour cauZon
  const SUPABASE_URL = 'https://wdipnxewpmhdksrlisix.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_oD0zi8_KXt6grTq5PX0jiA_hYTJyZQ6';
  
  let supabaseClient = null;
  if (typeof window.supabase !== 'undefined' && window.supabase.createClient) {
    try {
      supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    } catch (err) {
      console.warn('Initialisation Supabase client :', err);
    }
  }

  // Détection URL de l'application Web (Dev Local / Production PWA)
  const defaultAppUrl = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:8081'
    : 'https://cauzon.ci';

  async function lancerTunnelAuthOuApp() {
    // Si Supabase est chargé, on vérifie la session actuelle
    if (supabaseClient) {
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        
        // Si l'utilisateur n'est pas encore connecté, on initie le tunnel Google OAuth
        if (!session) {
          console.log('Utilisateur non connecté -> Déclenchement du tunnel Google OAuth');
          const redirectUrl = window.location.origin;
          const { data, error } = await supabaseClient.auth.signInWithOAuth({
            provider: 'google',
            options: {
              redirectTo: redirectUrl,
              queryParams: {
                access_type: 'offline',
                prompt: 'select_account',
              },
            },
          });
          if (error) throw error;
          if (data?.url) {
            window.location.href = data.url;
            return;
          }
        }
      } catch (authErr) {
        console.warn('Note Auth Supabase :', authErr);
      }
    }

    // Si déjà connecté ou si le tunnel est passé, ouverture de l'application PWA dans la modale
    openModal();
  }

  function openModal() {
    if (webModal) {
      if (appIframe && (!appIframe.src || appIframe.src === 'about:blank')) {
        appIframe.src = defaultAppUrl;
      }
      webModal.classList.add('active');
      document.body.style.overflow = 'hidden';
    } else {
      window.open(defaultAppUrl, '_blank', 'noopener,noreferrer');
    }
  }

  function closeModal() {
    if (webModal) {
      webModal.classList.remove('active');
      document.body.style.overflow = '';
    }
  }

  openModalBtns.forEach(btn => btn.addEventListener('click', (e) => {
    e.preventDefault();
    lancerTunnelAuthOuApp();
  }));

  closeModalBtns.forEach(btn => btn.addEventListener('click', (e) => {
    e.preventDefault();
    closeModal();
  }));

  openNewTabBtns.forEach(btn => btn.addEventListener('click', (e) => {
    e.preventDefault();
    window.open(defaultAppUrl, '_blank', 'noopener,noreferrer');
  }));

  // 4. Modale Légale (CGU & Confidentialité)
  const legalModal = document.getElementById('legal-modal');
  const closeLegalBtns = document.querySelectorAll('.btn-close-legal');
  const openCguBtns = document.querySelectorAll('.btn-open-cgu');
  const openPrivacyBtns = document.querySelectorAll('.btn-open-privacy');
  const tabCgu = document.getElementById('tab-cgu');
  const tabPrivacy = document.getElementById('tab-privacy');
  const contentCgu = document.getElementById('content-cgu');
  const contentPrivacy = document.getElementById('content-privacy');

  function showLegalTab(tab) {
    if (!contentCgu || !contentPrivacy || !tabCgu || !tabPrivacy) return;
    if (tab === 'cgu') {
      contentCgu.classList.remove('hidden');
      contentPrivacy.classList.add('hidden');
      tabCgu.classList.add('border-[#6B1124]', 'text-[#6B1124]', 'font-bold');
      tabCgu.classList.remove('border-transparent', 'text-gray-500');
      tabPrivacy.classList.remove('border-[#6B1124]', 'text-[#6B1124]', 'font-bold');
      tabPrivacy.classList.add('border-transparent', 'text-gray-500');
    } else {
      contentPrivacy.classList.remove('hidden');
      contentCgu.classList.add('hidden');
      tabPrivacy.classList.add('border-[#6B1124]', 'text-[#6B1124]', 'font-bold');
      tabPrivacy.classList.remove('border-transparent', 'text-gray-500');
      tabCgu.classList.remove('border-[#6B1124]', 'text-[#6B1124]', 'font-bold');
      tabCgu.classList.add('border-transparent', 'text-gray-500');
    }
  }

  function openLegalModal(tab = 'cgu') {
    if (legalModal) {
      showLegalTab(tab);
      legalModal.classList.add('active');
      document.body.style.overflow = 'hidden';
    }
  }

  function closeLegalModal() {
    if (legalModal) {
      legalModal.classList.remove('active');
      document.body.style.overflow = '';
    }
  }

  openCguBtns.forEach(btn => btn.addEventListener('click', (e) => {
    e.preventDefault();
    openLegalModal('cgu');
  }));

  openPrivacyBtns.forEach(btn => btn.addEventListener('click', (e) => {
    e.preventDefault();
    openLegalModal('privacy');
  }));

  if (tabCgu) tabCgu.addEventListener('click', () => showLegalTab('cgu'));
  if (tabPrivacy) tabPrivacy.addEventListener('click', () => showLegalTab('privacy'));

  closeLegalBtns.forEach(btn => btn.addEventListener('click', (e) => {
    e.preventDefault();
    closeLegalModal();
  }));

  // Fermeture par touche Echap
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (webModal && webModal.classList.contains('active')) closeModal();
      if (legalModal && legalModal.classList.contains('active')) closeLegalModal();
    }
  });

  // 5. Simulateur Mobile Interactif (Filtres matières & Onglets)
  const filterBtns = document.querySelectorAll('.phone-filter-btn');
  const phoneCards = document.querySelectorAll('.phone-course-card');

  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => {
        b.classList.remove('bg-[#6B1124]', 'text-white');
        b.classList.add('bg-white', 'text-gray-700');
      });
      btn.classList.remove('bg-white', 'text-gray-700');
      btn.classList.add('bg-[#6B1124]', 'text-white');

      const filter = btn.getAttribute('data-filter');
      phoneCards.forEach(card => {
        if (filter === 'all' || card.getAttribute('data-category') === filter) {
          card.style.display = 'block';
        } else {
          card.style.display = 'none';
        }
      });
    });
  });

  const phoneTabs = document.querySelectorAll('.phone-tab-btn');
  const phoneTabLabel = document.getElementById('phone-tab-title');

  phoneTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      phoneTabs.forEach(t => t.classList.remove('text-[#6B1124]'));
      tab.classList.add('text-[#6B1124]');
      const label = tab.getAttribute('data-title');
      if (phoneTabLabel && label) {
        phoneTabLabel.textContent = label;
      }
    });
  });
});
