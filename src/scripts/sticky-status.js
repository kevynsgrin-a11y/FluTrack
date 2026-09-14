// ===========================================================================
// State-report status strip. It appears only after the report masthead leaves
// view and observes layout without scroll polling or a new data dependency.
// ===========================================================================

const strip = document.querySelector('[data-sticky-status]');
const masthead = document.querySelector('[data-state-masthead]');

if (strip && masthead && 'IntersectionObserver' in window) {
  const observer = new IntersectionObserver(([entry]) => {
    strip.classList.toggle('is-visible', !entry.isIntersecting);
  }, { threshold: 0 });
  observer.observe(masthead);
}
