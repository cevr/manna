// One pack's download (src/packs/step.ts, sources.ts): two launches of
// the app over one storage (a relaunch, or two web pages at once), each
// fetching the pack, writing it to its one file, then keeping its version
// (Contract's `persist`, after the fetch call answers). Every pack has its
// own file, machine and line of `packsKept`, so one pack is the model. A
// launch takes what is kept from the file's own version at its first ask
// (`keptOf`). The server may answer either of two versions. A write may
// fail, and a launch may be relaunched at any point, losing what it held
// but not the storage. With ATOMIC (sources.ts: one `atomicWriteFile`)
// the body reaches the file in one step; without it, in two, the first
// leaving a part of it.
//
// Property: the file is whole (absent, or a whole pack), and the version
// kept is never ahead of it: it names a pack the file has held. Checked by
// hand: `quint run --invariant=safe --max-steps=12
// src/packs/packs.qnt` finds no violation; with ATOMIC false it finds one
// (a launch's write is cut by a relaunch, or fails, after its first
// part). `quint typecheck` runs in test:slow; `step.test.ts` walks the
// step itself in Bun.
module packs {
  pure val LAUNCHES: Set[int] = Set(0, 1)
  pure val VERSIONS: Set[int] = Set(1, 2)
  // Whether a body reaches the file in one write.
  pure val ATOMIC: bool = true

  // A launch's place: 0 idle, 1 a fetch out, 2 a part written, 3 written and its version owed.
  var pc: int -> int
  // The version each launch's fetch answered.
  var got: int -> int
  // The file: the version of the pack it holds (0 for none), and whether all of it is there.
  var fileVersion: int
  var fileWhole: bool
  // The versions the file has held whole.
  var held: Set[int]
  // The version Contract keeps (0 for none).
  var kept: int

  action init = all {
    pc' = LAUNCHES.mapBy(_ => 0),
    got' = LAUNCHES.mapBy(_ => 0),
    fileVersion' = 0,
    fileWhole' = true,
    held' = Set(),
    kept' = 0,
  }

  // A launch asks: the Read tab shown, or Try again; the server answers `v`, checked.
  action fetch(launch: int, v: int): bool = all {
    pc.get(launch) == 0,
    pc' = pc.set(launch, 1),
    got' = got.set(launch, v),
    fileVersion' = fileVersion,
    fileWhole' = fileWhole,
    held' = held,
    kept' = kept,
  }

  // The fetch's body is written: whole at once (ATOMIC), or its first part; a write may fail, leaving the file as it was.
  action write(launch: int, lands: bool): bool = all {
    pc.get(launch) == 1,
    val v = got.get(launch)
    all {
      pc' = pc.set(launch, if (not(lands)) 0 else if (ATOMIC) 3 else 2),
      got' = got,
      fileVersion' = if (lands) v else fileVersion,
      fileWhole' = if (lands) ATOMIC else fileWhole,
      held' = if (lands and ATOMIC) held.union(Set(v)) else held,
      kept' = kept,
    },
  }

  // A two-step write's second part: the rest of the body, or a failure that leaves the part.
  action finish(launch: int, lands: bool): bool = all {
    pc.get(launch) == 2,
    pc' = pc.set(launch, if (lands) 3 else 0),
    got' = got,
    fileVersion' = fileVersion,
    fileWhole' = lands,
    held' = if (lands) held.union(Set(got.get(launch))) else held,
    kept' = kept,
  }

  // The fetch call answers and Contract keeps its version: only after the write.
  action keep(launch: int): bool = all {
    pc.get(launch) == 3,
    pc' = pc.set(launch, 0),
    got' = got,
    fileVersion' = fileVersion,
    fileWhole' = fileWhole,
    held' = held,
    kept' = got.get(launch),
  }

