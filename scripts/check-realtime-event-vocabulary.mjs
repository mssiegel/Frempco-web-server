import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Verifies the copied Socket.IO event constants still match across the separate
// client and server repos. Run with `npm run check:realtime-events` from the
// server repo. The client repo defaults to `../Frempco-web-client`; set
// CLIENT_REPO_PATH when the checkout lives somewhere else.
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(scriptDirectory, '..');
const clientRoot = path.resolve(
  process.env.CLIENT_REPO_PATH ??
    path.join(serverRoot, '..', 'Frempco-web-client'),
);

const eventModules = {
  serverListen: {
    filePath: path.join(serverRoot, 'services', 'listenEvents.const.ts'),
    exportName: 'SERVER_LISTEN_EVENTS',
  },
  serverEmit: {
    filePath: path.join(serverRoot, 'services', 'emitEvents.const.ts'),
    exportName: 'SERVER_EMIT_EVENTS',
  },
  clientEmit: {
    filePath: path.join(
      clientRoot,
      'src',
      'socket',
      'emitEvents.const.ts',
    ),
    exportName: 'CLIENT_EMIT_EVENTS',
  },
  clientListen: {
    filePath: path.join(
      clientRoot,
      'src',
      'socket',
      'listenEvents.const.ts',
    ),
    exportName: 'CLIENT_LISTEN_EVENTS',
  },
};

function readEventMap({ filePath, exportName }) {
  const source = fs.readFileSync(filePath, 'utf8');
  const exportPattern = new RegExp(
    `export\\s+const\\s+${exportName}\\s*=\\s*\\{([\\s\\S]*?)\\}\\s+as\\s+const`,
  );
  const match = source.match(exportPattern);

  if (!match) {
    throw new Error(`Could not find ${exportName} in ${filePath}.`);
  }

  return Object.fromEntries(
    [...match[1].matchAll(/([A-Z0-9_]+):\s*'([^']+)'/g)].map(
      ([, key, value]) => [key, value],
    ),
  );
}

function formatMap(map) {
  return Object.entries(map)
    .map(([key, value]) => `  ${key}: '${value}'`)
    .join('\n');
}

function compareEventMaps(leftLabel, left, rightLabel, right) {
  const leftJson = JSON.stringify(left, null, 2);
  const rightJson = JSON.stringify(right, null, 2);

  if (leftJson === rightJson) return [];

  return [
    `${leftLabel} does not match ${rightLabel}.`,
    '',
    `${leftLabel}:`,
    formatMap(left),
    '',
    `${rightLabel}:`,
    formatMap(right),
  ];
}

const events = Object.fromEntries(
  Object.entries(eventModules).map(([name, eventModule]) => [
    name,
    readEventMap(eventModule),
  ]),
);

const failures = [
  ...compareEventMaps(
    'SERVER_LISTEN_EVENTS',
    events.serverListen,
    'CLIENT_EMIT_EVENTS',
    events.clientEmit,
  ),
  ...compareEventMaps(
    'SERVER_EMIT_EVENTS',
    events.serverEmit,
    'CLIENT_LISTEN_EVENTS',
    events.clientListen,
  ),
];

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log('Realtime event vocabulary matches between server and client.');
