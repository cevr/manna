// The garden's writes (src/garden/writes.ts): two calls of the data module,
// each a read of the one file and two whole-file writes of it (a Show
// all's step back, then its recall), ordered by one queue. A call starts
// only while no other holds the queue, and lets it go after its last write.
// Each write replaces the file with what its call read and the call's own
// writes so far. Properties: no lost update (once both end, the file holds
// every write of both, one call's then the other's) and no half-seen write
// (no read sees the file between one call's two writes). Checked by hand
// (README, "The garden and Your verses"): `bunx @informalsystems/quint
// verify --max-steps=10 --invariant=safe src/garden/writes.qnt` finds no
// violation; with `owner == -1` taken out of `read` (no queue) it finds a
// counterexample, a read between the other call's two writes.
// `writes.test.ts` walks the same machine whole in Bun.
module writes {
  pure val CALLS: Set[int] = Set(0, 1)
  // How many writes each call makes.
  pure val WRITES: int = 2

  // Each call's next step: 0 to read, 1..WRITES to write, past it done.
  var pc: int -> int
  // What each call read.
  var seen: int -> List[int]
  // Each call's own writes so far; call c's n-th write is 10 * c + n.
  var mine: int -> List[int]
  // The file: the writes it holds, in order.
  var file: List[int]
  // The call holding the queue, -1 for none.
  var owner: int
  // Whether a read saw the file between one call's writes.
  var halfSeen: bool

  action init = all {
    pc' = CALLS.mapBy(_ => 0),
    seen' = CALLS.mapBy(_ => []),
    mine' = CALLS.mapBy(_ => []),
    file' = [],
    owner' = -1,
    halfSeen' = false,
  }

  // Whether a call other than `call` stands between its own writes.
  def midway(call: int): bool =
    CALLS.exists(other => other != call and pc.get(other) > 1 and pc.get(other) <= WRITES)

  action read(call: int): bool = all {
    pc.get(call) == 0,
    owner == -1,
    pc' = pc.set(call, 1),
    seen' = seen.set(call, file),
    mine' = mine,
    file' = file,
    owner' = call,
    halfSeen' = (halfSeen or midway(call)),
  }

  action write(call: int): bool = all {
    pc.get(call) >= 1,
    pc.get(call) <= WRITES,
    val after = mine.get(call).append(10 * call + pc.get(call))
    all {
      pc' = pc.set(call, pc.get(call) + 1),
      seen' = seen,
      mine' = mine.set(call, after),
      file' = seen.get(call).concat(after),
      owner' = if (pc.get(call) == WRITES) -1 else owner,
      halfSeen' = halfSeen,
    },
  }

  val ended = CALLS.forall(call => pc.get(call) > WRITES)

  // Once both calls end, nothing changes.
  action rest: bool = all {
    ended,
    pc' = pc,
    seen' = seen,
    mine' = mine,
    file' = file,
    owner' = owner,
    halfSeen' = halfSeen,
  }

  action step = any { rest, nondet call = oneOf(CALLS) any { read(call), write(call) } }

  // Whether the file holds `want`, element by element (four writes in all).
  def holds(want: List[int]): bool =
    file.length() == 4 and Set(0, 1, 2, 3).forall(i => file[i] == want[i])

  val noLostUpdate = not(ended) or holds([1, 2, 11, 12]) or holds([11, 12, 1, 2])

  val noHalfSeenWrite = not(halfSeen)

  val safe = noLostUpdate and noHalfSeenWrite
}
