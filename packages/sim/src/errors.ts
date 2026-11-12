/**
 * The ways a `sim.ts` command fails, each a tagged error the command prints
 * as its JSON result (`result.ts`) before it exits non-zero.
 */
import { Schema } from 'effect';
import type { PlatformError } from 'effect/PlatformError';

/** No `boot` ran, or `down` closed the drive: there is nothing to drive. */
export class NoSession extends Schema.TaggedError<NoSession>()('NoSession', {
  file: Schema.String,
}) {
  override get message() {
    return `no drive is booted (no ${this.file}); run sim boot first`;
  }
}

/** The drive's simulator is not booted, or no longer exists. */
export class SimulatorDown extends Schema.TaggedError<SimulatorDown>()('SimulatorDown', {
  name: Schema.String,
  state: Schema.String,
}) {
  override get message() {
    return `simulator ${this.name} is ${this.state}, not Booted; run sim boot`;
  }
}

/** A wait for something to become ready ran out. */
export class ReadinessTimedOut extends Schema.TaggedError<ReadinessTimedOut>()(
  'ReadinessTimedOut',
  { what: Schema.String, seconds: Schema.Finite },
) {
  override get message() {
    return `${this.what} was not ready after ${this.seconds} s`;
  }
}

/** No element on screen answers the target. */
export class TargetMissing extends Schema.TaggedError<TargetMissing>()('TargetMissing', {
  target: Schema.String,
  platform: Schema.String,
  /** What the driver said when its wait or scroll ran out. */
  driver: Schema.String,
}) {
  override get message() {
    return `no element ${this.target} on the ${this.platform} screen (${this.driver})`;
  }
}

/** A scroll's pan left the content where it was while its scroll view still hides more of it that way. */
export class ScrollStuck extends Schema.TaggedError<ScrollStuck>()('ScrollStuck', {
  target: Schema.String,
  direction: Schema.String,
  /** The pan, as `<x>,<y> by <dx>,<dy>`. */
  pan: Schema.String,
}) {
  override get message() {
    return `scroll ${this.direction} (${this.target}) moved nothing: the pan from ${this.pan} left the content where it was, and its scroll view hides more that way`;
  }
}

/** A tool the command runs is not installed. */
export class ToolMissing extends Schema.TaggedError<ToolMissing>()('ToolMissing', {
  tool: Schema.String,
}) {
  override get message() {
    return `${this.tool} is not installed`;
  }
}

/** A tool ran and exited non-zero, or did not finish in its time. */
export class ToolFailed extends Schema.TaggedError<ToolFailed>()('ToolFailed', {
  tool: Schema.String,
  args: Schema.Array(Schema.String),
  exitCode: Schema.Finite,
  output: Schema.String,
}) {
  override get message() {
    return `${this.tool} ${this.args.join(' ')} exited ${this.exitCode}: ${this.output}`;
  }
}

/** The command does not apply to the drive's platform. */
export class NotOnPlatform extends Schema.TaggedError<NotOnPlatform>()('NotOnPlatform', {
  command: Schema.String,
  platform: Schema.String,
}) {
  override get message() {
    return `sim ${this.command} does not run on ${this.platform}`;
  }
}

/** A file the drive reads or writes failed on the host (`PlatformError`). */
export class HostFailed extends Schema.TaggedError<HostFailed>()('HostFailed', {
  reason: Schema.String,
}) {
  override get message() {
    return this.reason;
  }
}

/** The arguments did not parse: an unknown command or flag, a bad or missing value. */
export class BadArguments extends Schema.TaggedError<BadArguments>()('BadArguments', {
  /** The command path the parser reached, as `sim tap`. */
  command: Schema.String,
  /** Each problem the parser found, in its words. */
  problems: Schema.Array(Schema.String),
}) {
  override get message() {
    return `${this.command}: ${this.problems.join('; ')} (run ${this.command} --help)`;
  }
}

/** A read-only check of the booted drive failed (`sim doctor`): which, and why. */
export class Unhealthy extends Schema.TaggedError<Unhealthy>()('Unhealthy', {
  check: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `${this.check}: ${this.reason}`;
  }
}

/**
 * `boot` started nothing, or stopped what it started: the state folder holds
 * a live, legacy or unreadable session, or the drivers' socket path would
 * not fit.
 */
export class BootRefused extends Schema.TaggedError<BootRefused>()('BootRefused', {
  state: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `sim boot refused in ${this.state}: ${this.reason}`;
  }
}

/** Another running command holds the state (its pid), so this one changed nothing. */
export class StateBusy extends Schema.TaggedError<StateBusy>()('StateBusy', {
  state: Schema.String,
  pid: Schema.Finite,
}) {
  override get message() {
    return `another sim command (pid ${this.pid}) holds ${this.state}; wait for it to end`;
  }
}

/** The helper ran in a warm checkout, the clean source worktrees are made from. */
export class WarmCheckout extends Schema.TaggedError<WarmCheckout>()('WarmCheckout', {
  checkout: Schema.String,
}) {
  override get message() {
    return `${this.checkout} is a warm checkout, which no drive may build or write in; use a worktree`;
  }
}

/** A journey file that cannot run: missing, not a journey, or for another feature. */
export class BadJourney extends Schema.TaggedError<BadJourney>()('BadJourney', {
  file: Schema.String,
  issue: Schema.String,
}) {
  override get message() {
    return `${this.file}: ${this.issue}`;
  }
}

/** A target a journey expected gone still shows. */
export class TargetShown extends Schema.TaggedError<TargetShown>()('TargetShown', {
  target: Schema.String,
}) {
  override get message() {
    return `${this.target} still shows`;
  }
}

/**
 * A path the drive handed the host leaves the roots it lies under (`host.ts`):
 * through a link, it resolves outside a root that lexically holds it, or it
 * lies under no root of the drive at all.
 */
export class Escaped extends Schema.TaggedError<Escaped>()('Escaped', {
  /** The host call: a FileSystem operation, `spawn`, or `prebuild`. */
  operation: Schema.String,
  path: Schema.String,
  /** Where the path leads once every link on it is followed. */
  resolved: Schema.String,
  /** The roots the path leaves; none when no root of the drive holds it at all. */
  outside: Schema.Array(Schema.String),
}) {
  override get message() {
    if (this.outside.length === 0)
      return `${this.operation}: ${this.path} lies under no root of the drive`;
    return `${this.operation}: ${this.path} resolves to ${this.resolved}, outside ${this.outside.join(', ')}`;
  }
}

const isEscaped = Schema.is(Escaped);

/** The failure a host error is: the refusal it carries (`Escaped`), else `HostFailed`. */
export const hostError = (error: PlatformError): Escaped | HostFailed => {
  if (error.reason._tag === 'BadArgument' && isEscaped(error.reason.cause))
    return error.reason.cause;
  return HostFailed.make({ reason: error.message });
};

/** Any failure a command reports. */
export const SimError = Schema.Union([
  WarmCheckout,
  BadJourney,
  TargetShown,
  NoSession,
  SimulatorDown,
  ReadinessTimedOut,
  TargetMissing,
  ScrollStuck,
  ToolMissing,
  ToolFailed,
  NotOnPlatform,
  HostFailed,
  Escaped,
  BadArguments,
  Unhealthy,
  BootRefused,
  StateBusy,
]);
export type SimError = typeof SimError.Type;
