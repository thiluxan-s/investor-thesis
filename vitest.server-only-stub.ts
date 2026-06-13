// Stub for "server-only" used by Vitest.
// The real package throws at import time to prevent client-side use.
// In the Node/Vitest test environment that guard is unnecessary and would
// break tests that import server modules directly. This stub is a no-op.
export {};
