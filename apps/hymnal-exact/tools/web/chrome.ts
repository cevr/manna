/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals, effect/noAsyncFunction, effect/noNewError, effect/noNewPromise, effect/noNullish, effect/noTernary, effect/noThrowStatement, effect/noAs, effect/noTryCatch, effect/noUnsafeDictionaryType, eslint/no-await-in-loop, node/no-process-env -- a host script that starts Chrome in a process group of its own and speaks the DevTools protocol to it over its socket, whose messages' parameters are each method's own JSON; no Exact driver is attached, and it never runs in the data module. */

/**
 * Chrome for the web drive, with no Exact driver attached: started
 * headless on a profile folder, in a process group of its own, and driven
 * through the DevTools protocol on one page target. `close` asks Chrome to
 * close (`Browser.close`), so it writes what it holds to the profile as a
 * person's closing it does, and stops the group only if it has not ended
 * in 10 s. A call Chrome does not answer in `CALL_MS`, or one pending
 * when its socket closes, rejects with its method named, so a dead or
 * stuck Chrome fails the drive instead of hanging it. The browser is `CHROME`, else the newest Chrome for Testing
 * Playwright keeps (`~/Library/Caches/ms-playwright` on macOS,
 * `~/.cache/ms-playwright` elsewhere), the one Exact's agent starts.
 */

import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';

type Child = ReturnType<typeof Bun.spawn>;
type Listener = (params: Record<string, unknown>) => void;

/** How long a DevTools call waits for Chrome's answer before it rejects, naming its method. */
export const CALL_MS = 30_000;

/** The browser this machine runs the drive in. */
export const chromePath = (): string => {
  if (process.env.CHROME) return process.env.CHROME;
  const mac = platform() === 'darwin';
  const cache = join(homedir(), mac ? 'Library/Caches/ms-playwright' : '.cache/ms-playwright');
  const builds = existsSync(cache)
    ? readdirSync(cache)
        .filter((name) => /^chromium-\d+$/u.test(name))
        .toSorted((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]))
    : [];
  const inside = mac
    ? 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
    : 'chrome-linux64/chrome';
  const found = builds.map((build) => join(cache, build, inside)).find((path) => existsSync(path));
  if (found === undefined)
    throw new Error(`no Chrome for Testing under ${cache}: set CHROME to a Chrome binary`);
  return found;
};

