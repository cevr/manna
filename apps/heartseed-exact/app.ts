import type { Answer, Sources } from './app.contract.d.ts';
import passage from './src/passage/today.json';
import { todaySources } from './src/today/sources';

/** Today listens on the device and keeps its last recall in one file of the app's data. */
export const grants =
  'device.microphone purpose.microphone\ndevice.speech-recognition purpose.recognition\nfs.read app:/data/today.json\nfs.write app:/data/today.json';

const sources: Sources = {
  ...todaySources(passage),
};

export const answer: Answer = (source, args, store, storage, native) =>
  sources[source](args, store, storage, native);
