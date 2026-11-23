import * as ffi from 'bun:ffi';
import * as sqlite from 'bun:sqlite';
import { afterAll, mock } from 'bun:test';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const log = process.env['MANNA_TEST_READS'] ?? '';
/** The recorder's own calls, taken before `mock.module` swaps the traced ones into `node:fs`. */
const { appendFileSync: append, existsSync: exists } = fs;

/** The path `target` names, from the root: a string, a file URL or a buffer; `''` when it names none. */
const pathOf = (target: unknown) => {
  const named =
    typeof target === 'string'
      ? target
      : target instanceof URL && target.protocol === 'file:'
        ? fileURLToPath(target)
        : Buffer.isBuffer(target)
          ? target.toString()
          : '';
  return named === '' || named === ':memory:' ? '' : resolve(named);
};

/** Records `target` when it names a path. */
const record = (target: unknown) => {
  const path = pathOf(target);
  if (path !== '') append(log, `${path}\n`);
};

/** Records `target`, marked `+` (`CREATED` of `unhashed.ts`), when it names a path that does not exist yet: the write about to run creates it. */
const creates = (target: unknown) => {
  const path = pathOf(target);
  if (path !== '' && !exists(path)) append(log, `+${path}\n`);
};

/** Each named call, through a proxy that keeps its function properties, hands its arguments to `seen` first. */
const watched = (
  module: object,
  names: ReadonlyArray<string>,
  seen: (args: ReadonlyArray<unknown>) => void,
) => {
  const copy: Record<string, unknown> = { ...module };
  const wrappers = new WeakMap<
    (...args: Array<unknown>) => unknown,
    (...args: Array<unknown>) => unknown
  >();
  const wrap = (original: (...args: Array<unknown>) => unknown) => {
    const cached = wrappers.get(original);
    if (cached) return cached;
    const proxy = new Proxy(original, {
      apply(target, thisArg, args) {
        seen(args);
        return Reflect.apply(target, thisArg, args);
      },
      get(target, property, receiver) {
        const value = Reflect.get(target, property, receiver);
        return property === 'native' && typeof value === 'function'
          ? wrap(value as (...args: Array<unknown>) => unknown)
          : value;
      },
    });
    wrappers.set(original, proxy);
    return proxy;
  };
  for (const name of names) {
    const original = copy[name];
    if (typeof original !== 'function') continue;
    copy[name] = wrap(original as (...args: Array<unknown>) => unknown);
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
/** The writes whose first argument is the path written. */
const WRITES = ['writeFile', 'appendFile'];
const SYNC_WRITES = ['writeFileSync', 'appendFileSync', 'createWriteStream'];
/** The writes whose second argument is the path written. */
const MOVES = ['rename', 'copyFile'];
const SYNC_MOVES = ['renameSync', 'copyFileSync'];

/** Each named read records its first argument. */
const traced = (module: object, names: ReadonlyArray<string>) =>
  watched(module, names, (args) => record(args[0]));

/** Each named write records the path it creates, as a write's first argument or a move's second. */
const writes = (module: object, first: ReadonlyArray<string>, second: ReadonlyArray<string>) =>
  watched(
    watched(module, first, (args) => creates(args[0])),
    second,
    (args) => creates(args[1]),
  );

if (log !== '') {
  const promises = writes(traced(fsp, READS), WRITES, MOVES);
  const sync = {
    ...writes(
      traced(fs, [...SYNC_READS, ...READS]),
      [...SYNC_WRITES, ...WRITES],
      [...SYNC_MOVES, ...MOVES],
    ),
    promises,
  };
  mock.module('node:fs', () => ({ ...sync, default: sync }));
  mock.module('fs', () => ({ ...sync, default: sync }));
  mock.module('node:fs/promises', () => ({ ...promises, default: promises }));
  mock.module('fs/promises', () => ({ ...promises, default: promises }));

  const file = Bun.file;
  const write = Bun.write;
  Object.assign(Bun, {
    file: (target: Parameters<typeof Bun.file>[0], options?: Parameters<typeof Bun.file>[1]) => {
      record(target);
      return file(target, options);
    },
    write: (...args: Parameters<typeof Bun.write>) => {
      const [target] = args;
      creates(target instanceof Blob && 'name' in target ? target.name : target);
      return write(...args);
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
