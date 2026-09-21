// ===========================================================================
// Roving keyboard model for the interactive state cartogram. Tab enters one
// state, arrows move to the nearest state in the requested geographic direction,
// and Enter follows its existing real link. The no-JS markup remains links.
// ===========================================================================

function initMap(svg) {
  const tiles = [...svg.querySelectorAll('.us-tile')];
  if (!tiles.length) return;
  let active = tiles.findIndex((tile) => tile.classList.contains('is-selected'));
  if (active < 0) active = 0;

  const setActive = (index, focus = false) => {
    active = index;
    tiles.forEach((tile, i) => tile.tabIndex = i === active ? 0 : -1);
    if (focus) tiles[active].focus();
  };

  const nearest = (from, direction) => {
    const row = Number(from.dataset.row);
    const col = Number(from.dataset.col);
    const candidates = tiles.map((tile, index) => ({ tile, index, row: Number(tile.dataset.row), col: Number(tile.dataset.col) }))
      .filter((item) => {
        if (direction === 'left') return item.col < col;
        if (direction === 'right') return item.col > col;
        if (direction === 'up') return item.row < row;
        return item.row > row;
      });
    if (!candidates.length) return active;
    candidates.sort((a, b) => {
      const forwardA = direction === 'left' || direction === 'right' ? Math.abs(a.col - col) : Math.abs(a.row - row);
      const forwardB = direction === 'left' || direction === 'right' ? Math.abs(b.col - col) : Math.abs(b.row - row);
      const crossA = direction === 'left' || direction === 'right' ? Math.abs(a.row - row) : Math.abs(a.col - col);
      const crossB = direction === 'left' || direction === 'right' ? Math.abs(b.row - row) : Math.abs(b.col - col);
      return forwardA * 10 + crossA - (forwardB * 10 + crossB);
    });
    return candidates[0].index;
  };

  setActive(active);
  tiles.forEach((tile, index) => {
    tile.addEventListener('focus', () => setActive(index));
    tile.addEventListener('keydown', (event) => {
      const keyMap = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
      if (!(event.key in keyMap)) return;
      event.preventDefault();
      setActive(nearest(tile, keyMap[event.key]), true);
    });
  });
}

document.querySelectorAll('.us-map__svg').forEach(initMap);
