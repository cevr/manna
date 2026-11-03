import { type StoreRuntime, storeOver } from './storage.ts';

// oxlint-disable-next-line effect/noGlobals -- the stores' live adapter: the tab's session storage
export const TabStore: StoreRuntime = storeOver(() => sessionStorage);

// oxlint-disable-next-line effect/noGlobals -- the stores' live adapter: the browser's local storage
export const ViewerStore: StoreRuntime = storeOver(() => localStorage);
