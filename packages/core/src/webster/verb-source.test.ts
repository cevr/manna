import { expect, it } from 'bun:test';

import { hasOwnVerbMarker } from './fixtures/verb-source.js';

it('accepts own verb and grammar headings across the pinned source layouts', () => {
  for (const [headword, html] of [
    ['sow', '<p><b>SOW,</b> <i>verb</i> To plant.</p>'],
    ['swallow', '<b>SWAL’LOW,</b> <i>verb</i> To engulf.'],
    ['spread', '<b>SPREAD,</b> SPRED, <i>verb</i> To extend.'],
    ['challenge', '<b>CHALLENGE,</b> VT To demand.'],
    ['ought', '<b>OUGHT</b>, v. imperfect.'],
    ['art', '<b>ART,</b> the second person of be.'],
    ['wast', '<b>WAST,</b> past tense of the substantive verb.'],
    ['drop', '<p><b>DROP,</b> noun A particle.</p><p><b>DROP,</b> <i>v</i>. To fall.</p>'],
    ['build', '<p><b>BUILD,</b></p><p><b>BILD, BUILD,</b> <i>verb</i> To construct.</p>'],
    ['lap', '<b>LAP,</b> noun A fold. <b>LAP,</b> <i>verb</i> To lick.'],
  ] as const)
    expect(hasOwnVerbMarker(html, headword)).toBe(true);
});

it('rejects a neighbouring heading and verb labels in body prose', () => {
  for (const [headword, html] of [
    ['avener', '<p><b>AVENER,</b></p><p><b>AVENGE,</b> <i>verb</i> To punish.</p>'],
    ['sow', '<b>SOW,</b> noun A swine. Compare <i>verb</i> elsewhere.'],
    ['sow', '<b>SOW,</b> unrelated words v. To plant.'],
    ['sow', '<b>SOWING,</b> <i>verb</i> To plant.'],
    ['sow', '<p><b>SOW,</b></p><p><i>verb</i> To plant.'],
  ] as const)
    expect(hasOwnVerbMarker(html, headword)).toBe(false);
});
