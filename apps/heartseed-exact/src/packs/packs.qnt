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
