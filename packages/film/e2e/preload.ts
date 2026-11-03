import { setDefaultTimeout } from 'effect-bun-test';
import { E2E_TIMEOUT_MS } from '../src/lab/fixtures/test-timeout.ts';

setDefaultTimeout(E2E_TIMEOUT_MS);
