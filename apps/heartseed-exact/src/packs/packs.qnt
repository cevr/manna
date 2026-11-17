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
// features/packs.contract `packsFollow`): two packs over one launch, each
// fetched and settled on its own (its file written, or a failed try), and
// Contract's one call out at a time (`packsAsk`, then `packsWait` while an
// answer says `more`), whose answer is every pack's kept version at the
// moment it answers; Contract keeps it when it lands, a step later. With
// APART a call answers as soon as a pack has settled since the last
// answer (`news`), at the settle or at the call; without it, only once no
// pack is out, so one pack's settle waits on another's.
//
// Property: no pack that has settled waits, with a call out, for an
// answer that has not come (`apart`); a pack once kept stays kept, and
// nothing is kept that the file does not hold (`kept`). Checked by hand:
// `quint run --main=settle --invariant=safe --max-steps=12
// src/packs/packs.qnt` finds no violation; with APART false it finds one
// (a pack lands while the other's fetch is out). `settle.test.ts` drives
// the sources themselves in Bun.
module settle {
  pure val PACKS: Set[int] = Set(0, 1)
  // Whether a call answers at a pack's own settle.
  pure val APART: bool = true

  // A fetch out, per pack.
  var flying: int -> bool
  // The launch's machine keeps the pack (its file is written).
  var ready: int -> bool
  // Settled since the last answer.
  var news: int -> bool
  // A call out, and whether it has its answer (not yet landed).
  var calling: bool
  var answered: bool
  // The answer: every pack's kept version, and whether any was still out.
  var snap: int -> bool
  var snapMore: bool
  // Contract's `packsKept`, and every pack it has ever kept.
  var shown: int -> bool
  var everShown: int -> bool

  val noNews = PACKS.mapBy(_ => false)

  // Whether a call answers now, with `outs` out and `newsNow` the settles since the last answer.
  def answersNow(outs: int -> bool, newsNow: int -> bool): bool =
    not(PACKS.exists(p => outs.get(p))) or (APART and PACKS.exists(p => newsNow.get(p)))

  action init = all {
    flying' = noNews,
    ready' = noNews,
    news' = noNews,
    calling' = false,
    answered' = false,
    snap' = noNews,
    snapMore' = false,
    shown' = noNews,
    everShown' = noNews,
  }

  // A call sent with `outs` out: answered at once when it may, else left out.
  action call(outs: int -> bool, newsNow: int -> bool): bool = {
    val answering = answersNow(outs, newsNow)
    all {
      calling' = true,
      answered' = answering,
      snap' = if (answering) ready else snap,
      snapMore' = if (answering) PACKS.exists(p => outs.get(p)) else snapMore,
      news' = if (answering) noNews else newsNow,
    }
  }

  // The Read tab shown (`force` false: a pack not kept fetches) or Try again (every pack not out); the new call forgets the one before.
  action ask(force: bool): bool = {
    val outs = PACKS.mapBy(p => flying.get(p) or force or not(ready.get(p)))
    all {
      flying' = outs,
      ready' = ready,
      shown' = shown,
      everShown' = everShown,
      call(outs, news),
    }
  }

  // A pack's fetch settles: its file written (`lands`) or a failed try; a call waiting answers if it may.
  action settle(p: int, lands: bool): bool = {
    val outs = flying.set(p, false)
    val readies = ready.set(p, ready.get(p) or lands)
    val newsNow = news.set(p, true)
    val answering = calling and not(answered) and answersNow(outs, newsNow)
    all {
      flying.get(p),
      flying' = outs,
      ready' = readies,
      calling' = calling,
      answered' = (answered or answering),
      snap' = if (answering) readies else snap,
      snapMore' = if (answering) PACKS.exists(q => outs.get(q)) else snapMore,
      news' = if (answering) noNews else newsNow,
      shown' = shown,
      everShown' = everShown,
    }
  }

  // The answer lands: Contract keeps it, and `packsFollow` sends `packsWait` when it says more.
  action land: bool = all {
    answered,
    flying' = flying,
    ready' = ready,
    shown' = snap,
    everShown' = PACKS.mapBy(p => everShown.get(p) or snap.get(p)),
    if (snapMore) call(flying, news)
    else all {
      calling' = false,
      answered' = false,
      snap' = snap,
      snapMore' = false,
      news' = news,
    },
  }

  // A relaunch: every fetch and call is lost; the files and Contract's persisted line stay.
  action relaunch: bool = all {
    flying' = noNews,
    ready' = ready,
    news' = noNews,
    calling' = false,
    answered' = false,
    snap' = snap,
    snapMore' = false,
    shown' = shown,
    everShown' = everShown,
  }

  action step = {
    nondet p = oneOf(PACKS)
    nondet lands = oneOf(Set(true, false))
    nondet force = oneOf(Set(true, false))
    any { ask(force), settle(p, lands), land, relaunch }
  }

  val apart = not(calling and not(answered) and PACKS.exists(p => news.get(p)))

  val kept = PACKS.forall(p => (everShown.get(p) implies shown.get(p)) and (shown.get(p) implies ready.get(p)))

  val safe = apart and kept
}
