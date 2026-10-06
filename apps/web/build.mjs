import { cp, mkdir, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const output = path.join(root, 'dist');
const sourceFiles = [
    'app.js',
    'api-client.js',
    'date-time.js',
    'workspace-navigation.js',
    'confirmation-dialog.js',
    'record-links.js',
    'record-details.js',
    'inventory.js',
    'equipment-label.js',
    'label-logo.js',
    'mx10-printer.js',
    'workspace-ui.js',
    'customer-ui.js',
    'transaction-records.js',
    'transaction-workflow.js',
    'settings-ui.js',
    'preferences.js',
    'analytics.js',
    'analytics-report.js',
    'styles.css'
];

await mkdir(path.join(output, 'src'), { recursive: true });
await mkdir(path.join(output, 'public'), { recursive: true });
await copyFile(path.join(root, 'index.html'), path.join(output, 'index.html'));
await Promise.all(sourceFiles.map(file => copyFile(path.join(root, 'src', file), path.join(output, 'src', file))));
await cp(path.join(root, 'public'), path.join(output, 'public'), { recursive: true });
console.log(`Static site built in ${output}`);
