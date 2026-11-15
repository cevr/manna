import type { Answer, Result, Sources } from './app.contract.d.ts';
import { KEYS, probe } from './probe.ts';

export const grants = '';

const sources: Sources = {
  probes: ([outcomes]): Result<'probes'> =>
    KEYS.map((key) => ({
      key,
      label: key,
      text: outcomes
        .filter((o) => o.key === key)
        .map((o) => o.text)
        .join(' '),
    })),
  probe: ([key, now, seed]): Promise<Result<'probe'>> =>
    probe(key, { now, seed }).then((text) => ({ key, text })),
};
export const answer: Answer = (source, args, store, storage, native) =>
  sources[source](args, store, storage, native);
