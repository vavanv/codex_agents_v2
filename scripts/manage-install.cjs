'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const source = path.resolve(__dirname, '..');
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
function manage(action, target, preview = false) {
  const root = fs.realpathSync(target);
  if (root === source || root.startsWith(source + path.sep)) throw new Error('Choose a target outside the source repository');
  const base = path.join(root, '.codex', 'dev-gate');
  const manifest = path.join(base, 'installation.json');
  // Refuse links in target parents so installation stays inside the named root.
  for (const p of [path.join(root, '.codex'), base]) {
    if (fs.existsSync(p) && fs.lstatSync(p).isSymbolicLink()) throw new Error('Linked installation directories are unsupported');
  }
  if (action === 'install') {
    if (fs.existsSync(base)) throw new Error('Installation directory already exists');
    const files = [];
    function walk(rel) {
      for (const item of fs.readdirSync(path.join(source, rel), { withFileTypes: true })) {
        const file = path.join(rel, item.name);
        if (item.isDirectory()) walk(file);
        else if (item.isFile()) files.push(file);
        else throw new Error('Unsupported source entry');
      }
    }
    walk('gate'); walk('templates');
    files.push('scripts/read-codex-runtime.cjs', 'LICENSE');
    const payloads = files.map(file => ({ file, bytes: fs.readFileSync(path.join(source, file)) }));
    if (!preview) {
      fs.mkdirSync(base, { recursive: true });
      // Write manifest last. An interrupted install is never treated as verified.
      for (const { file, bytes } of payloads) {
        const dst = path.join(base, file);
        fs.mkdirSync(path.dirname(dst), { recursive: true });
        fs.writeFileSync(dst, bytes, { flag: 'wx' });
      }
      fs.writeFileSync(manifest, JSON.stringify({ version: 1, root, files: payloads.map(({ file, bytes }) => ({ file, hash: hash(bytes) })) }, null, 2), { flag: 'wx' });
    }
    return payloads.map(p => p.file);
  }
  if (action !== 'uninstall') throw new Error('Expected install or uninstall');
  const record = JSON.parse(fs.readFileSync(manifest, 'utf8'));
  if (record.version !== 1 || record.root !== root || !Array.isArray(record.files)) throw new Error('Invalid manifest');
  const files = record.files.map(entry => {
    const dst = path.resolve(base, entry.file);
    if (!dst.startsWith(base + path.sep) || dst === manifest) throw new Error('Invalid managed path');
    let cursor = dst;
    while (cursor !== base) {
      if (fs.lstatSync(cursor).isSymbolicLink()) throw new Error('Linked managed path');
      cursor = path.dirname(cursor);
    }
    if (hash(fs.readFileSync(dst)) !== entry.hash) throw new Error(`Managed file changed: ${entry.file}`);
    return dst;
  });
  if (!preview) {
    for (const file of files) fs.unlinkSync(file);
    fs.unlinkSync(manifest);
    function removeEmpty(dir) {
      for (const item of fs.readdirSync(dir, { withFileTypes: true })) if (item.isDirectory() && !item.isSymbolicLink()) removeEmpty(path.join(dir, item.name));
      if (!fs.readdirSync(dir).length) fs.rmdirSync(dir);
    }
    removeEmpty(base);
  }
  return record.files.map(f => f.file);
}
if (require.main === module) {
  try {
    const [action, target, flag] = process.argv.slice(2);
    if (!target || (flag && flag !== '--what-if')) throw new Error('Usage: node scripts/manage-install.cjs install|uninstall PROJECT [--what-if]');
    console.log(JSON.stringify(manage(action, target, flag === '--what-if'), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { manage };
