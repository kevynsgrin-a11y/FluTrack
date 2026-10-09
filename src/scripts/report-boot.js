// ===========================================================================
// Tiny loader for the "Check your area / Report how you feel" widget. The
// widget itself (report-widget.js) and everything it pulls in are fetched only
// once the visitor interacts with the section, so the home page's first load
// carries none of it. Submitting before the widget arrives still works: the
// submit is held, the widget loads, and it handles that same submit.
// ===========================================================================

const section = document.querySelector('[data-report-section]');
if (section) {
  let pending;
  const load = () => (pending ||= import('./report-widget.js').then((m) => m.init(section)));
  for (const type of ['pointerdown', 'focusin', 'keydown']) section.addEventListener(type, load, { once: true, passive: true });
  section.addEventListener(
    'submit',
    (e) => {
      const form = e.target;
      if (!form.matches('[data-area-form], [data-report-form]')) return;
      e.preventDefault();
      load().then((widget) => widget.handleSubmit(form, e.submitter));
    },
    true
  );
}
