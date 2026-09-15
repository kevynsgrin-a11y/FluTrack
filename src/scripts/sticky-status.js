// ===========================================================================
// State-report status strip. It stands in for the report card, so it belongs
// on screen exactly when the card is entirely above the viewport.
// ===========================================================================

const strip = document.querySelector('[data-sticky-status]');
// setRegion() only rewrites innerHTML, so this node survives re-renders.
const anchor =
  document.querySelector('[data-region="threat-card"]') ||
  document.querySelector('[data-state-masthead]');

if (strip && anchor && 'IntersectionObserver' in window) {
  // Live geometry rather than entry.boundingClientRect, whose snapshot is taken
  // when the intersection changed and can lag. !entry.isIntersecting alone is
  // also wrong: it is true before the card has been reached, which revealed the
  // strip on load at narrow widths where the card starts below the fold.
  const observer = new IntersectionObserver(
    () => {
      strip.classList.toggle('is-visible', anchor.getBoundingClientRect().bottom <= 0);
    },
    { threshold: 0 }
  );
  observer.observe(anchor);
}
