import type { Option } from 'effect';

import type { ReadGarden, Stage } from './garden.d.ts';
import type { SessionView } from './session-service.d.ts';
import type { Plan } from './session.d.ts';

/** A verse that grew in a run, and its stage now. */
export interface Grown {
  readonly reference: string;
  readonly stage: Stage;
}

/** The verses that grew in a run of `plan`, in plan order, each once. */
export declare const grownOf: (plan: Plan, garden: ReadGarden) => readonly Grown[];

/** What the end of a run shows: none until every item of the visit and the plan is done and none held; else what grew. */
export declare const tendedOf: (
  view: SessionView,
  garden: Option.Option<ReadGarden>,
) => Option.Option<readonly Grown[]>;
