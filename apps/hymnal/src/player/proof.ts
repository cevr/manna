import { Match, Option } from 'effect';

import type { Status } from './player';

export interface Read {
  readonly asked: number;
  readonly answered: number;
  readonly status: Status;
}

interface Pending {
  readonly target: number;
  readonly known: number;
  readonly after: Option.Option<Read>;
}

export interface Proof {
  readonly known: number;
  readonly landed: number;
  readonly endedAt: number;
  readonly pending: Option.Option<Pending>;
  readonly short: Option.Option<Pending>;
  readonly last: Option.Option<Read>;
  readonly quietFrom: Option.Option<number>;
  readonly sounded: boolean;
  readonly heard: Option.Option<Heard>;
  readonly place: Option.Option<number>;
}

interface Heard {
  readonly at: number;
  readonly place: number;
  readonly acted: boolean;
  readonly quiet: boolean;
}

export type Seen = 'stale' | 'pending' | 'ahead' | 'opened' | 'silence' | 'sound' | 'nothing';

export interface Proved {
  readonly proof: Proof;
  readonly seen: Seen;
}

export const none: Proof = {
  known: Number.NEGATIVE_INFINITY,
  landed: Number.NEGATIVE_INFINITY,
  endedAt: Number.NEGATIVE_INFINITY,
  pending: Option.none(),
  short: Option.none(),
  last: Option.none(),
  quietFrom: Option.none(),
  sounded: false,
  heard: Option.none(),
  place: Option.none(),
};

const slack = 2;

export const acted = (proof: Proof, now: number, target: Option.Option<number>): Proof => ({
  ...proof,
  known: now,
  last: Option.none(),
  quietFrom: Option.none(),
  short: Option.none(),
  heard: Option.map(proof.heard, (it) => ({
    ...it,
    acted: true,
    quiet: it.quiet || Option.isSome(proof.quietFrom),
  })),
  pending: Option.match(target, {
    onNone: () => Option.map(proof.pending, (it) => ({ ...it, after: Option.none<Read>() })),
    onSome: (at) => Option.some({ target: at, known: now, after: Option.none<Read>() }),
  }),
  place: Option.orElse(target, () => proof.place),
});

export const followed = (proof: Proof, now: number, place: number): Proof => ({
  ...acted(proof, now, Option.none()),
  pending: Option.none(),
  place: Option.some(place),
});

export const loaded = (now: number, from: number): Proof => ({
  ...acted(none, now, Option.some(from)),
  place: Option.liftPredicate(from, (at) => at > 0),
});

const moving = (state: Status['state']) => state === 'loading' || state === 'playing';

export const pairOf = (a: Read, b: Read): 'silence' | 'sound' | 'nothing' => {
  const moved = b.status.positionMs - a.status.positionMs;
  if (Math.abs(moved) <= slack && moving(a.status.state) && moving(b.status.state))
    return 'silence';
  if (moved > slack && b.status.state === 'playing') return 'sound';
  return 'nothing';
};

const heardOf = (a: Read, b: Read) => ({
  at: a.asked + b.status.positionMs - a.status.positionMs,
  place: b.status.positionMs,
});

const paired = (proof: Proof, read: Read): Proved =>
  Option.match(proof.last, {
    onNone: () => ({ proof: { ...proof, last: Option.some(read) }, seen: 'opened' }),
    onSome: (last) => {
      const pair = pairOf(last, read);
      const next = { ...proof, last: Option.some(read) };
      if (pair === 'silence')
        return {
          proof: {
            ...next,
            quietFrom: Option.orElse(proof.quietFrom, () => Option.some(last.answered)),
          },
          seen: pair,
        };
      if (pair === 'sound')
        return {
          proof: {
            ...next,
            quietFrom: Option.none(),
            sounded: true,
            heard: Option.some({ ...heardOf(last, read), acted: false, quiet: false }),
            place: Option.some(read.status.positionMs),
          },
          seen: pair,
        };
      const moved = read.status.positionMs - last.status.positionMs > slack;
      return {
        proof: {
          ...next,
          quietFrom: Option.none(),
          sounded: proof.sounded || moved,
        },
        seen: pair,
      };
    },
  });

const ended = (proof: Proof): Proof => ({
  ...proof,
  pending: Option.none(),
  short: Option.none(),
  last: Option.none(),
  quietFrom: Option.none(),
  place: Option.none(),
});

const placed = (after: Proved, read: Read): Proved => {
  const letGo =
    read.status.state === 'idle' || (read.status.state === 'failed' && read.status.positionMs <= 0);
  const atEnd =
    Option.isNone(after.proof.place) &&
    Option.exists(
      Option.fromNullishOr(read.status.durationMs),
      (length) => read.status.positionMs >= length - slack,
    );
  if (!after.proof.sounded || letGo || atEnd) return after;
  return { ...after, proof: { ...after.proof, place: Option.some(read.status.positionMs) } };
};

const beforeLanding = (pending: Pending, read: Read) => {
  const length = read.status.durationMs ?? read.status.positionMs;
  return length - pending.target > read.answered - pending.known + slack;
};

