import { cp, mkdir, copyFile, stat, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';

const root = path.dirname(fileURLToPath(import.meta.url));
const output = path.join(root, 'dist');

async function mtimeMs(filePath) {
  try {
    return (await stat(filePath)).mtimeMs;
  } catch {
    return 0;
  }
}

export async function compileReactBundles(appRoot = root, { force = false } = {}) {
  const reactDir = path.join(appRoot, 'src/react');
  const vendorOut = path.join(appRoot, 'src/react-vendor.js');
  const uiOut = path.join(appRoot, 'src/react-ui.js');

  const entries = await readdir(reactDir);
  const latestSource = Math.max(
    ...(await Promise.all(entries.map(name => mtimeMs(path.join(reactDir, name)))))
  );
  const vendorTime = await mtimeMs(vendorOut);
  const uiTime = await mtimeMs(uiOut);

  if (force || !vendorTime || vendorTime < (await mtimeMs(path.join(reactDir, 'vendor-entry.js')))) {
    await esbuild.build({
      entryPoints: [path.join(appRoot, 'src/react/vendor-entry.js')],
      outfile: vendorOut,
      bundle: true,
      format: 'esm',
      platform: 'browser',
      target: ['es2022'],
      banner: {
        js: `if (typeof process !== 'undefined' && process.versions?.node && globalThis.MessageChannel) { const _MC = globalThis.MessageChannel; globalThis.MessageChannel = class extends _MC { constructor() { super(); this.port1.unref?.(); this.port2.unref?.(); } }; }`
      },
      define: { 'process.env.NODE_ENV': '"production"' },
      logLevel: 'silent'
    });
  }

  if (force || !uiTime || uiTime < latestSource) {
    await esbuild.build({
      entryPoints: [path.join(appRoot, 'src/react/index.jsx')],
      outfile: uiOut,
      bundle: true,
      format: 'esm',
      platform: 'browser',
      target: ['es2022'],
      jsx: 'transform',
      jsxFactory: 'React.createElement',
      jsxFragment: 'React.Fragment',
      plugins: [
        {
          name: 'externalize-src-modules',
          setup(build) {
            build.onResolve({ filter: /^\.\.\/[A-Za-z0-9_-]+\.js$/ }, args => ({
              path: './' + path.basename(args.path),
              external: true
            }));
          }
        }
      ],
      logLevel: 'silent'
    });
  }
}

const sourceFiles = [
  'app.js',
  'react-vendor.js',
  'react-ui.js',
  'api-client.js',
  'account-validation.js',
  'notifications.js',
  'date-time.js',
  'workspace-navigation.js',
  'confirmation-dialog.js',
  'record-links.js',
  'record-codes.js',
  'record-details.js',
  'maintenance.js',
  'inventory.js',
  'inventory-stock.js',
  'equipment-label.js',
  'label-logo.js',
  'mx10-printer.js',
  'workspace-ui.js',
  'finance-ui.js',
  'rental-planning.js',
  'report-payments.js',
  'customer-ui.js',
  'walk-in-receipt.js',
  'thermal-receipt.js',
  'transaction-records.js',
  'transaction-workflow.js',
  'rental-desk.js',
  'release-verification.js',
  'qr-reader.js',
  'settings-ui.js',
  'preferences.js',
  'analytics.js',
  'analytics-report.js',
  'analytics-workspace.js',
  'analytics-insights.js',
  'analytics-charts.js',
  'styles.css'
];

await compileReactBundles(root, { force: process.argv.includes('--force') });
await mkdir(path.join(output, 'src'), { recursive: true });
await mkdir(path.join(output, 'public'), { recursive: true });
await copyFile(path.join(root, 'index.html'), path.join(output, 'index.html'));
await Promise.all(
  sourceFiles.map(file => copyFile(path.join(root, 'src', file), path.join(output, 'src', file)))
);
await cp(path.join(root, 'public'), path.join(output, 'public'), { recursive: true });
console.log(`Static site built in ${output}`);
