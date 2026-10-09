// ===========================================================================
// Tiny loader for the "Check your area / Report how you feel" widget. The
// widget itself (report-widget.js) and everything it pulls in are fetched only
// once the visitor interacts with the section, so the home page's first load
// carries none of it. Submitting before the widget arrives still works: the
// submit is held, the widget loads, and it handles that same submit. If the
// widget cannot load at all, the held submit goes ahead as a normal form post
// to the server-rendered (no-JS) result page — it is never swallowed.
// ===========================================================================

const section = document.querySelector('[data-report-section]');
if (section) {
  let pending;
  let native = false;
  const load = () => (pending ||= import('./report-widget.js').then((m) => m.init(section)));
  for (const type of ['pointerdown', 'focusin', 'keydown']) section.addEventListener(type, () => load().catch(() => {}), { once: true, passive: true });

  /** Post the form the ordinary way, keeping the pressed button's name/value. */
  const submitNatively = (form, submitter) => {
    native = true;
    if (typeof form.requestSubmit === 'function') {
      form.requestSubmit(submitter && form.contains(submitter) ? submitter : undefined);
    } else {
      if (submitter?.name) {
        const carry = document.createElement('input');
        carry.type = 'hidden';
        carry.name = submitter.name;
        carry.value = submitter.value;
        form.appendChild(carry);
      }
      form.submit();
    }
  };

  section.addEventListener(
    'submit',
    (e) => {
      const form = e.target;
      if (native || !form.matches('[data-area-form], [data-report-form]')) return;
      e.preventDefault();
      const submitter = e.submitter;
      load()
        .then((widget) => widget.handleSubmit(form, submitter))
        // A new task, not a microtask: while the original submit event is still
        // being dispatched, the HTML spec makes requestSubmit() a no-op.
        .catch(() => setTimeout(() => submitNatively(form, submitter), 0));
    },
    true
  );
}
