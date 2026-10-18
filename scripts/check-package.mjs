import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// Install the actual tarball in a clean consumer with no optional MCP peers.
const temp = mkdtempSync(join(tmpdir(), 'agentback-package-'));
try {
  const output = execFileSync(
    'npm',
    ['pack', '--json', '--pack-destination', temp],
    { encoding: 'utf8' },
  );
  const packed = JSON.parse(output);
  // npm 12 keys results by package name; earlier npm versions use an array.
  const [pack] = Array.isArray(packed) ? packed : Object.values(packed);
  const files = pack.files.map(({ path }) => path);
  for (const entry of ['index', 'mcp', 'cli']) {
    assert(files.includes(`dist/${entry}.js`));
    assert(files.includes(`dist/${entry}.d.ts`));
  }
  assert(files.includes('LICENSE'));
  assert(files.includes('README.md'));
  assert(
    files.every((path) =>
      /^(dist\/|package.json$|README.md$|LICENSE$)/.test(path),
    ),
  );
  writeFileSync(join(temp, 'package.json'), '{"private":true,"type":"module"}');
  execFileSync(
    'npm',
    [
      'install',
      '--ignore-scripts',
      '--omit=peer',
      '--no-audit',
      '--no-fund',
      resolve(temp, pack.filename),
    ],
    { cwd: temp, stdio: 'pipe' },
  );
  execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
      import assert from 'node:assert/strict';
      import { Agentback, signAccount } from 'agentback';
      import { feedbackHint } from 'agentback/cli';
      assert.equal(typeof signAccount, 'function');
      assert.match(feedbackHint('demo'), /demo feedback/);
      const client = new Agentback({
        projectKey: 'af_' + 'a'.repeat(64),
        fetch: async () => Response.json({ id: 'package-check', status: 'new' }, { status: 201 }),
      });
      assert.deepEqual(await client.send({ message: 'package check' }), { id: 'package-check', status: 'new' });
    `,
    ],
    { cwd: temp, stdio: 'inherit' },
  );
  console.log(
    `Verified ${pack.name}@${pack.version}: ${files.length} package files; clean consumer imports passed.`,
  );
} finally {
  rmSync(temp, { recursive: true, force: true });
}
