/**
 * An app the wrapper runs: its simulator, its web port and its spare ports, and whether it is quiet: a quiet
 * app's plain launch would speak through the simulator, so it is looked at under the agent alone.
 */
export interface ExactApp {
  readonly simulator: string;
  readonly port: number;
  readonly spare: readonly [number, number];
  readonly quiet: boolean;
}

/**
 * The apps, by folder: the two ports and the kit's lab (`packages/exact-kit/lab`). Each drives its own simulator
 * and serves on its own ports; the lab shares Heartseed's simulator, under the build lock, and serves on 8774 alone.
 * A run that listens in the spare range claims its port first (`claimPort`), so runs of every checkout share it.
 */
export const APPS: Readonly<Record<'heartseed-exact' | 'hymnal-exact' | 'lab', ExactApp>> = {
  'heartseed-exact': {
    simulator: 'verify-heartseed-exact',
    port: 8765,
    spare: [8770, 8774],
    quiet: true,
  },
  'hymnal-exact': {
    simulator: 'verify-hymnal-exact',
    port: 8766,
    spare: [8775, 8779],
    quiet: false,
  },
  lab: { simulator: 'verify-heartseed-exact', port: 8774, spare: [8774, 8774], quiet: true },
};
