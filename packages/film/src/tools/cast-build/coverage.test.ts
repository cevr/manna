// A member's coverage (`coverageOf`): an entry is complete when it is drawn
// and kept, and a puppet also cut, its bars passed and its fit rows passed;
// the report names exactly the unmet requirements, in that order. A puppet
// entry cut from its own sheet is trainable when it misses neither drawn,
// kept, cut nor fit; its bars do not count.

import { describe, expect, test as it } from 'bun:test';
import { Schema } from 'effect';
import { Coverage, coverageOf } from './coverage.ts';

const ALL = { drawn: true, kept: true, cut: true, bars: true, fit: true };

describe('a member coverage', () => {
  it('names a puppet entry missing its cut, bars and fit, in order', () => {
    const report = coverageOf(
      { member: 'lead', entries: [{ id: 'raise/k2', cut: 'puppet' }] },
      { 'raise/k2': { drawn: true, kept: true, cut: false, bars: false, fit: false } },
    );
    expect(report).toEqual({
      member: 'lead',
      complete: false,
      entries: [
        {
          id: 'raise/k2',
          cut: 'puppet',
          missing: ['cut', 'bars', 'fit'],
          unmeasured: [],
          trainable: false,
        },
      ],
    });
  });

  it('holds a key to its drawing and its keep alone', () => {
    const report = coverageOf(
      { member: 'lead', entries: [{ id: 'raise/k4', cut: 'key' }] },
      { 'raise/k4': { drawn: true, kept: true, cut: false, bars: false, fit: false } },
    );
    expect(report.complete).toBe(true);
    expect(report.entries[0]?.missing).toEqual([]);
  });

  it('is incomplete when one entry of several misses one requirement', () => {
    const report = coverageOf(
      {
        member: 'lead',
        entries: [
          { id: 'turnaround-front', cut: 'puppet' },
          { id: 'raise/k5', cut: 'key' },
        ],
      },
      { 'turnaround-front': ALL, 'raise/k5': { ...ALL, kept: false } },
    );
    expect(report.complete).toBe(false);
    expect(report.entries.map((e) => e.missing)).toEqual([[], ['kept']]);
  });

  it('counts an entry with no facts as missing every requirement', () => {
    const report = coverageOf(
      { member: 'lead', entries: [{ id: 'poses-poses-1', cut: 'puppet' }] },
      {},
    );
    expect(report.entries[0]?.missing).toEqual(['drawn', 'kept', 'cut', 'bars', 'fit']);
  });

  it('says which missing requirements were never measured', () => {
    const report = coverageOf(
      { member: 'lead', entries: [{ id: 'turnaround-front', cut: 'puppet' }] },
      { 'turnaround-front': { ...ALL, cut: false, fit: false, unmeasured: ['cut', 'fit'] } },
    );
    expect(report.entries[0]).toEqual({
      id: 'turnaround-front',
      cut: 'puppet',
      missing: ['cut', 'fit'],
      unmeasured: ['cut', 'fit'],
      trainable: false,
    });
  });

  it('trains on a puppet entry that misses only its bars, not on one that misses its fit', () => {
    const report = coverageOf(
      {
        member: 'lead',
        entries: [
          { id: 'turnaround-front', cut: 'puppet' },
          { id: 'heads-heads-1', cut: 'puppet' },
          { id: 'heads-heads-2', cut: 'puppet' },
        ],
      },
      {
        'turnaround-front': { ...ALL, bars: false },
        'heads-heads-1': { ...ALL, fit: false },
        'heads-heads-2': ALL,
      },
    );
    expect(report.complete).toBe(false);
    expect(report.entries.map((e) => [e.id, e.trainable])).toEqual([
      ['turnaround-front', true],
      ['heads-heads-1', false],
      ['heads-heads-2', true],
    ]);
  });

  it('never trains on a key or a fitted entry, each complete', () => {
    const report = coverageOf(
      {
        member: 'lead',
        entries: [
          { id: 'raise/k4', cut: 'key' },
          { id: 'poses-poses-1', cut: 'puppet', fitted: 'turnaround-front' },
        ],
      },
      { 'raise/k4': ALL, 'poses-poses-1': ALL },
    );
    expect(report.complete).toBe(true);
    expect(report.entries.map((e) => e.trainable)).toEqual([false, false]);
  });

  it('decodes a manifest whose key names its neighbours and why it is no puppet', () => {
    const decoded = Schema.decodeSync(Coverage)({
      member: 'lead-feast',
      entries: [
        {
          id: 'raise/k4',
          cut: 'key',
          family: 'raise',
          between: ['raise/k3', 'raise/k5'],
          file: 'cutout/raise/keys/k4.png',
          for: [{ script: 'in-its-order', beats: ['bottle'] }],
          why: 'folds the forearm',
        },
      ],
    });
    expect(decoded.entries[0]?.between).toEqual(['raise/k3', 'raise/k5']);
    expect(() =>
      Schema.decodeUnknownSync(Coverage)({
        member: 'm',
        entries: [{ id: 'x', cut: 'drawn', file: 'x.png', for: [] }],
      }),
    ).toThrow();
  });
});
