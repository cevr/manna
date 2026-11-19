// Runs one CLI invocation in its own process group and captures stdout,
// stderr and the exit status. The group is killed when the call ends; a child
// that never exits is stopped after `hung` milliseconds and named.
import { spawn, spawnSync } from "node:child_process";

export type Step = { args: string[]; stdin?: string; env?: Record<string, string> };
export type Result = { out: string; err: string; code: number };

export async function execute(
  program: string[],
  step: Step,
  cwd: string,
  env: Record<string, string>,
  hung = 120_000,
): Promise<Result> {
  const [command, ...prefix] = program;
  const child = spawn(command!, [...prefix, ...step.args], {
    cwd,
    detached: true,
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...env, ...step.env },
  });
  let out = "",
    err = "",
    active = true;
  const stop = () => {
    if (active && child.pid) {
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        /* exited */
      }
    }
  };
  const timer = setTimeout(stop, hung); // stops only a hung invocation
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) process.on(signal, stop);
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (data: string) => {
    out += data;
  });
  child.stderr.on("data", (data: string) => {
    err += data;
  });
  child.stdin.on("error", () => {
    /* a usage error may close stdin early */
  });
  child.stdin.end(step.stdin ?? "");
  let code: number;
  try {
    code = await new Promise<number>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (status, signal) =>
        signal
          ? reject(new Error(`hung invocation stopped: ${JSON.stringify(step.args)} ${signal}`))
          : resolve(status ?? 1),
      );
    });
  } finally {
    stop();
    active = false;
    clearTimeout(timer);
    for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) process.off(signal, stop);
  }
  const ps = spawnSync("ps", ["-eo", "pid,pgid,stat,comm"], { encoding: "utf8" });
  if (
    ps.status !== 0 ||
    ps.stdout.split("\n").some((line) => {
      const fields = line.trim().split(/\s+/);
      return fields[1] === String(child.pid) && !fields[2]?.startsWith("Z");
    })
  )
    throw new Error("owned CLI process remains");
  return { out, err, code };
}
