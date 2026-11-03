import { Syllables } from '../src/index.js';

const cutLine = (line: string) =>
  line
    .split(/(\s+)/)
    .map((token) => Syllables.split(token, Syllables.counts(token)[0] ?? 1).join('-'))
    .join('');

const given = process.argv.slice(2);
const lines = given.length > 0 ? given : (await Bun.stdin.text()).split('\n');
console.log(lines.map(cutLine).join('\n'));
