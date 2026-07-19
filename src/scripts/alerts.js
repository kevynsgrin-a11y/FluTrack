// ===========================================================================
// Surge-alert signup (Wedge C). Enhances any <form id="alert-form"> with inline
// validation, an async submit to the /api/subscribe Pages Function, and
// accessible status messaging. Without JS the form still POSTs natively.
// ===========================================================================

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function init(form) {
  const email = form.querySelector('input[type="email"]');
  const state = form.querySelector('select[name="state"]');
  const status = form.querySelector('#alert-status') || form.parentElement.querySelector('.form-status');

  // Prefill state from ?state=XX (used by per-state "set up alerts" links).
  try {
    const params = new URLSearchParams(window.location.search);
    const pre = params.get('state');
    if (pre && state && [...state.options].some((o) => o.value === pre)) state.value = pre;
  } catch (e) {
    /* ignore */
  }

  const setStatus = (msg, kind) => {
    if (!status) return;
    status.textContent = msg;
    status.dataset.state = kind || '';
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const emailVal = (email?.value || '').trim();
    const stateVal = state?.value || '';

    const errorId = status?.id || null;
    if (!EMAIL_RE.test(emailVal)) {
      email?.setAttribute('aria-invalid', 'true');
      if (errorId) email?.setAttribute('aria-describedby', errorId);
      setStatus('Please enter a valid email address.', 'error');
      email?.focus();
      return;
    }
    email?.removeAttribute('aria-invalid');
    email?.removeAttribute('aria-describedby');
    if (state && !stateVal) {
      state.setAttribute('aria-invalid', 'true');
      if (errorId) state.setAttribute('aria-describedby', errorId);
      setStatus('Please choose your state.', 'error');
      state.focus();
      return;
    }
    state?.removeAttribute('aria-invalid');
    state?.removeAttribute('aria-describedby');

    const btn = form.querySelector('button[type="submit"]');
    const label = btn?.textContent;
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Subscribing…';
    }
    setStatus('', '');

    try {
      const res = await fetch(form.action, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ email: emailVal, state: stateVal }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        form.reset();
        setStatus(data.message || "You're subscribed. Watch for a confirmation email.", 'success');
      } else if (res.status === 501) {
        // Endpoint not configured in this deployment.
        setStatus(
          'Thanks! Alert delivery isn’t switched on in this demo, but your interest is noted.',
          'success'
        );
        form.reset();
      } else {
        setStatus(data.message || 'Something went wrong. Please try again shortly.', 'error');
      }
    } catch (err) {
      setStatus('Network error — please try again in a moment.', 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = label;
      }
    }
  });

  email?.addEventListener('input', () => {
    email.removeAttribute('aria-invalid');
    email.removeAttribute('aria-describedby');
  });
  state?.addEventListener('change', () => {
    state.removeAttribute('aria-invalid');
    state.removeAttribute('aria-describedby');
  });
}

document.querySelectorAll('form#alert-form, form[data-alert-form]').forEach(init);
