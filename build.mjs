import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const destination = 'E:/Aclaw文件/交互作品_离线HTML/北行_Northbound_峡湾航记.html';
const template = fs.readFileSync(path.join(here, 'index.template.html'), 'utf8');
const scene = fs.readFileSync(path.join(here, 'scene.js'), 'utf8');
let three = fs.readFileSync('E:/Aclaw文件/build/three.min.js', 'utf8');
three = three.replace(/^console\.warn\([^\r\n]*\),\r?\n/, 'void 0,\n');
new vm.Script(three, { filename: 'three.min.js' });
new vm.Script(scene, { filename: 'scene.js' });
const escapeScriptEnd = s => s.replace(/<\/script/gi, '<\\/script');
const html = template.replace('/*__THREE_BUNDLE__*/', () => escapeScriptEnd(three)).replace('/*__SCENE_SCRIPT__*/', () => escapeScriptEnd(scene));
if (html.includes('/*__SCENE_SCRIPT__*/') || html.includes('/*__THREE_BUNDLE__*/')) {
  const at=html.indexOf('/*__THREE_BUNDLE__*/');
  throw new Error(`bundle marker survived: scene=${html.includes('/*__SCENE_SCRIPT__*/')} three=${html.includes('/*__THREE_BUNDLE__*/')} at=${at} context=${html.slice(at-30,at+40)}`);
}
if (/<(?:script|link|img|audio|video)[^>]+(?:src|href)\s*=\s*["']?https?:/i.test(html)) throw new Error('external resource found');
if (/\b(?:import\s*\(|fetch\s*\(|XMLHttpRequest\s*\()/i.test(scene)) throw new Error('unexpected runtime network call');
fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.writeFileSync(destination, html, 'utf8');
console.log(JSON.stringify({ path: destination, bytes: fs.statSync(destination).size, sha256: crypto.createHash('sha256').update(html).digest('hex'), sourceBytes: scene.length }));
