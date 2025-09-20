import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const outDir = mkdtempSync(join(tmpdir(), 'collect-resource-test-'));
const outFile = join(outDir, 'collect-resource-test.mjs');

try {
  await build({
    entryPoints: ['src/logic/systems/commands/tests/collect-resource-restart.test.ts'],
    outfile: outFile,
    bundle: true,
    format: 'esm',
    platform: 'node',
    sourcemap: 'inline',
    alias: {
      '@logic': 'src/logic',
      '@core': 'src/logic/core',
      '@game': 'src/logic/core/game',
      '@interfaces': 'src/logic/interfaces',
      '@modules': 'src/logic/modules',
      '@buildings': 'src/logic/modules/buildings',
      '@upgrades': 'src/logic/modules/upgrades',
      '@drones': 'src/logic/modules/drones',
      '@resources': 'src/logic/modules/resources',
      '@systems': 'src/logic/systems',
      '@scene': 'src/logic/systems/scene',
      '@map': 'src/logic/systems/map',
      '@commands': 'src/logic/systems/commands',
      '@modifiers': 'src/logic/systems/modifiers-system',
      '@save-load': 'src/logic/systems/save-load',
      '@utils': 'src/logic/utils',
      '@shared': 'src/logic/shared',
      '@ui': 'src/ui'
    }
  });

  const module = await import(pathToFileURL(outFile).href);
  if (typeof module.runCollectResourceRestartRegression !== 'function') {
    throw new Error('runCollectResourceRestartRegression export not found');
  }
  module.runCollectResourceRestartRegression();
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
