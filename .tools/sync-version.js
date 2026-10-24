// Keeps the in-game version marker in lockstep with package.json, so release
// numbers can never drift inside the menu.
const fs = require('fs');
const path = require('path');

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
const file = path.join(__dirname, '..', 'www', 'index.html');
let html = fs.readFileSync(file, 'utf8');

const re = /(<p class="menu-foot">)v[0-9]+(?:\.[0-9]+){1,2}( · .+?<\/p>)/;
if (!re.test(html)) {
  console.error('sync-version: menu-foot marker not found in www/index.html');
  process.exit(1);
}
const next = html.replace(re, `$1v${pkg.version}$2`);
if (next !== html) {
  fs.writeFileSync(file, next);
  console.log(`sync-version: menu foot -> v${pkg.version}`);
} else {
  console.log(`sync-version: menu foot already v${pkg.version}`);
}
