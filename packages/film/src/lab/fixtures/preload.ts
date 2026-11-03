import { setDefaultTimeout } from 'effect-bun-test';

/** A browser-free test's time limit, in milliseconds: bun's own default. */
const TEST_TIMEOUT_MS = 5_000;

setDefaultTimeout(TEST_TIMEOUT_MS);
