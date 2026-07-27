// Deliberately invalid under the project's tsconfig. Never compiled by the build —
// test/strict-mode.test.ts type-checks it and asserts these two errors are reported.

export function widen(value) {
  return value;
}

export function unused(): number {
  const neverRead = 42;
  return 0;
}
