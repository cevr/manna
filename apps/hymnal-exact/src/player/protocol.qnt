// The player's protocol: the reader, one `audio` element per load, and the
// platform (the lock screen, Control Center, an interruption), each event
// of the element reaching the player as its own call, late. One element's
// events arrive in the order it raised them (Exact queues the calls of
// `playerStepped`); the reader and the platform act between any two.
//
// The element plays from place to place (whole seconds, 0 to 5); the
// stanza choice leaves out the span from 2 to 3, so a place of 2 the
// player hears is sought across to 3 (a skip); the reader may seek to 4.
// Each seek is a new serial; the element's `time` and `seeked` name the
// serial it had last been told, and a place sent is held until a `time` of
// that serial reaches it or its `seeked` comes.
//
// `protocol.test.ts` checks this model by a breadth-first search of every
// state within its depth, over `step` itself in place of `player` below;
// the actions and properties are the same, by name.
//
//   bunx @informalsystems/quint run --invariant=safe --max-steps=20 src/player/protocol.qnt

module protocol {
  type Phase = str // "none" | "loading" | "playing" | "paused" | "ended" | "failed"
  type Echo = str // "played" | "paused"
  // `echo`: the element raised it doing what the player told it, not on
  // the platform's act; the player cannot see this, the properties can.
  // `place` and `told`: a `time`'s place, and the serial the element had
  // last been told when it raised a `time` or `seeked`.
  type Event = { tag: str, id: int, echo: bool, place: int, told: int }

  pure def ev(tag: str, id: int, echo: bool): Event = { tag: tag, id: id, echo: echo, place: 0, told: 0 }

  pure val INBOX = 4
  pure val END = 5
  // The span the choice leaves out starts here and is sung again from `SKIP_TO`.
  pure val SPAN = 2
  pure val SKIP_TO = 3
  pure val READER_SEEK = 4

  // The player's state: what `step` keeps of it.
  var phase: Phase
  var load: int
  var loads: int
  var wants: str // "play" | "pause"
  var owed: List[Echo]
  var known: bool // the load's length is known
  var at: int
  var seek: int
  var holding: bool
  var sought: int

  // The element: which load it holds, whether it sounds, whether it broke,
  // where it is and the last seek it was told.
  var element: int
  var sounds: bool
  var broken: bool
  var place: int
  var told: int

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

  // The lock screen paused, or an interruption, and nothing since asked to hear.
  var stopped: bool

  // The last seek sent was the reader's, to this place, and the element
  // has not played on since; -1 otherwise.
  var sent: int

  // A `time` raised before the latest seek moved the place.
  var moved: bool

  action init = all {
    phase' = "none", load' = 0, loads' = 0, wants' = "pause", owed' = List(),
    known' = false, at' = 0, seek' = 0, holding' = false, sought' = 0,
    element' = 0, sounds' = false, broken' = false, place' = 0, told' = 0,
    inbox' = List(), held' = false, hearing' = false, undone' = false,
    stopped' = false, sent' = -1, moved' = false,
  }

  action keepSeek = all {
    known' = known, at' = at, seek' = seek, holding' = holding, sought' = sought,
    place' = place, told' = told,
  }

