/* Our House · small bits of behaviour */
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  // Full-screen navigation
  const toggle = $('[data-nav-toggle]');
  const panel = $('[data-nav]');
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
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.hidden) { setNav(false); toggle.focus(); } });

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
  select(tabs[0]);
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => select(tab));
    tab.addEventListener('keydown', (e) => {
      const to = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
      if (to === undefined) return;
      e.preventDefault();
      select(tabs[(to + tabs.length) % tabs.length], true);
    });
  });

  // Draw the glass when it comes into view
  const doodle = $('.doodle');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { doodle.classList.add('drawn'); io.disconnect(); }
    }, { threshold: 0.6 });
    io.observe(doodle);
  } else {
    doodle.classList.add('drawn');
  }

  // Contact form: opens the visitor's email app, filled in
  const form = $('[data-form]');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    const d = new FormData(form);
    const body = `${d.get('message')}\n\n${d.get('name')}\n${d.get('email')}`;
    window.location.href = `mailto:info@ourhousebar.co.uk?subject=${encodeURIComponent(`Message from ${d.get('name')}`)}&body=${encodeURIComponent(body)}`;
    $('[data-sent]').hidden = false;
  });

  $$('[data-year]').forEach((el) => { el.textContent = new Date().getFullYear(); });
})();
