import { WordSeekProbe } from '~/player/WordSeekProbe';

export default function ScrubProbe() {
  if (typeof __DEV__ !== 'undefined' && __DEV__) return <WordSeekProbe />;
  return <></>;
}
