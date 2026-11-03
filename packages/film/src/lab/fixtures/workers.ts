import { Match } from 'effect';

/** What the host is: its cores, its one-minute load, and whether it is CI. */
interface Host {
  readonly cores: number;
  readonly load: number;
  readonly ci: boolean;
}

/** The e2e suite's workers on `host`. */
export const workersFor = (host: Host): number =>
  Match.value(host.ci).pipe(
    Match.when(true, () => Math.min(8, host.cores)),
    Match.orElse(() => Math.max(2, Math.min(host.cores, Math.floor(host.cores - host.load)))),
  );
