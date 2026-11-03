import { useAtomValue } from '@effect/atom-react';
import type * as Atom from 'effect/reactivity/Atom';
import { useKeepAwake } from 'one';

export function KeepAwake({ on }: { readonly on: Atom.Atom<boolean> }) {
  return useAtomValue(on) && <Held />;
}

function Held() {
  useKeepAwake();
  return <></>;
}
