// ---------------------------------------------------------------------------
// US states + DC reference data. Drives programmatic per-state page generation,
// the state picker, and "near me" geolocation resolution.
//
// hhsRegion: the U.S. Dept. of Health & Human Services region (1–10). Several
// CDC surveillance products (e.g. NREVSS) are reported at HHS-region level, so
// we keep the mapping here to join those datasets to a state.
// ---------------------------------------------------------------------------

export const states = [
  { name: 'Alabama', abbr: 'AL', fips: '01', hhsRegion: 4 },
  { name: 'Alaska', abbr: 'AK', fips: '02', hhsRegion: 10 },
  { name: 'Arizona', abbr: 'AZ', fips: '04', hhsRegion: 9 },
  { name: 'Arkansas', abbr: 'AR', fips: '05', hhsRegion: 6 },
  { name: 'California', abbr: 'CA', fips: '06', hhsRegion: 9 },
  { name: 'Colorado', abbr: 'CO', fips: '08', hhsRegion: 8 },
  { name: 'Connecticut', abbr: 'CT', fips: '09', hhsRegion: 1 },
  { name: 'Delaware', abbr: 'DE', fips: '10', hhsRegion: 3 },
  { name: 'District of Columbia', abbr: 'DC', fips: '11', hhsRegion: 3 },
  { name: 'Florida', abbr: 'FL', fips: '12', hhsRegion: 4 },
  { name: 'Georgia', abbr: 'GA', fips: '13', hhsRegion: 4 },
  { name: 'Hawaii', abbr: 'HI', fips: '15', hhsRegion: 9 },
  { name: 'Idaho', abbr: 'ID', fips: '16', hhsRegion: 10 },
  { name: 'Illinois', abbr: 'IL', fips: '17', hhsRegion: 5 },
  { name: 'Indiana', abbr: 'IN', fips: '18', hhsRegion: 5 },
  { name: 'Iowa', abbr: 'IA', fips: '19', hhsRegion: 7 },
  { name: 'Kansas', abbr: 'KS', fips: '20', hhsRegion: 7 },
  { name: 'Kentucky', abbr: 'KY', fips: '21', hhsRegion: 4 },
  { name: 'Louisiana', abbr: 'LA', fips: '22', hhsRegion: 6 },
  { name: 'Maine', abbr: 'ME', fips: '23', hhsRegion: 1 },
  { name: 'Maryland', abbr: 'MD', fips: '24', hhsRegion: 3 },
  { name: 'Massachusetts', abbr: 'MA', fips: '25', hhsRegion: 1 },
  { name: 'Michigan', abbr: 'MI', fips: '26', hhsRegion: 5 },
  { name: 'Minnesota', abbr: 'MN', fips: '27', hhsRegion: 5 },
  { name: 'Mississippi', abbr: 'MS', fips: '28', hhsRegion: 4 },
  { name: 'Missouri', abbr: 'MO', fips: '29', hhsRegion: 7 },
  { name: 'Montana', abbr: 'MT', fips: '30', hhsRegion: 8 },
  { name: 'Nebraska', abbr: 'NE', fips: '31', hhsRegion: 7 },
  { name: 'Nevada', abbr: 'NV', fips: '32', hhsRegion: 9 },
  { name: 'New Hampshire', abbr: 'NH', fips: '33', hhsRegion: 1 },
  { name: 'New Jersey', abbr: 'NJ', fips: '34', hhsRegion: 2 },
  { name: 'New Mexico', abbr: 'NM', fips: '35', hhsRegion: 6 },
  { name: 'New York', abbr: 'NY', fips: '36', hhsRegion: 2 },
  { name: 'North Carolina', abbr: 'NC', fips: '37', hhsRegion: 4 },
  { name: 'North Dakota', abbr: 'ND', fips: '38', hhsRegion: 8 },
  { name: 'Ohio', abbr: 'OH', fips: '39', hhsRegion: 5 },
  { name: 'Oklahoma', abbr: 'OK', fips: '40', hhsRegion: 6 },
  { name: 'Oregon', abbr: 'OR', fips: '41', hhsRegion: 10 },
  { name: 'Pennsylvania', abbr: 'PA', fips: '42', hhsRegion: 3 },
  { name: 'Rhode Island', abbr: 'RI', fips: '44', hhsRegion: 1 },
  { name: 'South Carolina', abbr: 'SC', fips: '45', hhsRegion: 4 },
  { name: 'South Dakota', abbr: 'SD', fips: '46', hhsRegion: 8 },
  { name: 'Tennessee', abbr: 'TN', fips: '47', hhsRegion: 4 },
  { name: 'Texas', abbr: 'TX', fips: '48', hhsRegion: 6 },
  { name: 'Utah', abbr: 'UT', fips: '49', hhsRegion: 8 },
  { name: 'Vermont', abbr: 'VT', fips: '50', hhsRegion: 1 },
  { name: 'Virginia', abbr: 'VA', fips: '51', hhsRegion: 3 },
  { name: 'Washington', abbr: 'WA', fips: '53', hhsRegion: 10 },
  { name: 'West Virginia', abbr: 'WV', fips: '54', hhsRegion: 3 },
  { name: 'Wisconsin', abbr: 'WI', fips: '55', hhsRegion: 5 },
  { name: 'Wyoming', abbr: 'WY', fips: '56', hhsRegion: 8 },
];

/** URL-safe slug for a state name, e.g. "New York" -> "new-york". */
export function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// Attach a slug to each record once, so the rest of the app can rely on it.
for (const s of states) s.slug = slugify(s.name);

/** Look up a state by slug. */
export function stateBySlug(slug) {
  return states.find((s) => s.slug === slug) || null;
}

/** Look up a state by 2-letter abbreviation (case-insensitive). */
export function stateByAbbr(abbr) {
  const a = String(abbr || '').toUpperCase();
  return states.find((s) => s.abbr === a) || null;
}
