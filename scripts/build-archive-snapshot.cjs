'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const snapshotPath = path.join(root, 'data/archive-snapshot.json');
const cmsUrl = 'https://script.google.com/macros/s/AKfycbwiZsgp3l-qoRFRDM0iwQwcONKoIyenzNhCHdbx0fBI41F6q1_NBum17fccVgPa5Lpx/exec';
const jsonForHtml = value => JSON.stringify(value).replaceAll('<', '\\u003c');
async function readCms(query) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(cmsUrl + '?' + query, {signal: AbortSignal.timeout(60000)});
      if (!response.ok) throw new Error('CMS HTTP ' + response.status);
      const data = await response.json();
      if (!data.ok) throw new Error('CMS did not return public data');
      return data;
    } catch (error) { if (attempt === 1) throw error; }
  }
}
function validate(snapshot) {
  if (!snapshot?.list?.ok || snapshot.list.homeSchemaVersion !== 1 || !Array.isArray(snapshot.list.posts) || !snapshot.list.posts.length) throw new Error('Invalid archive snapshot');
  for (const post of snapshot.list.posts) {
    if (String(post.status).toLowerCase() !== 'published' || !post.slug) throw new Error('Snapshot contains a non-public post');
    if (!snapshot.details?.[post.slug]?.ok || snapshot.details[post.slug].post?.slug !== post.slug) throw new Error('Missing public body: ' + post.slug);
  }
  return snapshot;
}
async function refreshSnapshot(previous) {
  const list = await readCms('mode=home');
  const details = {}; const queue = [...list.posts];
  await Promise.all(Array.from({length: 3}, async () => {
    while (queue.length) {
      const post = queue.shift();
      const detail = await readCms('mode=detail&slug=' + encodeURIComponent(post.slug));
      if (detail.post?.slug !== post.slug) throw new Error('Wrong CMS detail: ' + post.slug);
      details[post.slug] = detail;
    }
  }));
  // Replace only a fully verified snapshot; never publish a partial refresh.
  return validate({list, details});
}
function embedSnapshot(snapshot) {
  for (const name of ['index.html','archive.html']) {
    const file = path.join(root, name); let html = fs.readFileSync(file, 'utf8');
    const bootstrap = '<script>window.BIO_ARCHIVE_BOOTSTRAP=' + jsonForHtml(snapshot.list)
      + (name === 'archive.html' ? ';window.BIO_ARCHIVE_DETAILS=' + jsonForHtml(snapshot.details) : '') + ';</script>';
    const marker = /<script>window\.BIO_ARCHIVE_BOOTSTRAP=[\s\S]*?<\/script>/;
    if (!marker.test(html)) throw new Error('Missing bootstrap marker in ' + name);
    html = html.replace(marker, () => bootstrap);
    const source = name === 'index.html' ? 'home-archive.js' : 'archive-cms.js';
    const needle = /<script>\s*\(\(\) => \{\s*'use strict';\s*const (TYPES|API_VERSION)[\s\S]*?<\/script>/;
    if (!needle.test(html)) throw new Error('Missing application marker in ' + name);
    html = html.replace(needle, () => '<script>\n' + fs.readFileSync(path.join(root,source),'utf8') + '\n</script>');
    fs.writeFileSync(file, html);
  }
  console.log('Prepared ' + snapshot.list.posts.length + ' public summaries and ' + Object.keys(snapshot.details).length + ' complete bodies.');
}
async function main() {
  let snapshot = validate(JSON.parse(fs.readFileSync(snapshotPath,'utf8')));
  if (process.argv.includes('--refresh')) {
    try {
      snapshot = await refreshSnapshot(snapshot);
      fs.writeFileSync(snapshotPath, JSON.stringify(snapshot));
    } catch (error) {
      console.warn('CMS refresh unavailable; retaining complete last verified public snapshot:', error.message);
    }
  }
  embedSnapshot(snapshot);
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = {validate, jsonForHtml};
