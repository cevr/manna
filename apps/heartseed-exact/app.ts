import type { Answer, Sources } from './app.contract.d.ts';
import { gardenSources } from './src/garden/sources';
import passage from './src/passage/today';
import { todaySources } from './src/today/sources';

/** Today listens on the device and keeps its last recall in one file of the app's data; the garden keeps its keys in another. */
export const grants =
  'device.microphone purpose.microphone\ndevice.speech-recognition purpose.recognition\nfs.read app:/data/today.json\nfs.write app:/data/today.json\nfs.read app:/data/heartseed.json\nfs.write app:/data/heartseed.json';

/** A driver's launch (`tools/drive-garden.ts`) sets this, and Your verses shows its test controls; a plain launch has none. */
const GARDEN_DRIVE = import.meta.env['HEARTSEED_GARDEN_DRIVE'] ?? '';

const sources: Sources = {
  ...todaySources(passage),
  ...gardenSources({ driven: GARDEN_DRIVE !== '' }),
};

export const answer: Answer = (source, args, store, storage, native) =>
  sources[source](args, store, storage, native);
