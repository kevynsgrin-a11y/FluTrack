// ===========================================================================
// State-report status strip. It appears only after the hero readout leaves
// view and observes layout without scroll polling or a new data dependency.
// ===========================================================================

const strip = document.querySelector('[data-sticky-status]');
// The strip stands in for the report card, so the card is what it watches;
// the masthead is a fallback if the card region is ever absent. setRegion()
// only rewrites innerHTML, so this node stays stable across re-renders.
const anchor =
  document.querySelector('[data-region="threat-card"]') ||
  document.querySelector('[data-state-masthead]');

if (strip && anchor && 'IntersectionObserver' in window) {
  const observer = new IntersectionObserver(
    ([entry]) => {
      strip.classList.toggle('is-visible', !entry.isIntersecting);
    },
    { threshold: 0 }
  );
  observer.observe(anchor);
}
