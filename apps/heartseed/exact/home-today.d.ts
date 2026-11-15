import type { Option } from 'effect';

import type { ReadGarden } from './garden.d.ts';
import type { SessionView } from './session-service.d.ts';

/** The Today card's one action: open Today, start a verse before its turn, or none. */
export type TodayAction =
  | { readonly _tag: 'Start' }
  | { readonly _tag: 'PracticeAnyway'; readonly verse: string }
  | { readonly _tag: 'None' };

/** The Today card: its headline and parts (none before a plan) and its action. */
export interface TodayCard {
  readonly headline: Option.Option<string>;
  readonly parts: Option.Option<string>;
  readonly action: TodayAction;
}

/** The card over the session's view, the garden read and whether the passages are unread. */
export declare const todayOf: (view: SessionView, garden: ReadGarden, unread: boolean) => TodayCard;
