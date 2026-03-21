/* =====================================================
   Charme（シャルム） LP — JavaScript
   ===================================================== */

(function () {
  'use strict';

  // ===== HEADER: scrolled class =====
  const header = document.querySelector('.header');

  function onScroll() {
    if (window.scrollY > 40) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }
    updateFixedCta();
  }

  window.addEventListener('scroll', onScroll, { passive: true });

  // ===== FIXED CTA (mobile) =====
  const fixedCta = document.getElementById('fixedCta');
  let heroSectionBottom = 0;

  function calcHeroBottom() {
    const hero = document.querySelector('.hero');
    if (hero) {
      heroSectionBottom = hero.getBoundingClientRect().bottom + window.scrollY;
    }
  }

  function updateFixedCta() {
    if (!fixedCta) return;
    const scrolled = window.scrollY;
    const ctaSection = document.getElementById('cta');
    if (ctaSection) {
      const ctaTop = ctaSection.getBoundingClientRect().top;
      if (ctaTop < window.innerHeight) {
        fixedCta.classList.remove('visible');
        return;
      }
    }
    if (scrolled > heroSectionBottom - window.innerHeight * 0.5) {
      fixedCta.classList.add('visible');
    } else {
      fixedCta.classList.remove('visible');
    }
  }

  calcHeroBottom();
  window.addEventListener('resize', calcHeroBottom, { passive: true });

  // ===== FADE-IN ANIMATIONS =====
  const fadeEls = document.querySelectorAll('.fade-in');

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
  );

  fadeEls.forEach((el) => observer.observe(el));

  // ===== SMOOTH SCROLL (anchor links) =====
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', (e) => {
      const targetId = anchor.getAttribute('href');
      if (targetId === '#') return;
      const target = document.querySelector(targetId);
      if (target) {
        e.preventDefault();
        const headerH = header ? header.offsetHeight : 0;
        const targetTop =
          target.getBoundingClientRect().top + window.scrollY - headerH;
        window.scrollTo({ top: targetTop, behavior: 'smooth' });
      }
    });
  });

  // ===== CTA CLICK TRACKING =====
  function trackClick(label) {
    console.log('[Charme CV]', label);
  }

  document.querySelectorAll('[data-track]').forEach((el) => {
    el.addEventListener('click', () => {
      trackClick(el.getAttribute('data-track'));
    });
  });

  // ===== HAMBURGER / DRAWER =====
  const hamburgerBtn = document.getElementById('hamburgerBtn');
  const drawer = document.getElementById('drawer');
  const drawerOverlay = document.getElementById('drawerOverlay');

  function openDrawer() {
    hamburgerBtn.classList.add('is-open');
    hamburgerBtn.setAttribute('aria-expanded', 'true');
    drawer.classList.add('is-open');
    drawer.setAttribute('aria-hidden', 'false');
    drawerOverlay.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }

  function closeDrawer() {
    hamburgerBtn.classList.remove('is-open');
    hamburgerBtn.setAttribute('aria-expanded', 'false');
    drawer.classList.remove('is-open');
    drawer.setAttribute('aria-hidden', 'true');
    drawerOverlay.classList.remove('is-open');
    document.body.style.overflow = '';
  }

  hamburgerBtn.addEventListener('click', () => {
    hamburgerBtn.classList.contains('is-open') ? closeDrawer() : openDrawer();
  });

  drawerOverlay.addEventListener('click', closeDrawer);

  drawer.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener('click', closeDrawer);
  });

  // ===== INITIAL CALL =====
  onScroll();
})();
