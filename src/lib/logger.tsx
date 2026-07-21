import { useState, useEffect } from 'react';
import { Text, ScrollView, View, StyleSheet } from 'react-native';

let logLines: string[] = [];
let listeners: (() => void)[] = [];

function push(line: string) {
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  const entry = `[${timestamp}] ${line}`;
  logLines.push(entry);
  if (logLines.length > 100) logLines.shift();
  listeners.forEach((cb) => cb());
  // Keep a small native console channel so we can still see logs in Metro
  if (typeof console !== 'undefined' && console.log) {
    console.log('[CRASH-LOG]', entry);
  }
}

export function addLog(line: string) {
  push(line);
}

export function getLogs(): string[] {
  return [...logLines];
}

export function subscribe(callback: () => void) {
  listeners.push(callback);
  return () => {
    listeners = listeners.filter((cb) => cb !== callback);
  };
}

export function hookGlobalErrors() {
  if (typeof global.ErrorUtils !== 'undefined') {
    const originalHandler = global.ErrorUtils.getGlobalHandler();
    global.ErrorUtils.setGlobalHandler((error: any, isFatal?: boolean) => {
      push(`GLOBAL ERROR${isFatal ? ' (FATAL)' : ''}: ${error?.message || String(error)}`);
      if (error?.stack) {
        push(error.stack.split('\n').slice(0, 5).join(' \n'));
      }
      // Show a red-screen-like on-screen log for fatal errors
      if (isFatal) {
        // Save to a global so the SplashLogger can render it
        (global as any).__lastFatalError = error;
      }
      originalHandler(error, isFatal);
    });
  }
}

export function SplashLogger() {
  const [logs, setLogs] = useState<string[]>(() => getLogs());
  const [lastFatal, setLastFatal] = useState<any>((global as any).__lastFatalError);

  useEffect(() => {
    const unsub = subscribe(() => {
      setLogs(getLogs());
      setLastFatal((global as any).__lastFatalError);
    });
    return unsub;
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Startup Logs</Text>
      {lastFatal && (
        <View style={styles.fatalBox}>
          <Text style={styles.fatalTitle}>FATAL ERROR</Text>
          <Text style={styles.fatalText}>{lastFatal?.message || String(lastFatal)}</Text>
        </View>
      )}
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {logs.map((line, i) => (
          <Text key={i} style={styles.line} selectable>
            {line}
          </Text>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111',
    paddingTop: 48,
  },
  title: {
    color: '#0f0',
    fontSize: 16,
    fontWeight: 'bold',
    padding: 12,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 12,
  },
  line: {
    color: '#eee',
    fontSize: 12,
    fontFamily: 'monospace',
    marginBottom: 4,
  },
  fatalBox: {
    backgroundColor: '#500',
    padding: 12,
    margin: 12,
    borderRadius: 8,
  },
  fatalTitle: {
    color: '#fff',
    fontWeight: 'bold',
    marginBottom: 6,
  },
  fatalText: {
    color: '#fff',
    fontSize: 12,
  },
});
