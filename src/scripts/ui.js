// ===========================================================================
// UI chrome — theme toggle + mobile navigation. Loaded on every page.
// Progressive enhancement: the site is fully usable if this never runs.
// ===========================================================================

const root = document.documentElement;
const STORAGE_KEY = 'flutrack-theme';

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
}

function initTheme() {
  const toggle = document.getElementById('theme-toggle');
  if (!toggle) return;
  toggle.setAttribute('aria-pressed', String(currentTheme() === 'dark'));
  toggle.addEventListener('click', () => {
    applyTheme(currentTheme() === 'dark' ? 'light' : 'dark');
  });
}

function initNav() {
  const toggle = document.getElementById('nav-toggle');
  const nav = document.getElementById('primary-nav');
  if (!toggle || !nav) return;

  const setOpen = (open) => {
    nav.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
  };

  toggle.addEventListener('click', () => setOpen(!nav.classList.contains('is-open')));

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
