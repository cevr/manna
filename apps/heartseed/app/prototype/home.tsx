/**
 * PROTOTYPE, throwaway (branch hymnapp/hshome-proto, never main): four
 * homes for Heartseed on one route, `heartseed://prototype/home?variant=a`
 * (a, b, c or d), flipped by the floating bar. Each answers the owner's
 * 2026-11-08 ask: the field as home, lists to browse and add from, what is
 * ready today and a way to start, the reader's own order, Voice and minutes
 * out of the way, and some delight. The garden is in memory only and
 * touches nothing the app keeps.
 */

import { Option } from 'effect';
import { useParams, useRouter } from 'one';
import { useReducer, useState } from 'react';
import { View } from 'react-native';

import { START, reduce } from '../../src/prototype/home/data';
import { FieldHome } from '../../src/prototype/home/a-field';
import { PathHome } from '../../src/prototype/home/b-path';
import { TabsHome } from '../../src/prototype/home/c-tabs';
import { OneHome } from '../../src/prototype/home/d-one';
import { Run, Switcher, type Variant } from '../../src/prototype/home/kit';
import { look } from '../../src/sayit/draw';

const VARIANTS: readonly Variant[] = [
  { key: 'a', name: 'Field as home' },
  { key: 'b', name: 'Morning path' },
  { key: 'c', name: 'Today · Field · Lists' },
  { key: 'd', name: 'One plant at a time' },
];

const indexOf = (key: Option.Option<string>) =>
  Math.max(
    0,
    VARIANTS.findIndex((each) => Option.contains(key, each.key)),
  );

/** How far the switcher lifts, so it clears variant C's tab bar. */
const liftOf = (key: string) => {
  if (key === 'c') return 60;
  return 0;
};

export default function HomePrototype() {
  const params = useParams<{ readonly variant?: string }>();
  const router = useRouter();
  const asked = Option.fromNullishOr(params.variant);
  const [current, setCurrent] = useState(() => indexOf(asked));
  const [linked, setLinked] = useState(params.variant);
  if (params.variant !== linked) {
    setLinked(params.variant);
    setCurrent(indexOf(asked));
  }
  const [home, dispatch] = useReducer(reduce, START);
  const onChange = (index: number) => {
    setCurrent(index);
    router.setParams({ variant: VARIANTS[index]?.key ?? 'a' });
  };
  const key = VARIANTS[current]?.key ?? 'a';
  return (
    <View style={look.screen}>
      {key === 'a' && <FieldHome home={home} dispatch={dispatch} />}
      {key === 'b' && <PathHome home={home} dispatch={dispatch} />}
      {key === 'c' && <TabsHome home={home} dispatch={dispatch} />}
      {key === 'd' && <OneHome home={home} dispatch={dispatch} />}
      <Run home={home} dispatch={dispatch} />
      <Switcher variants={VARIANTS} current={current} onChange={onChange} lift={liftOf(key)} />
    </View>
  );
}
