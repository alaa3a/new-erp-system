const fs = require('fs');
const t = fs.readFileSync(process.argv[2] || '/tmp/lint.txt', 'utf8');
const lines = t.split(/\r?\n/);
const counts = {};
const rules = {};
let cur = null;
for (const l of lines) {
  const tr = l.trim();
  if (/^[A-Za-z]:\\.*\.(ts|tsx)$/.test(tr)) {
    cur = tr;
    counts[cur] = 0;
  } else if (/\s(error|warning)\s/.test(l)) {
    if (cur) counts[cur]++;
    const m = l.match(/([\w@/.-]+)\s*$/);
    if (m) rules[m[1]] = (rules[m[1]] || 0) + 1;
  }
}
const arr = Object.entries(counts).sort((a, b) => b[1] - a[1]);
console.log('=== PER FILE (top 50) ===');
for (const [f, c] of arr.slice(0, 50)) console.log(String(c).padStart(3), f.replace(/^.*src/, 'src'));
console.log('FILES:', arr.length, 'TOTAL:', arr.reduce((s, [, c]) => s + c, 0));
console.log('\n=== PER RULE ===');
const rArr = Object.entries(rules).sort((a, b) => b[1] - a[1]);
for (const [r, c] of rArr) console.log(String(c).padStart(4), r);
