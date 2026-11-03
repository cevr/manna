/**
 * The App property (`fixtures/suite.ts`) in the gate: one representative
 * generated app, parsed and driven by its own values.
 * `app.property.slow.test.ts` runs the complete 128 and the edges, with
 * their coverage.
 */
import { generatedCases } from './fixtures/property.ts';
import { appProperty } from './fixtures/suite.ts';

appProperty('App substitution over one representative generated app', generatedCases(1));
