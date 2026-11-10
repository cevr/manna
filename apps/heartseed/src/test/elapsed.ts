/* oxlint-disable effect/noGlobals -- this named boundary measures elapsed host time, never a test's logical instant. */

/** Whether `ms` have elapsed since this deadline was made, on the host's monotonic clock. */
export const deadline = (ms: number) => {
  const start = performance.now();
  return () => performance.now() - start >= ms;
};
