// Re-export the single canonical states dataset (shared with the browser app)
// so the build pipeline and the shipped client never drift apart.
export * from '../../src/scripts/states-data.js';
