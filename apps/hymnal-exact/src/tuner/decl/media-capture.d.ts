/**
 * The part of Exact's `@exact/media-capture` the tuner's microphone calls,
 * for the workspace's typecheck (`tsconfig.src.json` maps it here); Exact's
 * own type check reads the package's declarations.
 */

export declare const microphoneStatus: () => Promise<{
  readonly available: boolean;
  readonly state: 'granted' | 'prompt' | 'denied' | 'unknown';
}>;

export declare const getUserMedia: (options: {
  readonly audio?: boolean;
  readonly apple?: { readonly mode?: string };
}) => Promise<{ readonly tracks: ReadonlyArray<{ readonly id: string }> }>;

export declare const stopTrack: (options: { readonly track: string }) => Promise<unknown>;
