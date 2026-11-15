// The player's protocol: the reader, one `audio` element per load, and the
// platform (the lock screen, Control Center, an interruption), each event
// of the element reaching the player as its own call, late. One element's
// events arrive in the order it raised them (Exact queues the calls of
// `playerStepped`); the reader and the platform act between any two.
//
// `protocol.test.ts` checks this model by a breadth-first search of every
// state within 20 actions, over `step` itself in place of `player` below;
// the actions and properties are the same, by name.
//
//   quint run src/player/protocol.qnt --invariant=safe --max-steps=20
//
// (Quint is not installed here: the Bun search is the check that runs.)

module protocol {
  type Phase = str // "none" | "loading" | "playing" | "paused" | "ended" | "failed"
  type Echo = str // "played" | "paused"
  // `echo`: the element raised it doing what the player told it, not on
  // the platform's act; the player cannot see this, the properties can.
  type Event = { tag: str, id: int, echo: bool }

  // The player's state: what `step` keeps of it.
  var phase: Phase
  var load: int
  var loads: int
  var wants: str // "play" | "pause"
  var owed: List[Echo]

  // The element: which load it holds, whether it sounds, whether it broke.
  var element: int
  var sounds: bool
  var broken: bool

  // The element's events not yet stepped, in the order it raised them.
  var inbox: List[Event]

  // The reader paused, and nothing since asked to hear.
  var held: bool

  // The reader's ask turned the player to play, and nothing since (the
  // reader's pause or stop, the platform's pause, the element's end or
  // failure) stopped it.
  var hearing: bool

  // An echo, stepped while `hearing`, turned the player to pause.
  var undone: bool

  pure val INBOX = 4

  action init = all {
    phase' = "none", load' = 0, loads' = 0, wants' = "pause", owed' = List(),
    element' = 0, sounds' = false, broken' = false, inbox' = List(), held' = false,
    hearing' = false, undone' = false,
  }

