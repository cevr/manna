import { Data } from 'effect';

export type ToRender = Data.TaggedEnum<{
  Render: {
    readonly id: number;
    readonly module: string;
    readonly url: string;
    readonly mac: boolean;
  };
  Cancel: { readonly id: number };
  Answer: {
    readonly read: number;
    readonly status: number;
    readonly headers: ReadonlyArray<readonly [string, string]>;
    readonly body: Uint8Array;
  };
}>;

export const ToRender = Data.taggedEnum<ToRender>();

export type FromRender = Data.TaggedEnum<{
  Head: { readonly id: number; readonly html: string; readonly bodyClass: string };
  Chunk: { readonly id: number; readonly html: string };
  End: { readonly id: number };
  Failed: { readonly id: number; readonly reason: string };
  Read: { readonly id: number; readonly read: number; readonly path: string };
  ReadCancelled: { readonly id: number; readonly read: number };
}>;

export const FromRender = Data.taggedEnum<FromRender>();