export interface Page {
  readonly send: (
    method: string,
    params?: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
  readonly on: (event: string, listener: Listener) => () => void;
  /** The value of `expression` in the page, awaited. */
  readonly evaluate: <T>(expression: string) => Promise<T>;
}

export interface Chrome {
  readonly page: Page;
  readonly close: () => Promise<'closed' | 'stopped'>;
  /** Chrome's process group stopped at once, for a drive that is itself being stopped. */
  readonly stopNow: () => void;
}

/** Chrome on `profile` (made fresh when `fresh`), with one page open on `about:blank`. */
export const launchChrome = async (profile: string, fresh: boolean): Promise<Chrome> => {
  if (fresh) rmSync(profile, { recursive: true, force: true });
  const portFile = join(profile, 'DevToolsActivePort');
  rmSync(portFile, { force: true });
  const child: Child = Bun.spawn(
    [
      chromePath(),
      '--headless=new',
      `--user-data-dir=${profile}`,
      '--remote-debugging-port=0',
      '--mute-audio',
      '--use-mock-keychain',
      '--password-store=basic',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-networking',
      '--disable-component-update',
      '--disable-sync',
      '--disable-default-apps',
      '--window-size=430,932',
      'about:blank',
    ],
    { stdout: 'ignore', stderr: 'ignore', detached: true },
  );
  let socketUrl = '';
  for (let tries = 0; tries < 200 && socketUrl === ''; tries++) {
    await Bun.sleep(50);
    if (existsSync(portFile)) {
      const [port, path] = readFileSync(portFile, 'utf8').split('\n');
      if (port && path) socketUrl = `ws://127.0.0.1:${port}${path}`;
    }
  }
  if (socketUrl === '') {
    process.kill(-child.pid, 'SIGTERM');
    throw new Error('Chrome did not open its DevTools port');
  }
  const socket = new WebSocket(socketUrl);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.close();
      process.kill(-child.pid, 'SIGTERM');
      reject(new Error(`Chrome's DevTools socket did not open in ${CALL_MS / 1000} s`));
    }, CALL_MS);
    socket.addEventListener('open', () => resolve(clearTimeout(timer)), { once: true });
    socket.addEventListener(
      'error',
      () => {
        clearTimeout(timer);
        reject(new Error("Chrome's DevTools socket failed to open"));
      },
      { once: true },
    );
  });
  let id = 0;
  const waiting = new Map<
    number,
    { resolve: (v: Record<string, unknown>) => void; reject: (e: Error) => void }
  >();
  const listeners = new Map<string, Set<Listener>>();
  socket.addEventListener('close', () => {
    for (const call of waiting.values()) call.reject(new Error("Chrome's DevTools socket closed"));
    waiting.clear();
  });
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data)) as {
      id?: number;
      method?: string;
      params?: Record<string, unknown>;
      result?: Record<string, unknown>;
      error?: { message: string };
      sessionId?: string;
    };
    if (message.id !== undefined) {
      const call = waiting.get(message.id);
      waiting.delete(message.id);
      if (message.error) call?.reject(new Error(message.error.message));
      else call?.resolve(message.result ?? {});
      return;
    }
    const key = `${message.sessionId ?? ''}:${message.method ?? ''}`;
    for (const listener of listeners.get(key) ?? []) listener(message.params ?? {});
  });
  const call = (
    sessionId: string | undefined,
    method: string,
    params: Record<string, unknown> = {},
  ) =>
    new Promise<Record<string, unknown>>((resolve, reject) => {
      id += 1;
      const sent = id;
      const timer = setTimeout(() => {
        waiting.delete(sent);
        reject(new Error(`${method} got no answer from Chrome in ${CALL_MS / 1000} s`));
      }, CALL_MS);
      waiting.set(sent, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      if (socket.readyState !== WebSocket.OPEN) {
        waiting.get(sent)?.reject(new Error(`${method}: Chrome's DevTools socket is closed`));
        waiting.delete(sent);
        return;
      }
      socket.send(JSON.stringify({ id: sent, method, params, sessionId }));
    });
  const { targetInfos } = (await call(undefined, 'Target.getTargets')) as {
    targetInfos: Array<{ targetId: string; type: string }>;
  };
  const target = targetInfos.find((info) => info.type === 'page');
  const targetId =
    target?.targetId ??
    ((await call(undefined, 'Target.createTarget', { url: 'about:blank' })).targetId as string);
  const { sessionId } = (await call(undefined, 'Target.attachToTarget', {
    targetId,
    flatten: true,
  })) as {
    sessionId: string;
  };
  const page: Page = {
    send: (method, params) => call(sessionId, method, params),
    on: (event, listener) => {
      const key = `${sessionId}:${event}`;
      const set = listeners.get(key) ?? new Set();
      set.add(listener);
      listeners.set(key, set);
      return () => set.delete(listener);
    },
    evaluate: async <T>(expression: string) => {
      const { result, exceptionDetails } = (await call(sessionId, 'Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
      })) as { result: { value: T }; exceptionDetails?: { text: string } };
      if (exceptionDetails) throw new Error(`${expression}: ${exceptionDetails.text}`);
      return result.value;
    },
  };
  await Promise.all(
    ['Page.enable', 'Runtime.enable', 'Network.enable'].map((method) => page.send(method)),
  );
  const close = async (): Promise<'closed' | 'stopped'> => {
    await call(undefined, 'Browser.close').catch(() => ({}));
    const ended = await Promise.race([
      child.exited.then(() => true),
      Bun.sleep(10_000).then(() => false),
    ]);
    socket.close();
    if (ended) return 'closed';
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      return 'closed';
    }
    return 'stopped';
  };
  const stopNow = () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      return;
    }
  };
  return { page, close, stopNow };
};
