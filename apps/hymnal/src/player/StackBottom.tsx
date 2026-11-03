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

const outOfReach = { pointerEvents: 'none', 'aria-hidden': true } as const;

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

function Meets({ bottom, children }: { readonly bottom: number; readonly children: ReactNode }) {
  const value = useMemo(() => Option.some(bottom), [bottom]);
  return <Bottom value={value}>{children}</Bottom>;
}

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

export const useStackBottom = (): number => {
  const inset = useSafeAreaInsets().bottom;
  return Option.getOrElse(use(Bottom), () => Math.max(0, inset));
};

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
