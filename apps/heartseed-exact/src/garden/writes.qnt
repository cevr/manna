// The garden's writes (src/garden/writes.ts, src/garden/program.ts): two
// calls of the data module, each a read of the one file and two changes of
// it (a Show all's step back, then its recall), ordered by one queue. A call
// starts only while no other holds the queue, and lets it go after its last
// write, or after a write that fails. Each write replaces the file with what
// its call read and the call's own changes so far, or, when it fails, leaves
// the file as it was and ends the call. With STAGED (program.ts `stagedOf`)
// a call's two changes reach the file in one write.
//
// Properties: no lost update (once both end, the file holds every change of
// each call whose write landed, one call's then the other's, and nothing of
// a call whose write failed) and no half-seen write (no read, and no end,
// sees one of a call's changes without the other). Checked by hand:
// `quint run --invariant=safe --max-steps=12 src/garden/writes.qnt` finds no
// violation; with STAGED false it finds a counterexample (a recall's write
// fails after its step back landed, and the next call reads the half), and
// with `owner == -1` taken out of `read` (no queue) one where a read falls
// between the other call's two writes. `quint typecheck` runs in test:slow;
// `writes.test.ts` walks the same machine whole in Bun.
module writes {
  pure val CALLS: Set[int] = Set(0, 1)
  // How many changes each call makes.
  pure val WRITES: int = 2
  // Whether a call's changes reach the file in one write.
  pure val STAGED: bool = true

  // Each call's next step: 0 to read, 1..WRITES to write, past it done.
  var pc: int -> int
  // What each call read.
  var seen: int -> List[int]
  // The file: the changes it holds, in order; call c's n-th change is 10 * c + n.
  var file: List[int]
  // The call holding the queue, -1 for none.
  var owner: int
  // Whether a read saw one of a call's changes without the other.
  var halfSeen: bool
  // The calls whose write failed.
  var failed: Set[int]

  pure def has(f: List[int], v: int): bool = f.select(x => x == v).length() > 0

  // Whether `f` holds a call's first change without its last.
  pure def half(f: List[int]): bool =
    CALLS.exists(c => has(f, 10 * c + 1) and not(has(f, 10 * c + WRITES)))

  // Call c's changes 1..n.
  pure def changes(c: int, n: int): List[int] =
    1.to(n).fold([], (acc, k) => acc.append(10 * c + k))

  action init = all {
    pc' = CALLS.mapBy(_ => 0),
    seen' = CALLS.mapBy(_ => []),
    file' = [],
    owner' = -1,
    halfSeen' = false,
    failed' = Set(),
  }

  action read(call: int): bool = all {
    pc.get(call) == 0,
    owner == -1,
    pc' = pc.set(call, 1),
    seen' = seen.set(call, file),
    file' = file,
    owner' = call,
    halfSeen' = (halfSeen or half(file)),
    failed' = failed,
  }

  action write(call: int, lands: bool): bool = all {
    pc.get(call) >= 1,
    pc.get(call) <= WRITES,
    val last = if (STAGED) WRITES else pc.get(call)
    val done = not(lands) or last == WRITES
    all {
      pc' = pc.set(call, if (done) WRITES + 1 else last + 1),
      seen' = seen,
      file' = if (lands) seen.get(call).concat(changes(call, last)) else file,
      owner' = if (done) -1 else owner,
      halfSeen' = halfSeen,
      failed' = if (lands) failed else failed.union(Set(call)),
    },
  }

  val ended = CALLS.forall(call => pc.get(call) > WRITES)

  // Once both calls end, nothing changes.
  action rest: bool = all {
    ended,
    pc' = pc,
    seen' = seen,
    file' = file,
    owner' = owner,
    halfSeen' = halfSeen,
    failed' = failed,
  }

  action step = any {
    rest,
    nondet call = oneOf(CALLS)
    nondet lands = oneOf(Set(true, false))
    any { read(call), write(call, lands) },
  }

  // What a call leaves in the file once ended: all its changes, or none when its write failed.
  def landed(c: int): List[int] = if (failed.contains(c)) [] else changes(c, WRITES)

  val noLostUpdate =
    not(ended) or file == landed(0).concat(landed(1)) or file == landed(1).concat(landed(0))

  val noHalfSeenWrite = not(halfSeen) and not(ended and half(file))

  val safe = noLostUpdate and noHalfSeenWrite
}
