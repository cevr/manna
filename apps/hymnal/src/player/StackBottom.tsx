/**
 * The stack's wrapper, given by the layout around its stack. It tells the
 * stack's screens the bottom inset they meet (`stackBottom`): none while the
 * bar docked under the stack shows, the device's inset while it is hidden (a
 * hymn page's own bar lies in the page, which ends on that bar's top edge). A
 * list's end space and a page's bottom space read it, so they follow the
 * bar. Outside the layout (a test of one screen) a screen meets the device's
 * inset.
 *
 * It draws the open search's results (`Search`) over the stack while the
 * search's own screen shows (`searchOpen`, keyed by the path), and puts the
 * stack beneath out of reach then: no touch reaches it and assistive
 * technology does not see it, while it stays mounted in its place. While
 * another screen shows, the results stay mounted, unseen and out of reach. The
 * results end on the stack's bottom: above the docked bar on the home list,
 * so playback stays in reach, and at the window's bottom on a hymn page,
 * whose own bar lies under them.
 */

import { useAtomValue } from '@effect/atom-react';
import { Option } from 'effect';
import { usePathname, useSafeAreaInsets } from 'one';
import { createContext, type ReactNode, use, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { Search } from '~/home/Search';
import { modeAt, searchOpen } from '~/reader/place';

import { stackBottom } from './bar';
import { usePlayer } from './context';
import type { HymnPlayer } from './player';
import { useDockedBar } from './PlayerBar';

const Bottom = createContext<Option.Option<number>>(Option.none());

/** The stack beneath open search: untouchable and unseen by assistive technology. */
const outOfReach = { pointerEvents: 'none', 'aria-hidden': true } as const;

/** The stack's screens, told the bottom inset they meet as the bar shows or hides, under the open search's results. */
export function StackBottom({ children }: { readonly children: ReactNode }) {
  const inset = useSafeAreaInsets().bottom;
  const searched = <Searched>{children}</Searched>;
  return Option.match(usePlayer(), {
    onNone: () => <Meets bottom={Math.max(0, inset)}>{searched}</Meets>,
    onSome: (player) => (
      <WithBar player={player} inset={inset}>
        {searched}
      </WithBar>
    ),
  });
}

function WithBar({
  player,
  inset,
  children,
}: {
  readonly player: HymnPlayer;
  readonly inset: number;
  readonly children: ReactNode;
}) {
  return <Meets bottom={stackBottom(useDockedBar(player), inset)}>{children}</Meets>;
}

/** Hands `bottom` down; its readers draw again only when the number changes. */
function Meets({ bottom, children }: { readonly bottom: number; readonly children: ReactNode }) {
  const value = useMemo(() => Option.some(bottom), [bottom]);
  return <Bottom value={value}>{children}</Bottom>;
}

/**
 * The stack, with the results over it and it out of reach while search is
 * open on the shown path. The results stay mounted for as long as their
 * search is open, hidden while a hymn pushed from them shows, so Back finds
 * them as the reader left them.
 */
function Searched({ children }: { readonly children: ReactNode }) {
  const open = useAtomValue(searchOpen);
  const here = modeAt(open, usePathname()) !== 'off';
  return (
    <View style={styles.fill}>
      <View style={styles.fill} {...(here && outOfReach)}>
        {children}
      </View>
      {Option.isSome(open) && <Search here={here} />}
    </View>
  );
}

/** The bottom inset the calling screen meets, in points. */
export const useStackBottom = (): number => {
  const inset = useSafeAreaInsets().bottom;
  return Option.getOrElse(use(Bottom), () => Math.max(0, inset));
};

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
