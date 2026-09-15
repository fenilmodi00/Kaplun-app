# Device verification — optional human checklist

**Agent scope:** implement screens to the laws in `SKILL.md`. **You** verify on a
real device (Kaplun: EAS development APK + Expo dev client + Metro). The agent
does not run simulators, emulators, or screen recordings unless you ask.

Use this when you are testing a flow yourself or when you paste feedback /
screenshots from the device.

## How to run on device (Kaplun default)

1. Start Metro: `bun start` (or `npx expo start --dev-client`).
2. Open the installed **development** build on your phone (same LAN or tunnel).
3. Navigate to the screen or flow under test.

## Per-screen checklist

**Layout**
- [ ] Nothing clipped by the status bar / cutout; scrolled content passes
      under the system chrome with the intended fade/blur, not a hard edge
- [ ] Bottom CTA clears the gesture/nav bar (safe-area inset respected)
- [ ] Optical alignment: icons vs text baselines, centered things actually
      look centered (check at 2× zoom on a screenshot)
- [ ] Spacing rhythm consistent (no rogue gaps in your 4/8pt system)
- [ ] Long text: 2× length titles truncate/wrap by design, not by accident
- [ ] Empty, loading, and error states each forced once

**Theming & type**
- [ ] Dark mode AND light mode inspected on device
- [ ] Large accessibility text (if supported): no overlap, no clipped labels
- [ ] Contrast: secondary text still readable in both themes

**Motion (record on device if you care about frame-level polish)**
- [ ] Transitions feel native at full speed; no obvious stutter or flash
- [ ] Gesture follows the finger; release settles cleanly
- [ ] Modals/sheets: present, drag, dismiss — both directions
- [ ] Keyboard appear and dismiss: layout tracks input, no jump-cuts
- [ ] Reduce Motion (system setting) → spatial motion collapses to fades

**Interaction**
- [ ] Every tappable ≥ 44pt; press states visible; haptics where expected
- [ ] Android hardware/gesture back behaves per navigation laws
- [ ] Rapid double-taps don't double-navigate or double-submit

**State**
- [ ] Background the app mid-flow → return: state intact
- [ ] Kill and relaunch: persisted state restores, ephemeral state resets
- [ ] Offline: actions queue or fail loudly — never silently

## Device matrix (minimum for Kaplun)

| Profile | Why |
|---|---|
| Your daily Android phone (primary) | Real perf, fonts, gestures, dev APK |
| A smaller or older Android if available | Layout compression, reachability |
| iOS device only if the project ships iOS | Safe areas, edge swipe, large titles |

Run the full checklist on primary; spot-check layout and the hero flow on
secondary devices.
