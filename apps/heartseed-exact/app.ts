import type { Answer, Sources } from './app.contract.d.ts';
import licences from './src/about/licences';
import { aboutSources } from './src/about/sources';
import passage from './src/passage/today';
import { settingsSources } from './src/settings/choices';
import { todaySources } from './src/today/sources';

/** Today listens on the device and keeps its last recall in one file of the app's data. */
export const grants =
  'device.microphone purpose.microphone\ndevice.speech-recognition purpose.recognition\nfs.read app:/data/today.json\nfs.write app:/data/today.json';

const sources: Sources = {
  ...todaySources(passage),
  ...settingsSources,
  ...aboutSources(licences),
};

export const answer: Answer = (source, args, store, storage, native) =>
  sources[source](args, store, storage, native);
