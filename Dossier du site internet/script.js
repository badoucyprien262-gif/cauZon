/* ==============================================================================
   cauZon — Site Officiel | Scripts JavaScript Vanille
============================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  // 1. Mobile Menu Toggle
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

  // 2. FAQ Accordion
  const faqItems = document.querySelectorAll('.faq-item');
  faqItems.forEach(item => {
    const header = item.querySelector('.faq-header');
    if (header) {
      header.addEventListener('click', () => {
        const isActive = item.classList.contains('active');
        // Fermer tous les autres
        faqItems.forEach(other => {
          if (other !== item) {
            other.classList.remove('active');
          }
        });
        item.classList.toggle('active', !isActive);
      });
    }
  });

  // 3. Live Web App Modal Management
  const webModal = document.getElementById('web-modal');
  const openModalBtns = document.querySelectorAll('.btn-open-web-app');
  const closeModalBtns = document.querySelectorAll('.btn-close-modal');
  const openNewTabBtns = document.querySelectorAll('.btn-open-new-tab');
  const appIframe = document.getElementById('app-iframe');
  const modalIframeContainer = document.getElementById('modal-iframe-container');
  const toggleFullscreenBtn = document.getElementById('btn-toggle-fullscreen');

  // Default web app URL (Localhost expo dev / Production Vercel)
  const defaultAppUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:8081'
    : 'https://app.cauzon.ci';

  function openModal() {
    if (webModal) {
      if (appIframe && (!appIframe.src || appIframe.src === 'about:blank')) {
        appIframe.src = defaultAppUrl;
      }
      webModal.classList.add('active');
      document.body.style.overflow = 'hidden';
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
    openModal();
  }));

  closeModalBtns.forEach(btn => btn.addEventListener('click', (e) => {
    e.preventDefault();
    closeModal();
  }));

  openNewTabBtns.forEach(btn => btn.addEventListener('click', (e) => {
    e.preventDefault();
    window.open(defaultAppUrl, '_blank', 'noopener,noreferrer');
  }));

  if (toggleFullscreenBtn && modalIframeContainer) {
    toggleFullscreenBtn.addEventListener('click', () => {
      modalIframeContainer.classList.toggle('fixed');
      modalIframeContainer.classList.toggle('inset-0');
      modalIframeContainer.classList.toggle('z-50');
      modalIframeContainer.classList.toggle('rounded-none');
    });
  }

  // Fermeture par touche Echap
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && webModal && webModal.classList.contains('active')) {
      closeModal();
    }
  });

  // 4. Interactive Phone Simulator
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

  // Phone bottom tabs
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
