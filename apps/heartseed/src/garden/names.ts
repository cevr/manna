import type { Stage } from '../garden';

/** Each stage as the stage line shows it, and as the growth line names it. */
export const STAGE_NAMES: Readonly<
  Record<Stage, { readonly shown: string; readonly grown: string }>
> = {
  seed: { shown: 'A seed', grown: 'a seed' },
  blade: { shown: 'A blade', grown: 'a blade' },
  ear: { shown: 'An ear', grown: 'an ear' },
  'full corn': { shown: 'Full corn', grown: 'full corn' },
};
