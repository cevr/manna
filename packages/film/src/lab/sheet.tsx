import { useAtomValue } from '@manna/atom-solid';
import { Location } from '@manna/url-state';
import * as UrlAtom from '@manna/url-state/atom';
import { Effect, Option } from 'effect';
import { createEffect, untrack } from 'solid-js';
import { type Host, type Opened, addressOn } from '../browser/host.ts';

interface SheetDismissal {
  readonly opening: (thing: string) => void;
  readonly dismiss: (cleared: () => Option.Option<string>) => void;
}

export const useSheetDismissal = (
  host: Host,
  names: (href: string, thing: string) => boolean,
): SheetDismissal => {
  const entry = useAtomValue(() => UrlAtom.entry);
  let opening = Option.none<{
    readonly thing: string;
    readonly from: string;
    readonly before: string;
  }>();
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
