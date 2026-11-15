// The garden's writes (src/garden/writes.ts): two calls of the data module,
// each a read of the one file and one or two whole-file writes of it (a
// Show all's step back, then its recall), ordered by one queue. A call
// starts only while no other holds the queue, and lets it go after its
// last write. Properties: no lost update (once both end, the file holds
// every write of both, in one call's order then the other's) and no
// half-seen write (no read sees the file between one call's two writes).
// `writes.test.ts` walks the same machine whole in Bun; check this one with
// `quint verify --invariant=safe src/garden/writes.qnt`.
module writes {
  const CALLS: Set[int] = Set(0, 1)
  const WRITES: int -> int = Map(0 -> 2, 1 -> 2)

  // Each call's next step: 0 to read, 1..WRITES to write, past it done.
  var pc: int -> int
  // What each call read.
  var seen: int -> List[str]
  // The file: the writes it holds, in order.
  var file: List[str]
  // The call holding the queue, -1 for none.
  var owner: int
  // Whether a read saw the file between one call's writes.
  var halfSeen: bool

  pure def own(call: int, upTo: int): List[str] =
    range(0, upTo).foldl([], (acc, n) => acc.append(call.to_string() ++ "." ++ n.to_string()))

  action init = all {
    pc' = CALLS.mapBy(_ => 0),
    seen' = CALLS.mapBy(_ => []),
    file' = [],
    owner' = -1,
    halfSeen' = false,
  }

  action read(call: int): bool = all {
    pc.get(call) == 0,
    owner == -1,
    val midway = CALLS.exists(other => other != call and pc.get(other) > 1 and pc.get(other) <= WRITES.get(other))
    all {
      pc' = pc.set(call, 1),
      seen' = seen.set(call, file),
      file' = file,
      owner' = call,
      halfSeen' = halfSeen or midway,
    },
  }

  action write(call: int): bool = all {
    pc.get(call) >= 1,
    pc.get(call) <= WRITES.get(call),
    val n = pc.get(call)
    all {
      pc' = pc.set(call, n + 1),
      seen' = seen,
      file' = seen.get(call).concat(own(call, n)),
      owner' = if (n == WRITES.get(call)) -1 else owner,
      halfSeen' = halfSeen,
    },
  }

  action step = nondet call = oneOf(CALLS) any { read(call), write(call) }

  pure def serial(first: int, second: int): List[str] =
    own(first, WRITES.get(first)).concat(own(second, WRITES.get(second)))

  val ended = CALLS.forall(call => pc.get(call) > WRITES.get(call))

  val noLostUpdate = not(ended) or file == serial(0, 1) or file == serial(1, 0)

  val noHalfSeenWrite = not(halfSeen)

  val safe = noLostUpdate and noHalfSeenWrite
}
