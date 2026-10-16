/* Our House · site behaviour (no dependencies) */
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  // Header turns solid once you scroll off the hero photo
  const header = $('[data-header]');
  // Uses whichever page's photo header is showing (both pages have one)
  const onScroll = () => {
    const hero = $$('[data-hero]').find((h) => h.offsetHeight > 0);
    header.classList.toggle('is-scrolled', !hero || window.scrollY > hero.offsetHeight - 90);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  onScroll();

  // Mobile navigation
  const toggle = $('[data-nav-toggle]');
  const panel = $('[data-mobile-nav]');
  const label = $('[data-nav-label]');
  const setNav = (open) => {
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    label.textContent = open ? 'Close menu' : 'Open menu';
    document.body.classList.toggle('nav-open', open);
    document.body.style.overflow = open ? 'hidden' : '';
  };
  toggle.addEventListener('click', () => setNav(panel.hidden));
  $$('a', panel).forEach((a) => a.addEventListener('click', () => setNav(false)));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.hidden) { setNav(false); toggle.focus(); }
  });

  // Menu sections
  const tabs = $$('[role="tab"]');
  const select = (tab, focus) => {
    tabs.forEach((t) => {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
    });
    if (focus) tab.focus();
  };
  if (tabs.length) select(tabs[0]);
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => select(tab));
    tab.addEventListener('keydown', (e) => {
      const to = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
      if (to === undefined) return;
      e.preventDefault();
      select(tabs[(to + tabs.length) % tabs.length], true);
    });
  });

  // Links that jump to a menu section, e.g. "Any cocktail, minus the booze"
  $$('[data-open-tab]').forEach((link) => link.addEventListener('click', () => {
    const tab = tabs.find((t) => t.getAttribute('aria-controls') === `panel-${link.dataset.openTab}`);
    if (tab) select(tab);
  }));

  // Fade sections in as they scroll into view
  const reveals = $$('[data-reveal]');
  if ('IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const io = new IntersectionObserver((entries) => entries.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
    }), { threshold: 0.12 });
    reveals.forEach((el) => io.observe(el));
  } else {
    reveals.forEach((el) => el.classList.add('is-in'));
  }

  $$('[data-year]').forEach((el) => { el.textContent = new Date().getFullYear(); });
})();
