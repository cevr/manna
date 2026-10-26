-- What lives outside the list's model (`src/list/`), which names subscribers
-- by an id only: a keyed hash of the address (`src/mail/tokens.ts`).
-- Times are milliseconds since 1970 (UTC).

-- Each subscriber's address, kept where it can be deleted: the model's event
-- log keeps what it is given for good. `kept_at` is when it was last written,
-- so a sign-up that ran out forgets only the address it gave
-- (`src/mail/addresses.ts`).
CREATE TABLE addresses (
  subscriber TEXT PRIMARY KEY,
  address TEXT NOT NULL,
  kept_at INTEGER NOT NULL
);

-- Who is on the list and which film letters each was sent, as the model's
-- events say (`src/list/Roster.projection.ts`): what a film's send asks who
-- still waits for it (`src/mail/roster.ts`).
CREATE TABLE roster (
  subscriber TEXT PRIMARY KEY,
  confirmed INTEGER NOT NULL CHECK (confirmed IN (0, 1))
);

CREATE INDEX roster_by_confirmed ON roster (confirmed, subscriber);

-- A film's letter to a subscriber: 'sending' while it goes (and for good
-- when its send stopped before its outcome was kept), then 'sent', or
-- 'refused' for good.
CREATE TABLE roster_letters (
  film TEXT NOT NULL,
  subscriber TEXT NOT NULL,
  letter TEXT NOT NULL CHECK (letter IN ('sending', 'sent', 'refused')),
  PRIMARY KEY (film, subscriber)
);
