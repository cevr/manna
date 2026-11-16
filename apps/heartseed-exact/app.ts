import type { Answer, Sources } from './app.contract.d.ts';
import licences from './src/about/licences';
import { aboutSources } from './src/about/sources';
import { addSources } from './src/add/sources';
import { chooserSources } from './src/chooser/sources';
import { findSources, packAt } from './src/find/sources';
import { gardenSources } from './src/garden/sources';
import { homeSources } from './src/home/sources';
import { settingsSources } from './src/settings/choices';
import { textSources } from './src/text/sources';
import { readerSources } from './src/today/reader';
import { todaySources } from './src/today/sources';

/** Today listens on the device; the garden keeps its keys in one file of the app's data, the only file the app writes; a driver's launch fetches find's word index from the loopback `tools/drive-find.ts` serves. */
export const grants =
  'device.microphone purpose.microphone\ndevice.speech-recognition purpose.recognition\nfs.read app:/data/heartseed.json\nfs.write app:/data/heartseed.json\nnet.fetch http://127.0.0.1:4797';

/** A driver's launch (`tools/drive-garden.ts`) sets this, and Your verses shows its test controls; a plain launch has none. */
const GARDEN_DRIVE = import.meta.env.HEARTSEED_GARDEN_DRIVE ?? '';

/** Where a driver's launch is served the word index (`tools/drive-find.ts`); a plain launch has none until the downloader hands find its pack. */
const FIND_PACK = import.meta.env.HEARTSEED_FIND_PACK ?? '';

const garden = gardenSources({ driven: GARDEN_DRIVE !== '' });

const sources: Sources = {
  ...settingsSources,
  ...aboutSources(licences),
  ...garden,
  ...homeSources(),
  ...addSources(),
  ...chooserSources,
  ...todaySources(garden),
  ...readerSources,
  ...textSources,
  ...findSources(packAt(FIND_PACK)),
};

export const answer: Answer = (source, args, store, storage, native) =>
  sources[source](args, store, storage, native);
