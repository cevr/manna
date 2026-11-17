import type { Answer, Sources } from './app.contract.d.ts';
import licences from './src/about/licences';
import { aboutSources } from './src/about/sources';
import { addSources } from './src/add/sources';
import { chooserSources } from './src/chooser/sources';
import { COMMENTARY, commentarySources } from './src/commentary/sources';
import { findSources } from './src/find/sources';
import { gardenSources } from './src/garden/sources';
import { gotoSources } from './src/goto/sources';
import { homeSources } from './src/home/sources';
import { readSources } from './src/read/place';
import { packSources } from './src/packs/sources';
import { settingsSources } from './src/settings/choices';
import { findPackFrom, STUDY_PACKS, studySources } from './src/study/sources';
import { turnSources } from './src/study/turns';
import { studyviewSources } from './src/studyview/sources';
import { textSources } from './src/text/sources';
import { readerSources } from './src/today/reader';
import { todaySources } from './src/today/sources';
import { typeSources } from './src/type/choices';

/**
 * Today listens on the device; the garden keeps its keys in one file of the
 * app's data, and each downloaded pack its own file, fetched from
 * egw.cvr.im, or in a development build from a driver's loopback fixture
 * on the port its checkout chose (`src/packs/sources.ts`, `baseOf`). The
 * same `development net.fetch http:` grant lets a driver's launch fetch
 * find's word index from the loopback `tools/drive-find.ts` serves. The
 * grant names no loopback origin: one that did would make Exact's test
 * runner start every test at a URL with an `authFixture` query, which
 * `go(nav, "/add")` then no longer finds in the stack.
 */
export const grants =
  'device.microphone purpose.microphone\ndevice.speech-recognition purpose.recognition\nfs.read app:/data/heartseed.json\nfs.write app:/data/heartseed.json\nfs.read app:/data/commentary.json\nfs.write app:/data/commentary.json\nfs.read app:/data/xrefs.json\nfs.write app:/data/xrefs.json\nfs.read app:/data/tags.json\nfs.write app:/data/tags.json\nfs.read app:/data/lexicon.json\nfs.write app:/data/lexicon.json\nfs.read app:/data/words.json\nfs.write app:/data/words.json\nnet.fetch https://egw.cvr.im\ndevelopment net.fetch http:';

/** A driver's launch (`tools/drive-garden.ts`) sets this, and Your verses shows its test controls; a plain launch has none. */
const GARDEN_DRIVE = import.meta.env.HEARTSEED_GARDEN_DRIVE ?? '';

/** Where a driver's launch is served the word index (`tools/drive-find.ts`); a plain launch has none until the downloader hands find its pack. */
const FIND_PACK = import.meta.env.HEARTSEED_FIND_PACK ?? '';

/** A driver's launch (`tools/drive-commentary.ts`) names its fixture here; a plain launch fetches every pack from egw.cvr.im. */
const PACKS_BASE = import.meta.env.HEARTSEED_PACKS_BASE ?? '';

/** A driver's launch (`tools/drive-studydata.ts ios turns`) sets this, and the study probe measures the downloader's turns (`src/study/turns.ts`); a plain launch asks nothing of it. */
const TURN_PROBE = import.meta.env.HEARTSEED_TURN_PROBE ?? '';

const garden = gardenSources({ driven: GARDEN_DRIVE !== '' });
const packs = packSources({ setting: PACKS_BASE, packs: [COMMENTARY, ...STUDY_PACKS] });

const sources: Sources = {
  ...settingsSources,
  ...aboutSources(licences),
  ...garden,
  ...homeSources(),
  ...addSources(),
  ...chooserSources,
  ...gotoSources,
  ...todaySources(garden),
  ...readerSources,
  ...textSources,
  ...readSources,
  ...typeSources,
  ...packs.sources,
  ...commentarySources(packs),
  ...studySources(packs),
  ...studyviewSources(packs),
  ...turnSources(TURN_PROBE !== ''),
  ...findSources(findPackFrom(packs, FIND_PACK)),
};

export const answer: Answer = (source, args, store, storage, native) =>
  sources[source](args, store, storage, native);
