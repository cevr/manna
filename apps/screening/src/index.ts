/**
 * The screening site as the publisher reads it: a film's manifest
 * (`./manifest.ts`), what a version is made of (`./publish.ts`), and the
 * desk that writes it to the bucket (`./desk-client.ts`). The pages are
 * Solid JSX: call `registerSolidSsr` (`@manna/screening/solid-ssr`) before
 * importing this module.
 */
export { FilmId, type FilmManifest, PATHS, VERSION_NAMES, versionsOf } from './manifest.ts';
export { type Material, type MaterialFile } from './publish.ts';
export { deskClient, publishTo } from './desk-client.ts';
