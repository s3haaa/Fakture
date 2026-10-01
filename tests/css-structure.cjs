const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const legacyNames = [
  'v9-polish.css', 'v10-ui.css', 'v11-redesign.css', 'v12-features.css',
  'update-fixes.css', 'dribbble-inspired.css', 'invoice-readability.css',
  'proforma-preview.css', 'workspace-text.css'
];

function filesBelow(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? filesBelow(target) : [target];
  });
}

const htmlFiles = filesBelow(root).filter(file => file.endsWith('.html'));
for (const htmlFile of htmlFiles) {
  const html = fs.readFileSync(htmlFile, 'utf8');
  for (const match of html.matchAll(/<link\b[^>]*\bhref=["']([^"']+\.css(?:\?[^"']*)?)["'][^>]*>/gi)) {
    const href = match[1];
    if (/^(?:https?:)?\/\//i.test(href)) continue;
    const localPath = path.resolve(path.dirname(htmlFile), href.split('?')[0]);
    assert.ok(fs.existsSync(localPath), `${path.relative(root, htmlFile)} references missing stylesheet ${href}`);
  }
}

const appHtml = fs.readFileSync(path.join(root, 'app/index.html'), 'utf8');
const appStyles = [...appHtml.matchAll(/<link\b[^>]*\bhref=["']css\/([^"'?]+\.css)/gi)].map(match => match[1]);
assert.deepEqual(appStyles, [
  'application.css',
  'studio-template.css',
  'editorial-template.css',
  'compact-template.css',
  'soft-template.css',
  'frame-accent-templates.css',
  'workspace-modules.css',
  'document-previews.css'
]);

const projectText = filesBelow(root)
  .filter(file => /\.(?:html|css|js|cjs|md)$/i.test(file) && file !== __filename)
  .map(file => fs.readFileSync(file, 'utf8'))
  .join('\n');
for (const legacyName of legacyNames) {
  assert.equal(projectText.includes(legacyName), false, `Legacy stylesheet name is still referenced: ${legacyName}`);
}

console.log(`CSS structure OK: ${htmlFiles.length} HTML files, ${appStyles.length} application stylesheets.`);