  // The view draws the element as the player asks: a new load is a new
  // element, which starts playing and says so.
  action fresh = all {
    phase' = "loading", wants' = "play", load' = loads + 1, loads' = loads + 1,
    owed' = List("played"),
    known' = false, at' = 0, seek' = 0, holding' = false, sought' = 0,
    element' = loads + 1, sounds' = true, broken' = false, place' = 0, told' = 0,
    inbox' = inbox.concat(List(
      ev("loaded", loads + 1, false),
      ev("played", loads + 1, true),
      ev("playing", loads + 1, false))),
    sent' = -1,
  }

  // A play of a paused hymn: it plays on.
  action resumes = all {
    inbox.length() + 2 <= INBOX, phase == "paused",
    phase' = "loading", wants' = "play", owed' = owed.append("played"),
    load' = load, loads' = loads, element' = element, broken' = broken,
    sounds' = if (broken or sounds) sounds else true,
    inbox' = if (broken or sounds) inbox
      else inbox.concat(List(ev("played", load, true), ev("playing", load, false))),
    keepSeek, sent' = sent, moved' = moved, undone' = undone,
  }

  // A pause of a sounding hymn: the element's report of it is owed.
  action pauses = all {
    phase.in(Set("loading", "playing")), wants == "play", inbox.length() + 1 <= INBOX,
    phase' = "paused", wants' = "pause", owed' = owed.append("paused"),
    load' = load, loads' = loads, element' = element, broken' = broken,
    sounds' = false,
    inbox' = if (sounds and not(broken)) inbox.append(ev("paused", load, true)) else inbox,
    keepSeek, sent' = sent, moved' = moved, undone' = undone,
  }

  action readerResume = all { resumes, held' = false, hearing' = true, stopped' = false }

  // The reader's play with nothing paused: a new load.
  action readerPlay = all {
    inbox.length() + 3 <= INBOX, phase.in(Set("none", "ended", "failed")),
    fresh,
    held' = false, hearing' = true, stopped' = false, undone' = undone, moved' = moved,
  }

  action readerPause = all { pauses, held' = true, hearing' = false, stopped' = stopped }

  action readerStop = all {
    phase' = "none", wants' = "pause", owed' = List(), load' = 0, loads' = loads,
    known' = false, at' = 0, seek' = 0, holding' = false, sought' = 0,
    element' = 0, sounds' = false, broken' = false, place' = 0, told' = 0,
    inbox' = inbox, held' = false, hearing' = false, undone' = undone,
    stopped' = false, sent' = -1, moved' = moved,
  }

  // The reader's seek: a new serial, the place held, the element told.
  action readerSeek = all {
    element == load, element != 0, not(broken), known, at != READER_SEEK,
    phase.in(Set("loading", "playing", "paused")), inbox.length() + 1 <= INBOX,
    seek' = seek + 1, sought' = READER_SEEK, at' = READER_SEEK, holding' = true,
    place' = READER_SEEK, told' = seek + 1,
    inbox' = inbox.append({ tag: "seeked", id: element, echo: true, place: 0, told: seek + 1 }),
    sent' = READER_SEEK,
    phase' = phase, load' = load, loads' = loads, wants' = wants, owed' = owed, known' = known,
    element' = element, sounds' = sounds, broken' = broken,
    held' = held, hearing' = hearing, undone' = undone, stopped' = stopped, moved' = moved,
  }

  // The lock screen's pause, or an interruption: the platform pauses the
  // element, which reports it, and tells the player apart.
  action platformRemotePause = all { pauses, held' = held, hearing' = false, stopped' = true }

  action platformInterrupts = platformRemotePause

  action platformRemotePlay = all { resumes, held' = false, hearing' = hearing, stopped' = false }

  action keepPlayer = all {
    phase' = phase, load' = load, loads' = loads, wants' = wants, owed' = owed,
    known' = known, at' = at, seek' = seek, holding' = holding, sought' = sought,
  }

  // The element on its own, and the platform on it.
  action elementPlaysOn = all {
    sounds, place < END, inbox.length() + 1 <= INBOX,
    place' = place + 1,
    inbox' = inbox.append({ tag: "time", id: element, echo: false, place: place + 1, told: told }),
    keepPlayer, element' = element, sounds' = sounds, broken' = broken, told' = told,
    held' = held, hearing' = hearing, undone' = undone, stopped' = stopped,
    sent' = -1, moved' = moved,
  }

  action elementEnds = all {
    sounds, inbox.length() + 1 <= INBOX, sounds' = false,
    inbox' = inbox.append(ev("ended", element, false)),
    keepPlayer, element' = element, broken' = broken, place' = place, told' = told,
    held' = held, hearing' = false, undone' = undone, stopped' = stopped, sent' = sent,
    moved' = moved,
  }

  action elementFails = all {
    sounds, inbox.length() + 1 <= INBOX, sounds' = false, broken' = true,
    inbox' = inbox.append(ev("failed", element, false)),
    keepPlayer, element' = element, place' = place, told' = told,
    held' = held, hearing' = false, undone' = undone, stopped' = stopped, sent' = sent,
    moved' = moved,
  }

  action platformPauses = all {
    sounds, inbox.length() + 1 <= INBOX, sounds' = false,
    inbox' = inbox.append(ev("paused", element, false)),
    keepPlayer, element' = element, broken' = broken, place' = place, told' = told,
    held' = held, hearing' = false, undone' = undone, stopped' = stopped, sent' = sent,
    moved' = moved,
  }

  action platformPlays = all {
    element != 0, not(sounds), not(broken), inbox.length() + 2 <= INBOX, sounds' = true,
    inbox' = inbox.concat(List(ev("played", element, false), ev("playing", element, false))),
    keepPlayer, element' = element, broken' = broken, place' = place, told' = told,
    held' = false, hearing' = hearing, undone' = undone, stopped' = false, sent' = sent,
    moved' = moved,
  }

  // An element's first event not yet stepped, stepped: an event of another
  // load changes nothing; the echo owed first is paid; an end while the
  // element's `play` is still owed came before that play, and changes
  // nothing; any other `played` or `paused` lets every debt go and is the
  // platform's. A `time` or `seeked` of an older seek changes nothing; a
  // `time` of the held seek releases a held place it reaches, else moves
  // the place on, and a place in the span the choice leaves out is sought
  // across.
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
    val ends = not(inert) and e.tag == "ended"
    val timed = e.tag == "time" and mine and e.told == seek and phase != "ended"
    val reached = holding and e.place == sought
    val atTimed =
      if (not(timed)) at
      else if (holding) (if (reached) e.place else at)
      else if (e.place > at) e.place
      else at
    val holdTimed = if (timed and reached) false else holding
    val skips = timed and not(holdTimed) and phase.in(Set("loading", "playing"))
      and wants == "play" and known and atTimed == SPAN
    val settles = e.tag == "seeked" and mine and e.told == seek and holding
    val nextAt = if (skips) SKIP_TO else if (ends) END else atTimed
    val rest = inbox.slice(0, i).concat(inbox.slice(i + 1, inbox.length()))
    all {
      first,
      inbox' =
        if (skips and not(broken))
          rest.append({ tag: "seeked", id: element, echo: true, place: 0, told: seek + 1 })
        else rest,
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
      known' = (known or (e.tag == "loaded" and mine)),
      at' = nextAt,
      holding' = if (skips) true else if (ends or settles) false else holdTimed,
      seek' = if (skips) seek + 1 else seek,
      sought' = if (skips) SKIP_TO else sought,
      place' = if (skips) SKIP_TO else place,
      told' = if (skips) seek + 1 else told,
      sent' = if (skips) -1 else sent,
      moved' = (moved or (e.tag == "time" and mine and e.told < seek and nextAt != at)),
      load' = load, loads' = loads, element' = element, sounds' = sounds, broken' = broken,
      held' = held, hearing' = hearing, stopped' = stopped,
      undone' = (undone or (e.echo and hearing and mine and nextWants == "pause")),
    },
  }

  action step = any {
    readerPlay, readerResume, readerPause, readerStop, readerSeek,
    platformRemotePause, platformInterrupts, platformRemotePlay,
    elementPlaysOn, elementEnds, elementFails, platformPauses, platformPlays,
    deliver,
  }

  // Once every event is stepped, only the held load sounds, and only while
  // the player wants to hear it.
  val neverTwoLoadsSounding = inbox.length() > 0 or not(sounds) or (element == load and wants == "play")

  // After the reader's pause, with no play since, once every event is
  // stepped the player is silent and the element too.
  val pauseNeverUndone = inbox.length() > 0 or not(held)
    or (phase.in(Set("paused", "ended", "failed")) and not(sounds))

  // After the lock screen's pause or an interruption, a skip in flight or
  // not, with no play since, once every event is stepped the player is
  // silent and the element too.
  val remotePauseStays = inbox.length() > 0 or not(stopped)
    or (phase.in(Set("paused", "ended", "failed")) and not(sounds))

  // After the reader's ask to hear, with nothing since that stopped it,
  // once every event is stepped the player wants to hear and the element
  // sounds, a failed load aside.
  val settledAsAsked = inbox.length() > 0 or not(hearing) or phase == "failed"
    or (wants == "play" and sounds)

  // No echo of the player's own command undoes the reader's ask, settled
  // or not.
  val resumeNeverUndone = not(undone)

  // No `time` the element raised before the latest seek moves the place.
  val seekNeverUndoneByLateTime = not(moved)

  // When the reader's seek is the last one sent, once every event is
  // stepped the player and the element stand where the reader sent them.
  val skipAndSeekEndAtReaders = inbox.length() > 0 or sent < 0 or element != load or element == 0
    or (sought == sent and place == sent)

  val safe = neverTwoLoadsSounding and pauseNeverUndone and remotePauseStays and settledAsAsked
    and resumeNeverUndone and seekNeverUndoneByLateTime and skipAndSeekEndAtReaders
}
