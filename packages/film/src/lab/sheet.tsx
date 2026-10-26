// The one rule a sheet a URL keeps open is dismissed by: an ask's still opened
// full size (`Zoom`, `ask/material.tsx`) closes by it.

import { useAtomValue } from '@manna/atom-solid';
import { Location } from '@manna/url-state';
import * as UrlAtom from '@manna/url-state/atom';
import { Effect, Option } from 'effect';
import { createEffect, untrack } from 'solid-js';
import { type Host, type Opened, addressOn } from '../browser/host.ts';

/** A sheet's dismissal (`useSheetDismissal`): told of each opening, it closes the sheet by one rule. */
interface SheetDismissal {
  /** A tap is about to name `thing` while the sheet is shut: its step is the opening's. */
  readonly opening: (thing: string) => void;
  /**
   * Close the sheet, for `cleared()`, where the Close writes (none: the URL
   * names no sheet): the address bar's dismissal (`addressOn(host).dismiss`)
   * is handed the entry the opening's tap pushed, and says whether the Close
   * goes Back over it or rewrites the entry on screen.
   */
  readonly dismiss: (cleared: () => Option.Option<string>) => void;
}

/**
 * The one rule a sheet a URL keeps open is dismissed by (Escape, a tap
 * anywhere): a tap that opens it on a shut sheet is a step of its own, and
 * dismissing it adds none. The sheet knows which entry that tap
 * pushed (an entry a link, a reload or a tap on a sheet already open made is
 * no opening's); the address bar (`addressOn(host).dismiss`) says whether its
 * Close goes Back over that entry or rewrites the entry on screen to name
 * none. `names` says whether an href names `thing`'s sheet open.
 */
export const useSheetDismissal = (
  host: Host,
  names: (href: string, thing: string) => boolean,
): SheetDismissal => {
  const entry = useAtomValue(() => UrlAtom.entry);
  // The thing a tap named on a shut sheet and the entry it was named on, until the next
  // entry lands; then, when that entry is a new one naming it, the entry's key. A new entry is
  // known by its key, not by how the entry on screen last arrived: the push may be replaced
  // in the same tick (the player keeping its time), and a replace keeps the key.
  let opening = Option.none<{
    readonly thing: string;
    readonly from: string;
    readonly before: string;
  }>();
  // The pushed entry's key, and the href of the entry the tap left, which Back would land on.
  let openedBy = Option.none<Opened>();
  createEffect(entry, (e) => {
    const pushed =
      e.navigation !== 'traverse' &&
      Option.exists(opening, (o) => o.from !== e.key && untrack(() => names(e.href, o.thing)));
    if (pushed) openedBy = Option.map(opening, (o) => ({ key: e.key, before: o.before }));
    opening = Option.none();
  });
  const here = () => Effect.runSyncWith(host)(Location.use((bar) => bar.current));
  return {
    opening: (thing) => {
      const at = here();
      opening = Option.some({ thing, from: at.key, before: at.href });
    },
    dismiss: (cleared) => {
      const opened = openedBy;
      openedBy = Option.none();
      addressOn(host).dismiss(opened, cleared());
    },
  };
};
