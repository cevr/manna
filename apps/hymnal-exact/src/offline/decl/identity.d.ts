/**
 * Where a saved recording lives and what it is kept under, as the current
 * app's `offline/identity.ts` says it. This file is
 * `@manna/hymnal-app/offline/identity` as Exact's type check reads it (the
 * app's `tsconfig.json` maps it here): that check stages a package's
 * declarations, never its source. `src/offline/sources.test.ts` assigns
 * each export the port reads to its declaration here.
 */
export interface IdentityOf {
  readonly number: number;
  readonly offset: number;
}

export declare const storageOf: (set: string) => string;
export declare const storageFor: (number: number) => string;
export declare const readStorages: ReadonlyArray<string>;
export declare const stray: (storage: string, name: string) => boolean;
export declare const recordingStorage: (name: string) => boolean;
export declare const identityKey: (id: IdentityOf) => string;
