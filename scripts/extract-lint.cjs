const fs = require('fs');
const t = fs.readFileSync(process.argv[2] || './lint-output.txt', 'utf8');
const lines = t.split(/\r?\n/);
let cur = null;
const wantRule = process.argv[3]; // e.g. 'no-unused-vars' or 'no-unescaped-entities' or 'all'
for (const l of lines) {
  const tr = l.trim();
  if (/^[A-Za-z]:\\.*\.(ts|tsx)$/.test(tr)) {
    cur = tr.replace(/^.*src/, 'src');
  } else {
    const m = l.match(/^\s*(\d+:\d+)\s+(error|warning)\s+(.*?)\s{2,}([\w@/.-]+)\s*$/);
    if (m && cur) {
      const [, pos, sev, msg, rule] = m;
      if (wantRule === 'all' || rule === wantRule || rule.includes(wantRule)) {
        console.log(`${cur}:${pos} [${sev}] ${rule}: ${msg.trim()}`);
      }
    }
  }
}