export const readOf = (proof: Proof, read: Read, landable: boolean): Proved => {
  const after = proved(proof, read, landable);
  if (after.seen === 'stale' || !stopped(proof, read)) return after;
  return {
    ...after,
    proof: {
      ...after.proof,
      heard: Option.map(after.proof.heard, (it) => ({ ...it, quiet: true })),
    },
  };
};

const stopped = (proof: Proof, read: Read) =>
  read.status.state !== 'playing' &&
  read.status.state !== 'ended' &&
  Option.match(proof.pending, {
    onNone: () =>
      Option.exists(
        proof.heard,
        (it) =>
          !it.acted ||
          (read.asked < proof.landed &&
            near(read, it.place, it.at) &&
            !Option.exists(proof.place, (place) => near(read, place, proof.known))),
      ),
    onSome: () => false,
  });

const near = (read: Read, place: number, since: number) =>
  read.status.positionMs >= place - slack &&
  read.status.positionMs <= place + slack + (read.answered - since);

const proved = (proof: Proof, read: Read, landable: boolean): Proved => {
  if (read.asked < proof.known) return { proof, seen: 'stale' };
  if (read.status.state === 'ended') {
    const short = Option.filter(
      Option.orElse(proof.pending, () => proof.short),
      (it) => landable && beforeLanding(it, read),
    );
    return {
      proof: { ...ended(proof), short, place: Option.map(short, (it) => it.target) },
      seen: 'nothing',
    };
  }
  if (read.asked < proof.endedAt) return { proof, seen: 'stale' };
  if (read.asked < proof.landed)
    return {
      proof: {
        ...proof,
        last: Option.flatMap(proof.last, (last) => {
          const ahead = read.status.positionMs - last.status.positionMs;
          if (Math.abs(ahead) <= slack) return Option.some(last);
          if (ahead > 0 && ahead <= Math.max(0, read.answered - last.asked) + slack)
            return Option.some(read);
          if (ahead < 0 && -ahead <= Math.max(0, last.answered - read.asked) + slack)
            return Option.some(last);
          return Option.none();
        }),
      },
      seen: 'nothing',
    };
  return Option.match(proof.pending, {
    onNone: () => placed(paired(proof, read), read),
    onSome: (pending) => {
      const quiet = Option.exists(pending.after, (after) => pairOf(after, read) === 'silence');
      const ahead = Option.exists(
        pending.after,
        (after) => read.status.positionMs - after.status.positionMs > slack,
      );
      const heard = Option.filter(
        pending.after,
        (after) =>
          pairOf(after, read) === 'sound' &&
          (read.status.positionMs < pending.target - slack ||
            after.status.positionMs >= pending.target - slack),
      );
      return {
        proof: {
          ...proof,
          heard: Option.match(heard, {
            onNone: () => proof.heard,
            onSome: (after) => Option.some({ ...heardOf(after, read), acted: true, quiet: false }),
          }),
          pending: Option.some({ ...pending, after: Option.some(read) }),
          quietFrom: Option.match(pending.after, {
            onNone: () => proof.quietFrom,
            onSome: (after) =>
              Option.flatMap(
                Option.liftPredicate(after, () => quiet),
                (it) => Option.orElse(proof.quietFrom, () => Option.some(it.answered)),
              ),
          }),
        },
        seen: Match.value(ahead).pipe(
          Match.when(true, (): Seen => 'ahead'),
          Match.orElse((): Seen => 'pending'),
        ),
      };
    },
  });
};

interface Answered {
  readonly proof: Proof;
  readonly landed: boolean;
}

export const answered = (proof: Proof, answer: Read, target: number): Answered => {
  const fresh = answer.asked >= proof.known;
  if (answer.status.state === 'ended' && fresh)
    return { proof: { ...ended(proof), endedAt: answer.answered }, landed: true };
  if (answer.status.state === 'ended') return { proof, landed: false };
  const lands = Option.exists(proof.pending, (pending) => {
    if (Math.abs(pending.target - target) > slack || pending.known > answer.asked) return false;
    const to = Option.match(Option.fromNullishOr(answer.status.durationMs), {
      onNone: () => pending.target,
      onSome: (length) => Math.min(pending.target, length),
    });
    const at = answer.status.positionMs;
    return at >= to - slack && at <= to + slack + (answer.answered - pending.known);
  });
  if (!lands) return { proof, landed: false };
  return {
    proof: {
      ...proof,
      landed: answer.answered,
      heard: Option.map(proof.heard, (it) => ({
        ...it,
        quiet: it.quiet || Option.isSome(proof.quietFrom),
      })),
      pending: Option.none(),
      last: Option.liftPredicate(answer, () => fresh),
      quietFrom: Option.none(),
    },
    landed: true,
  };
};

export const silentFor = (proof: Proof, read: Read) =>
  Option.match(proof.quietFrom, { onNone: () => 0, onSome: (from) => read.asked - from });

export const replacementAt = (proof: Proof, status: Option.Option<Status>): number => {
  if (Option.isSome(proof.pending)) return proof.pending.value.target;
  let at = Option.getOrElse(proof.place, () => 0);
  for (const read of Option.toArray(status)) {
    if (read.state !== 'failed' && read.state !== 'idle') at = Math.max(at, read.positionMs);
  }
  return at;
};