  // A relaunch at any point: the launch loses what it held; the storage stays.
  action relaunch(launch: int): bool = all {
    pc.get(launch) != 0,
    pc' = pc.set(launch, 0),
    got' = got,
    fileVersion' = fileVersion,
    fileWhole' = fileWhole,
    held' = held,
    kept' = kept,
  }

  action step = {
    nondet launch = oneOf(LAUNCHES)
    nondet v = oneOf(VERSIONS)
    nondet lands = oneOf(Set(true, false))
    any { fetch(launch, v), write(launch, lands), finish(launch, lands), keep(launch), relaunch(launch) }
  }

  val fileIsWhole = fileWhole and (fileVersion == 0 or held.contains(fileVersion))

  val versionNotAhead = kept == 0 or held.contains(kept)

  val safe = fileIsWhole and versionNotAhead
}

// Every pack's status settling apart (src/packs/sources.ts `nextAnswer`,
// features/packs.contract): two packs over one launch, each fetched and
// settled on its own (its file written, or a failed try), and one call out
// at a time a pack, its own mutation's (`packsAsk`, then `packsWait` while
// its answer says `more`). An answer carries every pack's kept version at
// the moment it answers and the launch's count of answers; Contract keeps
// it when it lands, a step later, in any order across packs. With APART a
// call answers as soon as its pack has settled since its last answer
// (`news`), at the settle or at the call; without it, only once no pack is
// out, so one pack's settle waits on another's. With NEWEST Contract keeps
// an answer's kept line only when it was given after the one it keeps
// (`packsTake`); without it, an older answer landing late takes a pack
// back out.
//
// Property: no pack that has settled waits, with its call out, for an
// answer that has not come (`apart`); a pack once kept stays kept, and
// nothing is kept that the file does not hold (`kept`). Checked by hand:
// `quint run --main=settle --invariant=safe --max-steps=12
// src/packs/packs.qnt` finds no violation; with APART false it finds one
// (a pack lands while the other's fetch is out), and with NEWEST false
// one too (an answer given before another lands after it). `settle.test.ts`
// drives the sources themselves in Bun.
module settle {
  pure val PACKS: Set[int] = Set(0, 1)
  // Whether a call answers at its pack's own settle.
  pure val APART: bool = true
  // Whether Contract keeps only an answer newer than the one it keeps.
  pure val NEWEST: bool = true

  // A fetch out, per pack.
  var flying: int -> bool
  // The launch's machine keeps the pack (its file is written).
  var ready: int -> bool
  // Settled since its last answer.
  var news: int -> bool
  // Each pack's call out, and whether it has its answer (not yet landed).
  var calling: int -> bool
  var answered: int -> bool
  // Each pack's answer: every pack's kept version, its count, and whether its pack was still out.
  var snap: int -> (int -> bool)
  var snapAt: int -> int
  var snapMore: int -> bool
  // The launch's count of answers given.
  var given: int
  // Contract's `packsKept`, the count of the answer it came from, and every pack it has ever kept.
  var shown: int -> bool
  var shownAt: int
  var everShown: int -> bool

  val none = PACKS.mapBy(_ => false)

  // Whether `p`'s call answers now, with `outs` out and `newsNow` the settles since each pack's last answer.
  def answersNow(p: int, outs: int -> bool, newsNow: int -> bool): bool =
    if (APART) not(outs.get(p)) or newsNow.get(p) else not(PACKS.exists(q => outs.get(q)))

  action init = all {
    flying' = none,
    ready' = none,
    news' = none,
    calling' = none,
    answered' = none,
    snap' = PACKS.mapBy(_ => none),
    snapAt' = PACKS.mapBy(_ => 0),
    snapMore' = none,
    given' = 0,
    shown' = none,
    shownAt' = 0,
    everShown' = none,
  }

