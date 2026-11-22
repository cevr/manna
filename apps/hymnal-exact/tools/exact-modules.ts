/**
 * Exact's standard modules the hymnal's data module imports
 * (`@exact/media-capture`, the tuner's microphone, `src/tuner/mic.ts`).
 * They live in the Exact clone, not on npm: `tools/prepare.ts` links each
 * into this app's `node_modules` before every `bun run exact`, so the build
 * resolves them, while a fresh checkout's tests find them unlinked.
 */
export const EXACT_MODULES: ReadonlyArray<string> = ['media-capture'];
