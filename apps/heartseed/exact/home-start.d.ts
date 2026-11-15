import type { Option } from 'effect';

import type { ReadGarden } from './garden.d.ts';
import type { SessionView, VisitVerse } from './session-service.d.ts';

/** What a tap on `verse` starts; none before a plan. */
export declare const startOf: (
  view: SessionView,
  garden: ReadGarden,
  verse: string,
) => Option.Option<VisitVerse>;
