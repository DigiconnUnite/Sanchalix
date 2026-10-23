// Copies packages, with everything they depend on, from node_modules into <destination>/node_modules.
// The container build uses it for the packages the server loads at run time without bundling (pdfkit): the build's
// own file tracing left some of their files behind, which only showed when the image was run.
// Usage: node scripts/copyExternalPackages.mjs <destination> <package> [<package> ...]
import { cpSync, existsSync, readFileSync } from 'node:fs';

const [destination, ...names] = process.argv.slice(2);
const seen = new Set();
const visit = (name) => {
  const file = `node_modules/${name}/package.json`;
  if (seen.has(name) || !existsSync(file)) return;
  seen.add(name);
  Object.keys(JSON.parse(readFileSync(file, 'utf8')).dependencies ?? {}).forEach(visit);
};
names.forEach(visit);
for (const name of seen) cpSync(`node_modules/${name}`, `${destination}/node_modules/${name}`, { recursive: true });
console.log(`copied ${seen.size} packages for ${names.join(', ')}`);
