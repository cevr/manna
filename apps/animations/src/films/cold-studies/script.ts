import { defineScript } from '@manna/film/core';

/** The study's name. */
export const TITLE = 'Cold open: the looks';

export const script = defineScript([
  {
    id: 'court',
    say: 'Imagine standing in a courtroom. {evidence}The evidence is overwhelming. {did}You did it. {judge}And the judge looks at you and says, {righteous}righteous.',
    cite: ['Romans 4:5'],
    picture:
      'The courtroom: a small figure in a stained garment before a tall bench; evidence stacks up beside them on `evidence`; head down on `did`; the judge leans in on `judge`; on `righteous` the gavel falls and the verdict stamps across the bench. Each look draws its own courtroom, its own people, in its own medium.',
  },
  {
    id: 'job',
    say: 'Job asked it: {job}“How should man be just with God?”',
    cite: ['Job 9:2'],
    lead: 0.5,
    tail: 1.4,
    enter: { kind: 'cut' },
    picture:
      'Job 9:2 on its page (I know it is so of a truth: but how should man be just with God?). As "Job asked it" is said, the phrase "how should man be just with God?" is highlighted in reading order; on `job` the highlight floods out to fill the frame and becomes the full-screen card, the words landing as they are spoken, "just" set large in gold. Hard cut out.',
  },
]);

/** A beat's id. */
export type BeatId = (typeof script)[number]['id'];
