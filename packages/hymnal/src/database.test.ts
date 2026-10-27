import { Database } from 'bun:sqlite';
import { Effect } from 'effect';
import { describe, expect, it } from 'effect-bun-test';

import { CORPUS_SCHEMA } from './database.js';

describe('corpus database identity constraints', () => {
  it.effect(
    'refuses orphan children, duplicate part identities and duplicate chord placements',
    () =>
      Effect.acquireUseRelease(
        Effect.sync(() => new Database(':memory:')),
        (db) =>
          Effect.sync(() => {
            db.exec(CORPUS_SCHEMA);
            db.exec(`INSERT INTO hymns(id,book,number,kind,title,first_line,tonic,minor)
          VALUES(1,'sdah-1985',1,'hymn','Fixture','alpha','C',0)`);
            db.exec(`INSERT INTO stanzas VALUES(1,1,0,0,'Sung','syllable','[]','{}')`);
            db.exec(`INSERT INTO lines VALUES(1,1,0,'alpha')`);
            db.exec(`INSERT INTO syllables VALUES(1,1,0,'alpha',0,1,1)`);
            db.exec(`INSERT INTO chords VALUES(1,'full',0,0,0,'major',NULL)`);
            expect(() => db.exec(`INSERT INTO lines VALUES(2,999,0,'beta')`)).toThrow();
            expect(() =>
              db.exec(`INSERT INTO stanzas VALUES(2,1,1,0,'Plain','text','[]',NULL)`),
            ).toThrow();
            expect(() =>
              db.exec(`INSERT INTO chords VALUES(1,'full',0,1,7,'major',NULL)`),
            ).toThrow();
            expect(() =>
              db.exec(`INSERT INTO stanzas VALUES(2,1,1,1,'Plain','syllable','[]',NULL)`),
            ).toThrow();
          }),
        (db) => Effect.sync(() => db.close()),
      ),
  );
});
