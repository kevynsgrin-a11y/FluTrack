// ===========================================================================
// UI chrome — theme toggle + mobile navigation. Loaded on every page.
// Progressive enhancement: the site is fully usable if this never runs.
// ===========================================================================

const root = document.documentElement;
const STORAGE_KEY = 'flutrack-theme';
const THEME_COLORS = { light: '#ffffff', dark: '#0c1116' };

/**
 * Point every <meta name="theme-color"> at one agreed value.
 *
 * The page ships two media-scoped tags so first paint matches the OS. Browsers
 * disagree about which tag wins when more than one matches — Chrome takes the
 * first match, others the last — so an explicit user choice is applied by
 * rewriting them ALL, not by appending a third, unscoped tag. Appending was
 * what left the document carrying two candidate colours whose winner depended
 * on the browser, so the chrome and the page could disagree.
 *
 * @param theme 'light' | 'dark' to pin a colour, or null to restore each tag to
 *              the colour its own media query means.
 */
function setThemeColor(theme) {
  const metas = document.querySelectorAll('meta[name="theme-color"]');
  metas.forEach((meta) => {
    if (theme) {
      meta.setAttribute('content', THEME_COLORS[theme] || THEME_COLORS.light);
      return;
    }
    const media = meta.getAttribute('media') || '';
    meta.setAttribute('content', media.includes('dark') ? THEME_COLORS.dark : THEME_COLORS.light);
  });
}

function currentTheme() {
  const explicit = root.getAttribute('data-theme');
  if (explicit) return explicit;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme) {
  root.setAttribute('data-theme', theme);
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch (e) {
    /* storage may be blocked; theme still applies for the session */
  }
  const toggle = document.getElementById('theme-toggle');
  if (toggle) toggle.setAttribute('aria-pressed', String(theme === 'dark'));
  setThemeColor(theme);
}

/** Drop the stored override and fall back to the OS preference. */
function clearThemeOverride() {
  root.removeAttribute('data-theme');
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    /* ignore */
  }
  // Hand the media-scoped tags back their own colours, or the chrome would stay
  // pinned to the override the visitor just cleared.
  setThemeColor(null);
}

function storedTheme() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch (e) {
    return null;
  }
}

function initTheme() {
  const toggle = document.getElementById('theme-toggle');
  if (!toggle) return;
  const media = window.matchMedia('(prefers-color-scheme: dark)');

  const sync = () => {
    const dark = currentTheme() === 'dark';
    toggle.setAttribute('aria-pressed', String(dark));
    // Three states, so the label has to say which one is active.
    toggle.setAttribute(
      'title',
      storedTheme() ? `Theme: ${storedTheme()} (click to cycle)` : 'Theme: match system (click to cycle)'
    );
  };
  sync();

  // Cycle light -> dark -> system, rather than pinning the user to an override
  // forever the moment they touch the toggle once.
  toggle.addEventListener('click', () => {
    const stored = storedTheme();
    if (!stored) applyTheme(media.matches ? 'light' : 'dark');
    else if (stored === (media.matches ? 'light' : 'dark')) applyTheme(media.matches ? 'dark' : 'light');
    else clearThemeOverride();
    sync();
  });

  // Follow later OS changes while no explicit override is set.
  media.addEventListener('change', () => {
    if (!storedTheme()) sync();
  });
}

function initNav() {
  const toggle = document.getElementById('nav-toggle');
  const nav = document.getElementById('primary-nav');
  if (!toggle || !nav) return;

  const setOpen = (open) => {
    nav.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    // Move focus into the panel on open so the menu is reachable with the very
    // next Tab, and hand it back to the toggle on close.
    if (open) nav.querySelector('a')?.focus();
  };

  toggle.addEventListener('click', () => {
    const open = !nav.classList.contains('is-open');
    setOpen(open);
    if (!open) toggle.focus();
  });

  // Close on outside click / Escape for accessibility.
  document.addEventListener('click', (e) => {
    if (!nav.classList.contains('is-open')) return;
    if (!nav.contains(e.target) && !toggle.contains(e.target)) setOpen(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && nav.classList.contains('is-open')) {
      setOpen(false);
      toggle.focus();
    }
  });
  nav.addEventListener('click', (e) => {
    if (e.target.closest('a')) setOpen(false);
  });
}

// Register the service worker (offline shell + faster repeat visits).
function initServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        /* SW is a progressive enhancement; ignore failures */
      });
    });
  }
}

initTheme();
initNav();
initServiceWorker();
