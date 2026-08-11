import '@/lib/polyfills';

describe('polyfills', () => {
  it('poly-fills localStorage with getItem, setItem, removeItem, clear', () => {
    const win = (typeof globalThis !== 'undefined' ? globalThis : global) as any;
    expect(win.localStorage).toBeDefined();
    expect(typeof win.localStorage.getItem).toBe('function');
    expect(typeof win.localStorage.setItem).toBe('function');

    expect(win.localStorage.getItem('cookieFallback')).toBeNull();
    win.localStorage.setItem('cookieFallback', JSON.stringify({ test: 123 }));
    expect(win.localStorage.getItem('cookieFallback')).toBe('{"test":123}');

    win.localStorage.removeItem('cookieFallback');
    expect(win.localStorage.getItem('cookieFallback')).toBeNull();
  });
});
