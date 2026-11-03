import * as ffi from 'bun:ffi';
import * as sqlite from 'bun:sqlite';
import { afterAll, mock } from 'bun:test';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const log = process.env['MANNA_TEST_READS'] ?? '';

const record = (target: unknown) => {
  const named =
    typeof target === 'string'
      ? target
      : target instanceof URL && target.protocol === 'file:'
        ? fileURLToPath(target)
        : Buffer.isBuffer(target)
          ? target.toString()
          : '';
  if (named === '' || named === ':memory:') return;
  fs.appendFileSync(log, `${resolve(named)}\n`);
};

const traced = (module: object, names: ReadonlyArray<string>) => {
  const copy: Record<string, unknown> = { ...module };
  for (const name of names) {
    const original = copy[name];
    if (typeof original !== 'function') continue;
    const read = original as (...args: Array<unknown>) => unknown;
    copy[name] = (...args: Array<unknown>) => {
      record(args[0]);
      return read(...args);
    };
  }
  return copy;
};

const READS = ['readFile', 'stat', 'lstat', 'open', 'access', 'realpath'];
const SYNC_READS = [
  'readFileSync',
  'existsSync',
  'statSync',
  'lstatSync',
  'openSync',
  'accessSync',
  'realpathSync',
  'createReadStream',
];

if (log !== '') {
  const promises = traced(fsp, READS);
  const sync = { ...traced(fs, [...SYNC_READS, ...READS]), promises };
  mock.module('node:fs', () => ({ ...sync, default: sync }));
  mock.module('fs', () => ({ ...sync, default: sync }));
  mock.module('node:fs/promises', () => ({ ...promises, default: promises }));
  mock.module('fs/promises', () => ({ ...promises, default: promises }));

  const file = Bun.file;
  Object.assign(Bun, {
    file: (target: Parameters<typeof Bun.file>[0], options?: Parameters<typeof Bun.file>[1]) => {
      record(target);
      return file(target, options);
    },
  });

  class Database extends sqlite.Database {
    constructor(...args: ConstructorParameters<typeof sqlite.Database>) {
      record(args[0]);
      super(...args);
    }
  }
  mock.module('bun:sqlite', () => ({ ...sqlite, Database, default: Database }));

  const native = traced(ffi, ['dlopen']);
  mock.module('bun:ffi', () => ({ ...native, default: native }));
  const dlopen = process.dlopen.bind(process);
  Object.assign(process, {
    dlopen: (...args: Parameters<typeof process.dlopen>) => {
      record(args[1]);
      return dlopen(...args);
    },
  });

  const modules = () => {
    for (const loaded of Object.keys(require.cache)) {
      if (isAbsolute(loaded) && loaded !== import.meta.path) record(loaded);
    }
  };
  try {
    afterAll(modules);
  } catch {
    process.on('exit', modules);
  }
}
