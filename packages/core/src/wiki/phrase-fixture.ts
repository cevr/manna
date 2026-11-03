import { Option } from 'effect';

import { PhraseDictionary, PhraseDictionaryEntry, topicSlug } from './model.js';
import { normalizeAlias } from './normalize.js';

export const DANIEL_8_9 =
  'And out of one of them came forth a little horn, which waxed exceeding great, ' +
  'toward the south, and toward the east, and toward the pleasant [land].';

export const DANIEL_8_11 =
  'Yea, he magnified [himself] even to the prince of the host, and by him the daily ' +
  '[sacrifice] was taken away, and the place of his sanctuary was cast down.';

export const DANIEL_8_14 =
  'And he said unto me, Unto two thousand and three hundred days; ' +
  'then shall the sanctuary be cleansed.';

export const PHRASE_FIXTURE_NOTE =
  'KJV translator brackets split "pleasant [land]" into two runs; §4.3 does not ' +
  'fold brackets and §4.6 does not cross segments, so the phrase is not hot.';

const entry = (display: string, slug: string): PhraseDictionaryEntry =>
  PhraseDictionaryEntry.make({
    alias: normalizeAlias(display),
    display,
    slug: topicSlug(slug),
    canonical: true,
  });

export const PHRASE_FIXTURE_DICTIONARY = PhraseDictionary.make({
  entries: [
    entry('little horn', 'little-horn'),
    entry('pleasant land', 'pleasant-land'),
    entry('the daily', 'the-daily'),
    entry('sanctuary', 'sanctuary'),
    entry('heavenly sanctuary', 'heavenly-sanctuary'),
  ],
  unavailable: Option.none(),
});

export const DANIEL_8_SECTION: readonly string[] = [DANIEL_8_9, DANIEL_8_11, DANIEL_8_14];
