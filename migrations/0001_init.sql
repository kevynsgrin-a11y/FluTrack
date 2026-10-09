-- ===========================================================================
-- FluTrack D1 schema (database: flutrack-db). Shared by the Pages Functions
-- (/api/report, /api/area, /api/official) and the flutrack-ingest Worker.
--
-- PRIVACY CONTRACT (enforced by the code that writes these tables, and by
-- tests): no raw IP, no ZIP5, no name/email/DOB, no free text, and no exact
-- report timestamp. A report carries its calendar DAY and ISO week only.
-- Raw report rows are purged after 90 days by the Worker's daily cron; the
-- daily aggregates are kept.
--
-- Apply: wrangler d1 migrations apply flutrack-db --remote
-- Never DROP these tables in a rollback (see docs/DEPLOY-FEATURE.md).
-- ===========================================================================

CREATE TABLE IF NOT EXISTS reports (
  id             TEXT PRIMARY KEY,           -- random UUID, not derived from anything about the reporter
  created_day    TEXT NOT NULL,              -- YYYY-MM-DD (UTC); no time of day
  iso_week       TEXT NOT NULL,              -- e.g. 2026-W41
  state          TEXT NOT NULL,              -- USPS code
  county_fips    TEXT,                       -- 5-digit county FIPS, NULL when unresolved
  zip3           TEXT NULL,                  -- only when the ZIP3 area has > 20,000 people
  feeling        TEXT NOT NULL CHECK (feeling IN ('fine', 'sick')),
  fever          INT NOT NULL DEFAULT 0,
  cough          INT NOT NULL DEFAULT 0,
  sore_throat    INT NOT NULL DEFAULT 0,
  body_aches     INT NOT NULL DEFAULT 0,
  fatigue        INT NOT NULL DEFAULT 0,
  congestion     INT NOT NULL DEFAULT 0,
  headache       INT NOT NULL DEFAULT 0,
  chills         INT NOT NULL DEFAULT 0,
  gi             INT NOT NULL DEFAULT 0,
  taste_smell    INT NOT NULL DEFAULT 0,
  sob            INT NOT NULL DEFAULT 0,
  onset_bucket   TEXT,
  age_band       TEXT,
  vaccinated     TEXT,
  test_type      TEXT,
  test_result    TEXT,
  household_sick TEXT,
  ili            INT NOT NULL DEFAULT 0,     -- fever AND (cough OR sore throat)
  covid_like     INT NOT NULL DEFAULT 0,
  ip_hash        TEXT,                       -- sha256(ip + daily salt); salt deleted after the day
  quarantined    INT NOT NULL DEFAULT 0,     -- excluded from every aggregate
  first_report   INT NOT NULL DEFAULT 1      -- first report from this device (people join when sick)
);

CREATE INDEX IF NOT EXISTS idx_reports_county_day ON reports (county_fips, created_day);
CREATE INDEX IF NOT EXISTS idx_reports_state_day ON reports (state, created_day);
CREATE INDEX IF NOT EXISTS idx_reports_hash_day ON reports (ip_hash, created_day);

CREATE TABLE IF NOT EXISTS report_aggregates_daily (
  day          TEXT NOT NULL,
  county_fips  TEXT NOT NULL,
  state        TEXT NOT NULL,
  n            INT NOT NULL DEFAULT 0,
  n_sick       INT NOT NULL DEFAULT 0,
  n_ili        INT NOT NULL DEFAULT 0,
  n_pos_flu    INT NOT NULL DEFAULT 0,
  n_pos_covid  INT NOT NULL DEFAULT 0,
  PRIMARY KEY (day, county_fips)
);

CREATE INDEX IF NOT EXISTS idx_agg_state_day ON report_aggregates_daily (state, day);

CREATE TABLE IF NOT EXISTS official_snapshots (
  source         TEXT NOT NULL,              -- e.g. nssp_ed, nssp_ari, nwss_wval, nhsn_levels
  geo_level      TEXT NOT NULL,              -- 'state' | 'county'
  geo_id         TEXT NOT NULL,              -- USPS state code or 5-digit county FIPS
  pathogen       TEXT NOT NULL,              -- influenza | covid | rsv | combined | ari
  metric         TEXT NOT NULL,
  value          REAL,
  level_label    TEXT,
  week_ending    TEXT NOT NULL,              -- YYYY-MM-DD
  fetched_at     TEXT NOT NULL,              -- ISO timestamp of the pull
  method_version TEXT,                       -- e.g. WVAL method '2026-08-14'
  PRIMARY KEY (source, geo_id, pathogen, metric, week_ending)
);

CREATE INDEX IF NOT EXISTS idx_official_geo ON official_snapshots (geo_id, source, week_ending);

CREATE TABLE IF NOT EXISTS zip_crosswalk (
  zip5               TEXT PRIMARY KEY,       -- lookup only; a ZIP5 is never stored on a report
  county_fips        TEXT NOT NULL,
  state              TEXT NOT NULL,
  zip3               TEXT NOT NULL,
  zip3_pop_over_20k  INT NOT NULL DEFAULT 1
);
