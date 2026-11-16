/**
 * `@manna/hymnal/chord` as Exact's type check reads it (the app's
 * `tsconfig.json` maps it here): that check stages declarations, never a
 * package's source, and `effect`'s cannot be staged here. It names, in the
 * port's terms, only what the chords feature reads: a chord as degrees
 * above its key, a key, and the hymnal's own spelling of each.
 * `src/chords/held.test.ts` holds it to the source.
 *
 * A chord as degrees above its key's tonic: `root` and `bass` are 0..11.
 */
export interface Chord {
  readonly root: number;
  readonly quality: string;
  readonly bass?: number;
}

/** A key: its tonic as spelled ("Db", "F#") and whether it is minor. */
export interface Key {
  readonly tonic: string;
  readonly minor: boolean;
}

/** The chord qualities the compiled hymnal writes, as `literals`. */
export declare const Quality: { readonly literals: ReadonlyArray<string> };

/** A chord's symbol in a key: "Gm7/Bb". */
export declare const format: (chord: Chord, key: Key) => string;

/** The key a key signature of `fifths` (-7..7) names. */
export declare const keyFromSignature: (fifths: number, minor: boolean) => Key;
