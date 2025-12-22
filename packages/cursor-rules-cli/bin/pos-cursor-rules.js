#!/usr/bin/env node
/**
 * Lightweight CLI to install/update .cursorrules from the canonical template.
 * No external dependencies; uses package.json version as the rules version.
 */
const fs = require('fs');
const path = require('path');

const packageJson = require('../package.json');

const TEMPLATE_VERSION = packageJson.version;
const VERSION_TAG = `cursor-rules-version: ${TEMPLATE_VERSION}`;
const VERSION_COMMENT = `<!-- ${VERSION_TAG} -->`;

const ROOT = process.cwd();
const TARGET_PATH = path.join(ROOT, '.cursorrules');
const TEMPLATE_PATH = path.join(__dirname, '..', 'templates', 'cursorrules.md');

const args = process.argv.slice(2);
const command = args[0];
const flags = new Set(args.slice(1));

function readFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

function writeFile(filePath, content) {
  fs.writeFileSync(filePath, content, 'utf8');
}

function normalize(content) {
  return content.replace(/\r\n/g, '\n').trim();
}

function stripVersionComment(content) {
  return content.replace(/<!--\s*cursor-rules-version:[^>]+-->\s*/i, '').trimStart();
}

function applyPlaceholders(content) {
  const pkg = readFile(path.join(ROOT, 'package.json'));
  const projectName = pkg ? safeName(pkg) : 'project';
  return content.replace(/{{\s*PROJECT_NAME\s*}}/g, projectName);
}

function safeName(pkgJsonStr) {
  try {
    const parsed = JSON.parse(pkgJsonStr);
    if (typeof parsed.name === 'string' && parsed.name.trim().length > 0) {
      return parsed.name.trim();
    }
  } catch {
    // ignore parse errors and fall back
  }
  return 'project';
}

function renderTemplate() {
  const template = readFile(TEMPLATE_PATH);
  if (!template) {
    console.error('Template missing. Ensure templates/cursorrules.md exists.');
    process.exitCode = 1;
    return null;
  }

  const withPlaceholders = applyPlaceholders(template);
  if (withPlaceholders.includes('cursor-rules-version:')) {
    return withPlaceholders;
  }

  return `${VERSION_COMMENT}\n${withPlaceholders}`;
}

function existingVersion(content) {
  const match = content.match(/cursor-rules-version:\s*([0-9]+(?:\.[0-9]+)*)/i);
  return match ? match[1] : null;
}

function isUpToDate(current, template) {
  const normalizedCurrent = normalize(stripVersionComment(current));
  const normalizedTemplate = normalize(stripVersionComment(template));
  return normalizedCurrent === normalizedTemplate;
}

function ensureTargetDir() {
  const dir = path.dirname(TARGET_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function initCommand() {
  const force = flags.has('--force');
  const template = renderTemplate();
  if (!template) return;

  if (fs.existsSync(TARGET_PATH) && !force) {
    console.log('.cursorrules already exists. Use "update" or --force to overwrite.');
    return;
  }

  ensureTargetDir();
  writeFile(TARGET_PATH, template);
  console.log(`.cursorrules written (version ${TEMPLATE_VERSION}).`);
}

function updateCommand() {
  const force = flags.has('--force');
  const template = renderTemplate();
  if (!template) return;

  if (!fs.existsSync(TARGET_PATH)) {
    ensureTargetDir();
    writeFile(TARGET_PATH, template);
    console.log(`.cursorrules created from template (version ${TEMPLATE_VERSION}).`);
    return;
  }

  const current = readFile(TARGET_PATH);
  if (!current) {
    console.error('Existing .cursorrules could not be read.');
    process.exitCode = 1;
    return;
  }

  if (isUpToDate(current, template) && !force) {
    console.log(`.cursorrules is already up to date (version ${existingVersion(current) || 'unknown'}).`);
    return;
  }

  writeFile(TARGET_PATH, template);
  console.log(`.cursorrules updated to version ${TEMPLATE_VERSION}.`);
}

function checkCommand() {
  const template = renderTemplate();
  if (!template) return;

  if (!fs.existsSync(TARGET_PATH)) {
    console.error('.cursorrules is missing.');
    process.exitCode = 1;
    return;
  }

  const current = readFile(TARGET_PATH);
  if (!current) {
    console.error('.cursorrules exists but could not be read.');
    process.exitCode = 1;
    return;
  }

  if (isUpToDate(current, template)) {
    console.log(`.cursorrules is up to date (version ${existingVersion(current) || 'unknown'}).`);
    return;
  }

  console.error('.cursorrules is out of date. Run "pos-cursor-rules update".');
  process.exitCode = 1;
}

function helpCommand() {
  console.log(`
pos-cursor-rules <command> [--force]

Commands:
  init    Create or overwrite .cursorrules from the template
  update  Sync existing .cursorrules with the template
  check   Exit non-zero if .cursorrules is missing or outdated
`);
}

switch (command) {
  case 'init':
    initCommand();
    break;
  case 'update':
    updateCommand();
    break;
  case 'check':
    checkCommand();
    break;
  default:
    helpCommand();
}
