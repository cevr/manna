import type { Answer, Sources } from './app.contract.d.ts';
import licences from './src/about/licences';
import { aboutSources } from './src/about/sources';
import { addSources } from './src/add/sources';
import { chooserSources } from './src/chooser/sources';
import { commentarySources } from './src/commentary/sources';
import { gardenSources } from './src/garden/sources';
import { homeSources } from './src/home/sources';
import { settingsSources } from './src/settings/choices';
import { textSources } from './src/text/sources';
import { readerSources } from './src/today/reader';
import { todaySources } from './src/today/sources';

/**
 * Today listens on the device; the garden keeps its keys in one file of the
 * app's data, and the commentary its pack in another, fetched from
 * egw.cvr.im, or in a development build from a driver's loopback fixture
 * on the port its checkout chose (`src/commentary/sources.ts`, `baseOf`).
 */
export const grants =
  'device.microphone purpose.microphone\ndevice.speech-recognition purpose.recognition\nfs.read app:/data/heartseed.json\nfs.write app:/data/heartseed.json\nfs.read app:/data/commentary.json\nfs.write app:/data/commentary.json\nnet.fetch https://egw.cvr.im\ndevelopment net.fetch http:';

/** A driver's launch (`tools/drive-garden.ts`) sets this, and Your verses shows its test controls; a plain launch has none. */
const GARDEN_DRIVE = import.meta.env.HEARTSEED_GARDEN_DRIVE ?? '';

/** A driver's launch (`tools/drive-commentary.ts`) names its fixture here; a plain launch fetches from egw.cvr.im. */
const COMMENTARY_BASE = import.meta.env.HEARTSEED_COMMENTARY_BASE ?? '';

const garden = gardenSources({ driven: GARDEN_DRIVE !== '' });
const commentary = commentarySources({ setting: COMMENTARY_BASE });

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
  ...commentary.sources,
};

export const answer: Answer = (source, args, store, storage, native) =>
  sources[source](args, store, storage, native);