  // The Read tab shown (`force` false: a pack not kept fetches) or Try again (every pack not out): a call a pack, each forgetting its pack's call before, answered at once when it may.
  action ask(force: bool): bool = {
    val outs = PACKS.mapBy(p => flying.get(p) or force or not(ready.get(p)))
    val answering = PACKS.mapBy(p => answersNow(p, outs, news))
    val count = if (PACKS.exists(p => answering.get(p))) given + 1 else given
    all {
      flying' = outs,
      ready' = ready,
      news' = PACKS.mapBy(p => news.get(p) and not(answering.get(p))),
      calling' = PACKS.mapBy(_ => true),
      answered' = answering,
      snap' = PACKS.mapBy(p => if (answering.get(p)) ready else snap.get(p)),
      snapAt' = PACKS.mapBy(p => if (answering.get(p)) count else snapAt.get(p)),
      snapMore' = PACKS.mapBy(p => if (answering.get(p)) outs.get(p) else snapMore.get(p)),
      given' = count,
      shown' = shown,
      shownAt' = shownAt,
      everShown' = everShown,
    }
  }

  // A pack's fetch settles: its file written (`lands`) or a failed try; its call, if waiting, answers if it may.
  action settle(p: int, lands: bool): bool = {
    val outs = flying.set(p, false)
    val readies = ready.set(p, ready.get(p) or lands)
    val newsNow = news.set(p, true)
    val answering = calling.get(p) and not(answered.get(p)) and answersNow(p, outs, newsNow)
    all {
      flying.get(p),
      flying' = outs,
      ready' = readies,
      news' = if (answering) newsNow.set(p, false) else newsNow,
      calling' = calling,
      answered' = answered.set(p, answered.get(p) or answering),
      snap' = if (answering) snap.set(p, readies) else snap,
      snapAt' = if (answering) snapAt.set(p, given + 1) else snapAt,
      snapMore' = if (answering) snapMore.set(p, false) else snapMore,
      given' = if (answering) given + 1 else given,
      shown' = shown,
      shownAt' = shownAt,
      everShown' = everShown,
    }
  }

  // `p`'s answer lands: Contract keeps it (if newer, with NEWEST), and its follow-up sends `packsWait` when it says more, answered at once if it may.
  action land(p: int): bool = {
    val takes = not(NEWEST) or snapAt.get(p) > shownAt
    val nowShown = if (takes) snap.get(p) else shown
    val again = snapMore.get(p)
    val answering = again and answersNow(p, flying, news)
    all {
      answered.get(p),
      flying' = flying,
      ready' = ready,
      shown' = nowShown,
      shownAt' = if (takes) snapAt.get(p) else shownAt,
      everShown' = PACKS.mapBy(q => everShown.get(q) or nowShown.get(q)),
      calling' = calling.set(p, again),
      answered' = answered.set(p, answering),
      news' = if (answering) news.set(p, false) else news,
      snap' = if (answering) snap.set(p, ready) else snap,
      snapAt' = if (answering) snapAt.set(p, given + 1) else snapAt,
      snapMore' = snapMore.set(p, answering and flying.get(p)),
      given' = if (answering) given + 1 else given,
    }
  }

  // A relaunch: every fetch and call is lost, and the count starts again; the files and Contract's persisted line stay.
  action relaunch: bool = all {
    flying' = none,
    ready' = ready,
    news' = none,
    calling' = none,
    answered' = none,
    snap' = snap,
    snapAt' = PACKS.mapBy(_ => 0),
    snapMore' = none,
    given' = 0,
    shown' = shown,
    shownAt' = 0,
    everShown' = everShown,
  }

  action step = {
    nondet p = oneOf(PACKS)
    nondet lands = oneOf(Set(true, false))
    nondet force = oneOf(Set(true, false))
    any { ask(force), settle(p, lands), land(p), relaunch }
  }

  val apart = PACKS.forall(p => not(calling.get(p) and not(answered.get(p)) and news.get(p)))

  val kept = PACKS.forall(p => (everShown.get(p) implies shown.get(p)) and (shown.get(p) implies ready.get(p)))

  val safe = apart and kept
}