  // The view draws the element as the player asks: a new load is a new
  // element, which starts playing and says so.
  action fresh = all {
    phase' = "loading", wants' = "play", load' = loads + 1, loads' = loads + 1,
    owed' = List("played"),
    element' = loads + 1, sounds' = true, broken' = false,
    inbox' = inbox.concat(List(
      { tag: "loaded", id: loads + 1, echo: false },
      { tag: "played", id: loads + 1, echo: true },
      { tag: "playing", id: loads + 1, echo: false })),
  }

  // The reader's play of a paused hymn: it plays on.
  action readerResume = all {
    inbox.length() + 2 <= INBOX, phase == "paused",
    phase' = "loading", wants' = "play", owed' = owed.append("played"),
    load' = load, loads' = loads, element' = element, broken' = broken,
    sounds' = if (broken or sounds) sounds else true,
    inbox' = if (broken or sounds) inbox
      else inbox.concat(List({ tag: "played", id: load, echo: true },
        { tag: "playing", id: load, echo: false })),
    held' = false, hearing' = true, undone' = undone,
  }

  // The reader's play with nothing paused: a new load.
  action readerPlay = all {
    inbox.length() + 3 <= INBOX, phase.in(Set("none", "ended", "failed")),
    fresh,
    held' = false, hearing' = true, undone' = undone,
  }

  action readerPause = all {
    phase.in(Set("loading", "playing")), wants == "play", inbox.length() + 1 <= INBOX,
    phase' = "paused", wants' = "pause", owed' = owed.append("paused"),
    load' = load, loads' = loads, element' = element, broken' = broken,
    sounds' = false,
    inbox' = if (sounds and not(broken)) inbox.append({ tag: "paused", id: load, echo: true }) else inbox,
    held' = true, hearing' = false, undone' = undone,
  }

  action readerStop = all {
    phase' = "none", wants' = "pause", owed' = List(), load' = 0, loads' = loads,
    element' = 0, sounds' = false, broken' = false, inbox' = inbox, held' = false,
    hearing' = false, undone' = undone,
  }

  // The element on its own, and the platform on it.
  action elementEnds = all {
    sounds, inbox.length() + 1 <= INBOX, sounds' = false,
    inbox' = inbox.append({ tag: "ended", id: element, echo: false }),
    phase' = phase, load' = load, loads' = loads, wants' = wants, owed' = owed,
    element' = element, broken' = broken, held' = held, hearing' = false, undone' = undone,
  }

  action elementFails = all {
    sounds, inbox.length() + 1 <= INBOX, sounds' = false, broken' = true,
    inbox' = inbox.append({ tag: "failed", id: element, echo: false }),
    phase' = phase, load' = load, loads' = loads, wants' = wants, owed' = owed,
    element' = element, held' = held, hearing' = false, undone' = undone,
  }

  action platformPauses = all {
    sounds, inbox.length() + 1 <= INBOX, sounds' = false,
    inbox' = inbox.append({ tag: "paused", id: element, echo: false }),
    phase' = phase, load' = load, loads' = loads, wants' = wants, owed' = owed,
    element' = element, broken' = broken, held' = held, hearing' = false, undone' = undone,
  }

  action platformPlays = all {
    element != 0, not(sounds), not(broken), inbox.length() + 2 <= INBOX, sounds' = true,
    inbox' = inbox.concat(List({ tag: "played", id: element, echo: false },
      { tag: "playing", id: element, echo: false })),
    phase' = phase, load' = load, loads' = loads, wants' = wants, owed' = owed,
    element' = element, broken' = broken, held' = false, hearing' = hearing, undone' = undone,
  }

  // An element's first event not yet stepped, stepped: an event of another
  // load changes nothing; the echo owed first is paid; an end while the
  // element's `play` is still owed came before that play, and changes
  // nothing; any other `played` or `paused` lets every debt go and is the
  // platform's.
  action deliver = all {
    inbox.length() > 0,
    nondet i = inbox.indices().oneOf()
    val e = inbox[i]
    val first = inbox.indices().forall(j => j >= i or inbox[j].id != e.id)
    val mine = e.id == load and phase != "failed" and phase != "none"
    val echo = owed.length() > 0 and owed.head() == e.tag
    val stale = e.tag == "ended" and owed.select(x => x == "played").length() > 0
    val inert = not(mine) or echo or stale
    val nextWants =
      if (inert) wants
      else if (e.tag == "played" and phase.in(Set("paused", "ended"))) "play"
      else if (e.tag.in(Set("paused", "ended"))) "pause"
      else wants
    all {
      first,
      inbox' = inbox.slice(0, i).concat(inbox.slice(i + 1, inbox.length())),
      phase' =
        if (inert) phase
        else if (e.tag == "playing" and wants == "play" and phase == "loading") "playing"
        else if (e.tag == "played" and phase.in(Set("paused", "ended"))) "loading"
        else if (e.tag == "paused" and wants == "play" and phase.in(Set("loading", "playing"))) "paused"
        else if (e.tag == "ended") "ended"
        else if (e.tag == "failed") "failed"
        else phase,
      wants' = nextWants,
      owed' =
        if (not(mine) or stale) owed
        else if (echo) owed.tail()
        else if (e.tag.in(Set("played", "paused", "ended"))) List()
        else owed,
      load' = load, loads' = loads, element' = element, sounds' = sounds, broken' = broken,
      held' = held, hearing' = hearing,
      undone' = (undone or (e.echo and hearing and mine and nextWants == "pause")),
    },
  }

  action step = any {
    readerPlay, readerResume, readerPause, readerStop,
    elementEnds, elementFails, platformPauses, platformPlays,
    deliver,
  }

  // Once every event is stepped, only the held load sounds, and only while
  // the player wants to hear it.
  val neverTwoLoadsSounding = inbox.length() > 0 or not(sounds) or (element == load and wants == "play")

  // After the reader's pause, with no play since, once every event is
  // stepped the player is silent and the element too.
  val pauseNeverUndone = inbox.length() > 0 or not(held)
    or (phase.in(Set("paused", "ended", "failed")) and not(sounds))

  // After the reader's ask to hear, with nothing since that stopped it,
  // once every event is stepped the player wants to hear and the element
  // sounds, a failed load aside.
  val settledAsAsked = inbox.length() > 0 or not(hearing) or phase == "failed"
    or (wants == "play" and sounds)

  // No echo of the player's own command undoes the reader's ask, settled
  // or not.
  val resumeNeverUndone = not(undone)

  val safe = neverTwoLoadsSounding and pauseNeverUndone and settledAsAsked and resumeNeverUndone
}
