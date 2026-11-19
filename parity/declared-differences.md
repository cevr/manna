# Declared differences

Each row is a place where the Ergo port does not match the TypeScript CLI on
purpose, and the guard that holds it.

| Where | TypeScript | Ergo | Guard |
| --- | --- | --- | --- |
| Help and usage text (`--help`, a usage error) | @effect/cli's layout | std `flag`'s layout | usage steps in `suites.ts` compare the exit status and a non-empty stderr only |
| A number in a reference past 10^18 | a JavaScript number, which loses precision past 2^53 | saturates at 10^18 (`numberCap`), so it is never a real chapter or verse | the generator draws numbers below 2^53; both answers are a search or out of range |
