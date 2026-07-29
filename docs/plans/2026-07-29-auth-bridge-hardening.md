# Auth Bridge Hardening Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Gate the app on a successful Clerk→Appwrite bridge so cold start never mounts tabs before an Appwrite session exists, with clear Retry UI and split error meanings.

**Architecture:** Keep Clerk + Appwrite + FastAPI. AuthGate awaits `ensureAppwriteSession` (existing TTL fast-path) before rendering `<Slot />`. Bridge failures surface as `bridge_failed` with Retry; Instagram keeps `session_expired`.

**Tech Stack:** Expo SDK 54, Clerk Expo, Appwrite TablesDB, FastAPI bridge endpoint, jest-expo.

**Design doc:** `docs/plans/2026-07-29-auth-bridge-hardening-design.md`

---

### Task 1: Failing tests — AuthGate blocks Slot until bridge ready

**Files:**
- Modify: `src/__tests__/auth-gate.test.tsx`
- Modify (later): `src/app/_layout.tsx`

**Step 1: Write the failing tests**

Add to `auth-gate.test.tsx` (keep existing retry tests; update mocks if ClaySpinner now shows a label):

```tsx
it('does not render Slot while bridge is pending', async () => {
  let resolveBridge!: (v: unknown) => void;
  mockEnsureAppwriteSession.mockReturnValue(
    new Promise((resolve) => {
      resolveBridge = resolve;
    }),
  );

  const { queryByText } = await act(async () => render(<RootLayout />));
  await act(async () => {
    await Promise.resolve();
  });

  expect(queryByText('Slot')).toBeNull();
  // Spinner / connecting UI visible (match whatever label AuthGate uses)
  expect(queryByText(/Connecting|Loading/i)).toBeTruthy();

  await act(async () => {
    resolveBridge({});
  });
  expect(queryByText('Slot')).toBeTruthy();
});

it('shows Retry after exhausted bridge failures and does not render Slot', async () => {
  mockEnsureAppwriteSession.mockRejectedValue(new Error('bridge_failed'));

  const { queryByText, getByText } = await act(async () => render(<RootLayout />));

  // Advance through 3 retries with exponential backoff (1s, 2s, 4s) — match existing test pattern
  for (let i = 0; i < 4; i++) {
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      jest.advanceTimersByTime(8000);
    });
  }

  expect(queryByText('Slot')).toBeNull();
  expect(getByText(/Retry/i)).toBeTruthy();
});
```

**Step 2: Run tests to verify they fail**

Run: `bun test src/__tests__/auth-gate.test.tsx`

Expected: new tests FAIL (Slot currently renders while bridge pending; no Retry UI).

**Step 3: Commit tests only**

```bash
git add src/__tests__/auth-gate.test.tsx
git commit -m "test: AuthGate must block Slot until Appwrite bridge ready"
```

---

### Task 2: Implement AuthGate bridge-ready gate

**Files:**
- Modify: `src/app/_layout.tsx` (`AuthGate`)
- Test: `src/__tests__/auth-gate.test.tsx`

**Step 1: Implement minimal gate state**

In `AuthGate`, track:

```ts
type BridgeStatus = 'idle' | 'bridging' | 'ready' | 'failed';
const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus>('idle');
```

Behavior:

- `!isSignedIn` → reset to `idle`, show `AuthScreen`
- `isSignedIn` → set `bridging`, call `ensureAppwriteSession` with existing 3× backoff
- success → `ready` → render `<Slot />`
- exhausted failure → `failed` → centered error + `Pressable`/`ClayAnimatedButton` “Retry” that resets attempts and re-runs bridge
- while `bridging` (and fonts/Clerk loaded) → `<ClaySpinner label="Connecting..." />` — **do not render Slot**

Keep cancellation / timer cleanup from the existing effect.

**Step 2: Run tests**

Run: `bun test src/__tests__/auth-gate.test.tsx`

Expected: all AuthGate tests PASS (including previous retry timing tests — adjust if timing expectations shift because Slot is gated).

**Step 3: Commit**

```bash
git add src/app/_layout.tsx src/__tests__/auth-gate.test.tsx
git commit -m "fix: gate app shell on Appwrite bridge success"
```

---

### Task 3: Bridge logging + clearer error type

**Files:**
- Modify: `src/lib/auth-bridge.ts`
- Modify: `src/app/_layout.tsx` (map failures to user-facing copy)
- Optional test: extend `src/__tests__/auth-gate.test.tsx` or add unit coverage if a pure helper is extracted

**Step 1: Add `addLog` around bridge paths**

In `ensureAppwriteSession`:

- Log fast-path hit when `account.get()` succeeds within TTL
- Log full-bridge start / success / failure
- On failure, throw `new Error('bridge_failed')` (or preserve cause message in logs but standardize `.message` for AuthGate)

Do **not** change Instagram `session_expired` semantics in `instagram.ts` / `withFreshSession`.

**Step 2: AuthGate copy**

Failed state message e.g. “Couldn’t connect to your workspace” + Retry. Do not say “session_expired”.

**Step 3: Run tests + lint**

```bash
bun test src/__tests__/auth-gate.test.tsx
bun run lint
```

Expected: PASS / no new tsc errors.

**Step 4: Commit**

```bash
git add src/lib/auth-bridge.ts src/app/_layout.tsx
git commit -m "chore: log bridge path and use bridge_failed for AuthGate"
```

---

### Task 4: Docs sync

**Files:**
- Modify: `AGENTS.md` (AuthGate / auth bullet)
- Modify: `src/lib/AGENTS.md` (bridge + AuthGate gate note)

**Step 1: Update docs**

Document:

- AuthGate blocks until Appwrite session ready
- Errors: `bridge_failed` vs IG `session_expired`
- Diagram from design §4 (short)

**Step 2: Commit**

```bash
git add AGENTS.md src/lib/AGENTS.md
git commit -m "docs: AuthGate bridge gate and error split"
```

---

### Task 5: Manual verification checklist

No code. Confirm on device/simulator:

1. Signed out → AuthScreen
2. Sign in → “Connecting…” then Home (no empty flash from missing session)
3. Kill FastAPI / break `EXPO_PUBLIC_IG_API_BASE_URL` → Retry UI, no Slot
4. Retry after restoring API → enters app
5. Re-open within 24h → fast-path (quick Connecting → Slot)
6. Instagram disconnect still surfaces `session_expired` reconnect path (unchanged)

---

## Out of scope (do not implement)

- Supabase
- Moving mint to Appwrite Function
- BFF for TablesDB
- Auth UI redesign
- Instagram OAuth / SessionManager changes
