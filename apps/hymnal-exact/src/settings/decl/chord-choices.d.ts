/** Simple, then Advanced. */
export declare const chordStyles: ReadonlyArray<{
  readonly value: 'simple' | 'advanced';
  readonly label: string;
}>;

/** On the beat, Simpler, As the file plays, each with the player dial's mark. */
export declare const placements: ReadonlyArray<{
  readonly value: 'beat' | 'simpler' | 'file';
  readonly label: string;
  readonly mark: string;
}>;
