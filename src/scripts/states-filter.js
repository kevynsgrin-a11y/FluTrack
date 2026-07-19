// ===========================================================================
// /states/ directory filter. Progressive enhancement: filters the state chips
// by name as you type. Without JS the full directory is fully usable.
// ===========================================================================

const form = document.getElementById('state-filter-form');
const input = document.getElementById('state-filter');
const grid = document.getElementById('state-grid');
const count = document.getElementById('state-filter-count');
const empty = document.getElementById('state-empty');

if (form && input && grid) {
  form.addEventListener('submit', (e) => e.preventDefault());

  const chips = [...grid.querySelectorAll('.state-chip')].map((el) => ({
    el,
    name: (el.querySelector('.state-chip__name')?.textContent || '').toLowerCase(),
  }));

  const apply = () => {
    const q = input.value.trim().toLowerCase();
    let shown = 0;
    for (const chip of chips) {
      const match = !q || chip.name.includes(q);
      chip.el.hidden = !match;
      if (match) shown += 1;
    }
    if (empty) empty.hidden = shown !== 0;
    if (count) count.textContent = q ? `${shown} of ${chips.length}` : '';
  };

  input.addEventListener('input', apply);
}
