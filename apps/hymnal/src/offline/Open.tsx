import { useAtomSet } from '@effect/atom-react';
import { Option } from 'effect';
import { useEffect } from 'react';
import { useShownPage } from '~/player/page';
import { Action, send } from './live';

export function SaveShown() {
  const shown = useShownPage();
  const number = Option.getOrElse(
    Option.map(shown, (track) => track.number),
    () => 0,
  );
  const ask = useAtomSet(send);
  useEffect(() => {
    ask(Action.Open({ number }));
  }, [number, ask]);
  return <></>;
}
