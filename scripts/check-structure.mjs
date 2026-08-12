// ponytail: regex-based import check, upgrade to dependency-cruiser if rules outgrow text matching
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = process.cwd();
const MAX_ROUTE_LINES = 150;
const ALLOWED_RN = new Set([
  'Platform', 'Dimensions', 'FlatList', 'KeyboardAvoidingView',
  'StyleProp', 'ViewStyle', 'NativeScrollEvent',
]);

// Reviewer-verified raw-RN escape hatches (see src/tw/AGENTS.md anti-patterns).
const EXCEPTIONS = new Set([
  // AuthScreen — UIManager + useWindowDimensions for platform layout animations
  'src/components/auth/AuthScreen.tsx',
  // Bottom sheet — RN Animated/StyleSheet/useWindowDimensions are the sheet mechanics
  'src/components/ui/bottomsheet/index.tsx',
  'src/components/ui/bottomsheet/backdrop.tsx',
  // automate/new — Keyboard, LayoutAnimation, UIManager for form layout animations
  'src/screens/automate/new/index.tsx',
]);

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (name.endsWith('.tsx')) out.push(p);
  }
  return out;
}

const rel = (p) => relative(ROOT, p).split(sep).join('/');
const nonEmptyLines = (text) => text.split('\n').filter((l) => l.trim().length > 0).length;

function checkRnImports(filePath, text) {
  const relPath = rel(filePath);
  // (a) Match whole import statements spanning continuation lines.
  // (b) `import type` prefix → skip entirely.
  const re = /import\s*(type\s+)?\{([^}]*)\}\s*from\s*['"]react-native['"]/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m[1]) continue; // rule (b)
    // (c) Drop inline type-only bindings; (d) check remaining against allowed set.
    const checked = m[2]
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith('type '))
      .map((s) => s.split(/\s+as\s+/)[0].trim());
    const bad = checked.filter((b) => !ALLOWED_RN.has(b));
    // (e) File must be in exception list if any binding is outside the allowed set.
    if (bad.length > 0 && !EXCEPTIONS.has(relPath)) {
      const line = text.slice(0, m.index).split('\n').length;
      console.error(
        `${relPath}:${line}: raw react-native {${bad.join(', ')}} — use @/tw primitives (src/tw/AGENTS.md)`,
      );
      return false;
    }
  }
  return true;
}

let ok = true;

// R1: route thinness — every src/app/**/*.tsx must be ≤150 non-empty lines.
for (const f of walk(join(ROOT, 'src', 'app'))) {
  const lines = nonEmptyLines(readFileSync(f, 'utf8'));
  if (lines > MAX_ROUTE_LINES) {
    console.error(`${rel(f)}: ${lines} non-empty lines (max ${MAX_ROUTE_LINES}) — split the route`);
    ok = false;
  }
}

// R2: raw-RN import guard — src/screens/** + src/components/** (excluding *.test.*).
for (const dir of [join(ROOT, 'src', 'screens'), join(ROOT, 'src', 'components')]) {
  for (const f of walk(dir)) {
    if (f.includes('.test.')) continue;
    if (!checkRnImports(f, readFileSync(f, 'utf8'))) ok = false;
  }
}

if (!ok) process.exit(1);
console.log('check:structure — OK');
