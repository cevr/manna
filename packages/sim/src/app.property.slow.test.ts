/**
 * The App property (`fixtures/suite.ts`) complete: 128 generated apps, each
 * field drawn on its own from the case's seed, and the explicit edges (the
 * lowest and highest ports, Heartseed-shaped values), with the coverage of
 * every kind of value.
 */
import { explicitCases, generatedCases } from './fixtures/property.ts';
import { appCoverage, appProperty } from './fixtures/suite.ts';

const generated = generatedCases(128);
const cases = [...generated, ...generated.slice(0, 1).flatMap(explicitCases)];

appCoverage('App coverage over 128 generated apps and the edges', cases);
appProperty('App substitution over 128 generated apps and the edges', cases);
