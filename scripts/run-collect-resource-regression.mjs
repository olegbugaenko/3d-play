import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const tests = [
  {
    entry: 'collect-resource-restart.test.ts',
    exportName: 'runCollectResourceRestartRegression',
    output: 'collect-resource-test.mjs'
  },
  {
    entry: 'parameter-resolvers.test.ts',
    exportName: 'runParameterResolversTests',
    output: 'parameter-resolvers-test.mjs'
  }
];

const outDir = mkdtempSync(join(tmpdir(), 'command-tests-'));

try {
  for (const test of tests) {
    const outFile = join(outDir, test.output);

    await build({
      entryPoints: [`src/logic/systems/commands/tests/${test.entry}`],
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
    if (typeof module[test.exportName] !== 'function') {
      throw new Error(`${test.exportName} export not found in ${test.entry}`);
    }
    module[test.exportName]();
  }
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
