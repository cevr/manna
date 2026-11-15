import type { Answer, Sources } from './app.contract.d.ts';
import licences from './src/about/licences';
import { aboutSources } from './src/about/sources';
import { gardenSources } from './src/garden/sources';
import { makeQueue } from './src/garden/writes';
import { homeSources } from './src/home/sources';
import { settingsSources } from './src/settings/choices';
import { textSources } from './src/text/sources';
import { readerSources } from './src/today/reader';
import { todaySources } from './src/today/sources';

/** Today listens on the device; the garden keeps its keys in one file of the app's data, the only file the app writes. */
export const grants =
  'device.microphone purpose.microphone\ndevice.speech-recognition purpose.recognition\nfs.read app:/data/heartseed.json\nfs.write app:/data/heartseed.json';

/** A driver's launch (`tools/drive-garden.ts`) sets this, and Your verses shows its test controls; a plain launch has none. */
const GARDEN_DRIVE = import.meta.env.HEARTSEED_GARDEN_DRIVE ?? '';

const gardenQueue = makeQueue();

const garden = gardenSources({ driven: GARDEN_DRIVE !== '', queue: gardenQueue });

const sources: Sources = {
  ...settingsSources,
  ...aboutSources(licences),
  ...garden,
  ...homeSources({ queue: gardenQueue }),
  ...todaySources(garden),
  ...readerSources,
  ...textSources,
};

export const answer: Answer = (source, args, store, storage, native) =>
  sources[source](args, store, storage, native);
