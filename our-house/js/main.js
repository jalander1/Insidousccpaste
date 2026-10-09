/* Our House · site behaviour (no dependencies) */
(() => {
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
  const root = document.documentElement;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ------------------------------------------------------------
     Opening hours: the one place to edit them (UK time).
     0 = Sunday … 6 = Saturday. null = closed. '24:00' = midnight.
     ------------------------------------------------------------ */
  const HOURS = {
    0: ['13:00', '21:00'],
    1: null,
    2: ['16:00', '22:00'],
    3: ['16:00', '22:00'],
    4: ['13:00', '22:00'],
    5: ['13:00', '24:00'],
    6: ['13:00', '24:00'],
  };
  const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  const toMinutes = (t) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };
  const formatTime = (t) => {
    const mins = toMinutes(t);
    if (mins === 0 || mins === 1440) return 'midnight';
    if (mins === 720) return 'noon';
    const h = Math.floor(mins / 60) % 24;
    const m = mins % 60;
    const suffix = h >= 12 ? 'pm' : 'am';
    const h12 = h % 12 || 12;
    return m ? `${h12}.${String(m).padStart(2, '0')}${suffix}` : `${h12}${suffix}`;
  };

  function londonNow() {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/London',
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      })
        .formatToParts(new Date())
        .map((p) => [p.type, p.value])
    );
    const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday);
    return { day, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
  }

  function getStatus() {
    const { day, minutes } = londonNow();
    const today = HOURS[day];
    if (today) {
      const opens = toMinutes(today[0]);
      const closes = toMinutes(today[1]);
      if (minutes >= opens && minutes < closes) {
        const text = closes - minutes <= 60
          ? `Open · closes at ${formatTime(today[1])}`
          : `Open now · until ${formatTime(today[1])}`;
        return { open: true, text };
      }
      if (minutes < opens) return { open: false, text: `Closed · opens ${formatTime(today[0])} today` };
    }
    for (let i = 1; i <= 7; i += 1) {
      const d = (day + i) % 7;
      if (HOURS[d]) {
        const when = i === 1 ? 'tomorrow' : DAY_NAMES[d].slice(0, 3);
        return { open: false, text: `Closed · opens ${when} ${formatTime(HOURS[d][0])}` };
      }
    }
    return { open: false, text: 'Closed' };
  }

  function renderHours() {
    const { day } = londonNow();
    $$('[data-hours] [data-day]').forEach((li) => {
      const d = Number(li.dataset.day);
      const h = HOURS[d];
      $('.time', li).textContent = h ? `${formatTime(h[0])} – ${formatTime(h[1])}` : 'Closed';
      li.classList.toggle('is-closed', !h);
      li.classList.toggle('is-today', d === day);
    });
  }

  function renderStatus() {
    const status = getStatus();
    root.dataset.open = String(status.open);
    $$('[data-status-text]').forEach((el) => { el.textContent = status.text; });
    $$('[data-status-short]').forEach((el) => { el.textContent = status.open ? 'Open now' : 'Closed'; });
    renderHours();
  }

  renderStatus();
  setInterval(renderStatus, 60 * 1000);

  /* ------------------------------------------------------------
     Header, hero parallax, mobile action bar
     ------------------------------------------------------------ */
  const header = $('[data-header]');
  const hero = $('[data-hero]');
  const actionBar = $('[data-action-bar]');
  const heroLogo = $('.hero-logo');
  const wideScreen = window.matchMedia('(min-width: 1100px)');
  let ticking = false;

  function onScroll() {
    const y = window.scrollY;
    header.classList.toggle('is-scrolled', y > 30);
    if (actionBar) actionBar.classList.toggle('is-visible', y > hero.offsetHeight * 0.55);
    if (!reduceMotion && wideScreen.matches && y < hero.offsetHeight) {
      hero.style.setProperty('--py', y.toFixed(1));
    }
    ticking = false;
  }
  window.addEventListener('scroll', () => {
    if (!ticking) {
      window.requestAnimationFrame(onScroll);
      ticking = true;
    }
  }, { passive: true });
  onScroll();

  // Show the small header logo once the big hero logo has scrolled away
  if ('IntersectionObserver' in window && heroLogo) {
    new IntersectionObserver(([entry]) => {
      header.classList.toggle('show-brand', !entry.isIntersecting);
    }, { rootMargin: '-72px 0px 0px 0px' }).observe(heroLogo);
  } else {
    header.classList.add('show-brand');
  }

  /* ------------------------------------------------------------
     Mobile navigation
     ------------------------------------------------------------ */
  const navToggle = $('[data-nav-toggle]');
  const mobileNav = $('[data-mobile-nav]');
  const navLabel = $('[data-nav-label]');

  function setNav(open) {
    navToggle.setAttribute('aria-expanded', String(open));
    navLabel.textContent = open ? 'Close navigation' : 'Open navigation';
    mobileNav.hidden = !open;
    document.body.classList.toggle('nav-open', open);
    document.body.style.overflow = open ? 'hidden' : '';
    if (open) $('a', mobileNav).focus();
  }
  navToggle.addEventListener('click', () => setNav(mobileNav.hidden));
  $$('a', mobileNav).forEach((a) => a.addEventListener('click', () => setNav(false)));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !mobileNav.hidden) {
      setNav(false);
      navToggle.focus();
    }
  });
  window.matchMedia('(min-width: 981px)').addEventListener('change', (e) => {
    if (e.matches && !mobileNav.hidden) setNav(false);
  });

  /* ------------------------------------------------------------
     Menu tabs
     ------------------------------------------------------------ */
  const tabs = $$('[role="tab"]');
  const panels = tabs.map((t) => document.getElementById(t.getAttribute('aria-controls')));
  const doodles = $$('.doodle');

  function selectTab(tab, focus = false) {
    tabs.forEach((t, i) => {
      const selected = t === tab;
      t.setAttribute('aria-selected', String(selected));
      t.tabIndex = selected ? 0 : -1;
      panels[i].hidden = !selected;
    });
    // Swap the line drawing; re-showing it replays the draw-on animation
    doodles.forEach((d) => d.classList.toggle('is-active', d.dataset.doodle === tab.dataset.tab));
    if (focus) tab.focus();
  }
  selectTab(tabs[0]);
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => selectTab(tab));
    tab.addEventListener('keydown', (e) => {
      const moves = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 };
      if (!(e.key in moves)) return;
      e.preventDefault();
      selectTab(tabs[(moves[e.key] + tabs.length) % tabs.length], true);
    });
  });
  // Links elsewhere that jump to a specific tab, e.g. "See the wine list"
  $$('[data-open-tab]').forEach((link) => {
    link.addEventListener('click', () => {
      const tab = tabs.find((t) => t.dataset.tab === link.dataset.openTab);
      if (tab) selectTab(tab);
    });
  });

  /* ------------------------------------------------------------
     Coffee & tonic: add gin (dare ya)
     ------------------------------------------------------------ */
  const gin = $('[data-gin]');
  if (gin) {
    const price = $('[data-ct-price]');
    const wink = $('[data-ct-wink]');
    gin.addEventListener('change', () => {
      price.textContent = gin.checked ? '7.50' : '4';
      wink.textContent = gin.checked ? 'Bold move. Respect.' : '';
    });
  }

  /* ------------------------------------------------------------
     Wine flight: red or white
     ------------------------------------------------------------ */
  const flight = $('#flight');
  $$('[data-flight]').forEach((btn, _, all) => {
    btn.addEventListener('click', () => {
      flight.dataset.wine = btn.dataset.flight;
      all.forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
    });
  });

  /* ------------------------------------------------------------
     Reveal on scroll
     ------------------------------------------------------------ */
  const revealables = $$('[data-reveal]');
  if ('IntersectionObserver' in window && !reduceMotion) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    revealables.forEach((el) => io.observe(el));
  } else {
    revealables.forEach((el) => el.classList.add('is-in'));
  }

  /* ------------------------------------------------------------
     Enquiry form → pre-filled email (concept: no backend yet)
     ------------------------------------------------------------ */
  const form = $('[data-enquire-form]');
  const success = $('[data-form-success]');
  const typeSelect = $('#f-type');
  const dateInput = $('#f-date');
  const EMAIL = 'info@ourhousebar.co.uk';

  if (dateInput) {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    dateInput.min = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  }

  $$('[data-enquire]').forEach((link) => {
    link.addEventListener('click', () => {
      if (typeSelect) typeSelect.value = link.dataset.enquire;
    });
  });

  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!form.reportValidity()) return;
      const data = new FormData(form);
      const get = (k) => String(data.get(k) || '').trim();
      const typeLabel = typeSelect.options[typeSelect.selectedIndex].text;

      let niceDate = '';
      if (get('date')) {
        const [y, m, d] = get('date').split('-').map(Number);
        const date = new Date(y, m - 1, d);
        niceDate = `${date.toLocaleDateString('en-GB', { weekday: 'short' })} ${date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;
      }

      const subjectBits = [`Enquiry: ${typeLabel}`];
      if (niceDate) subjectBits.push(niceDate);
      if (get('size')) subjectBits.push(`${get('size')} people`);

      const lines = [`Name: ${get('name')}`, `Email: ${get('email')}`];
      if (get('phone')) lines.push(`Phone: ${get('phone')}`);
      lines.push(`About: ${typeLabel}`);
      if (niceDate) lines.push(`Date: ${niceDate}`);
      if (get('size')) lines.push(`Party size: ${get('size')}`);
      if (get('message')) lines.push('', get('message'));
      const body = lines.join('\n');

      const mailto = `mailto:${EMAIL}?subject=${encodeURIComponent(subjectBits.join(' · '))}&body=${encodeURIComponent(body)}`;
      $('[data-mailto-retry]').href = mailto;
      window.location.href = mailto;
      form.hidden = true;
      success.hidden = false;
      success.focus();
    });

    $('[data-form-reset]').addEventListener('click', () => {
      form.reset();
      success.hidden = true;
      form.hidden = false;
      $('input', form).focus();
    });
  }

  /* ------------------------------------------------------------
     Bits & bobs
     ------------------------------------------------------------ */
  $$('[data-year]').forEach((el) => { el.textContent = new Date().getFullYear(); });
})();
