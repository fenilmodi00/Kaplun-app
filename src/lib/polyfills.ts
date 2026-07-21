import { addLog, hookGlobalErrors } from '@/lib/logger';
import { Buffer } from 'buffer';

addLog('polyfills.ts: start');

try {
  hookGlobalErrors();
  addLog('polyfills.ts: global error handler hooked');
} catch (e) {
  addLog(`polyfills.ts: error hooking global handler: ${e}`);
}

try {
  if (typeof global.Buffer === 'undefined') {
    global.Buffer = Buffer;
    addLog('polyfills.ts: Buffer polyfill set');
  } else {
    addLog('polyfills.ts: Buffer already present');
  }
} catch (e) {
  addLog(`polyfills.ts: error setting Buffer: ${e}`);
}

addLog('polyfills.ts: done');
