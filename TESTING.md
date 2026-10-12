# Timeout — Field Test Checklist

Manual test run for the `feat/field-test-hardening` build (v0.1.0). Every scenario
below maps to a fix in this release; run them in order on a real Steam Deck.
Format is always **Action → Expected result**.

Report failures via [GitHub issues](https://github.com/Lakeland97/timeout-decky-plugin/issues)
and attach the plugin log (see [Getting logs](#getting-logs)).

## Install

**Option A — deploy over SSH (developers):**

```bash
./deploy.sh <DECK_IP>     # builds, then copies to deck@<DECK_IP>:/home/deck/homebrew/plugins/timeout-decky-plugin
```

Action: run `./deploy.sh <DECK_IP>`, then restart the Deck (or restart Decky Loader).
→ Expected: `Timeout` appears in the Decky plugin menu; no errors in the Decky log.

**Option B — Decky "Install from Zip" (testers):**

```bash
pnpm install
pnpm run package          # produces release/timeout-decky-plugin.zip
```

Action: copy `release/timeout-decky-plugin.zip` to the Deck, open Decky Loader →
Settings → General → **Install from Zip**, select the zip (not a source archive),
restart Decky Loader.
→ Expected: `Timeout` appears in the plugin menu. (The zip is the packaged plugin —
a GitHub *source* download will not work.)

---

## 1. Focus session survives a power-off mid-session

1. Action: Start a focus session (any tier) with **Prevent sleep** enabled; let it run 2–3 minutes; hold the power button and fully shut down. Boot back into Gaming Mode.
   → Expected: Steam boots normally; no game is killed because of the power cycle.
2. Action: Open Timeout.
   → Expected: The session that expired during the outage is shown as finished — a missed-items entry labeled `Focus Focus` (or `Focus Break`) with details `Session finished at HH:MM`; the plugin is not stuck in an "active" state.
3. Action: Leave the Deck idle past any sleep timeout.
   → Expected: The Deck **sleeps normally** — no input jiggler keeps running. The sleep inhibitor was recomputed at boot from the (now inactive) focus state, so there is no permanent jiggler.

## 2. Corrupt settings.json is restored from backup

1. Action: Make any settings change in the plugin (so a fresh `.bak` exists). Switch to Desktop Mode and truncate or garble the settings file: `echo 'not json' > /home/deck/homebrew/settings/timeout-decky-plugin/settings.json` (the file lives under `DECKY_PLUGIN_SETTINGS_DIR`; the plugin logs its exact path on corruption).
   → Expected: File now contains invalid JSON.
2. Action: Restart Decky Loader (or reboot).
   → Expected: Plugin loads without crashing. The log contains `RESTORED settings from backup`, and your previous settings are back (copied from `settings.json.bak`, which is snapshotted on every settings change).
3. Action (optional): Also corrupt the `.bak` and reboot.
   → Expected: Plugin starts with default settings rather than crashing or hanging.

## 3. Game limits full walkthrough

Setup: Game Limits settings → enable the feature, use the **installed-games picker** to add a game, enable **opens** with `opens_per_day = 1` (that grants 2 credits: a full open costs 2, a half open costs 1).

1. Action: Launch the limited game; pick **Full open** on the launch menu.
   → Expected: Game starts; 2 credits consumed; the overlay badge in the Quick Access panel shows the remaining time/credits.
2. Action: Exhaust credits (use Half opens), then launch again.
   → Expected: Launch is **blocked and the game is terminated** (`no_credits`); a warning explains the reason.
3. Action: Enable **curfew** with a window covering "now" plus a **day mask** that includes today; launch the game.
   → Expected: Launch blocked (`curfew`). Set the day mask to exclude today (with the same clock window) and launch again.
   → Expected: Launch allowed — only listed days enforce the curfew.
4. Action: With credits available, launch and pick **Cancel** on the launch menu.
   → Expected: The game is **terminated** (Decision D1: Cancel never leaves an unlimited session running).
5. Action: Configure a time cap (or half-open cap), start a session, and let the cap expire.
   → Expected: A warning with a grace countdown appears; when grace expires, a **5-minute finish** is offered (30 s to accept). Accepting grants exactly the configured concession minutes, once per session; declining/ignoring leads to a **verified kill** of the game with the warning sound, and the game is confirmed gone before the plugin reports it terminated.
6. Action: Check the streak after a cap/curfew kill.
   → Expected: The day ends streak-neutral — the kill neither increments nor breaks the streak (a fair kill; see known limitations for the zero-gaming-day rule).

## 4. Self-control mode lock holds

1. Action: Parental controls → set a passcode and enable controls; lock (self mode).
   → Expected: The passcode is stored only as a salted SHA-256 hash (household-grade — see known limitations). Locked features (game limits, focus tier, take-a-break, mindfulness) become read-only in the UI.
2. Action: Try to change each locked feature from the settings UI.
   → Expected: Changes are refused (no unlock → no change).
3. Action: From the CEF console (README → CEF Debugging), attempt `update_settings` with protected keys, e.g. change `game_limits_config` or `parental_controls`.
   → Expected: Protected keys are **dropped**, not applied; the log records `update_settings dropped parental-protected keys`. The generic settings RPC cannot bypass the gated setters.
4. Action: Unlock with a wrong passcode, then the correct one.
   → Expected: Wrong → refused; correct → mode flips to admin and locked features become editable.

## 5. Mindfulness pauses on every trigger

Setup: Mindfulness settings → enable the pause globally and enable all five triggers; set a duration.

1. Action: Launch a (limited) game.
   → Expected: Pause modal appears **before** the launch proceeds.
2. Action: Trigger a parental unlock (any locked feature).
   → Expected: Pause modal appears before the passcode dialog.
3. Action: Press Stop focus, then (in a session) Take-a-break/skip.
   → Expected: Pause modal appears before the stop/skip takes effect.
4. Action: Open the Timeout settings panel.
   → Expected: Pause modal appears on entry.
5. Action: Disable one trigger and repeat its action.
   → Expected: No pause for that trigger; the action proceeds immediately. Proceeding from a pause always completes the original action.

## 6. Focus enforcement tiers

1. Action: Start a **soft** session; launch any game.
   → Expected: No warning; game runs undisturbed.
2. Action: Start a **medium** session; launch a game.
   → Expected: A "Focus session active" warning is shown; the launch is **allowed**. Also start medium while that game is **already running**.
   → Expected: A warning is emitted for the running game; it is not killed.
3. Action: Start a **hard** session; launch a game.
   → Expected: The launch is **blocked and the game terminated**.
4. Action: Start a **hard** session while a tracked/limited game is **already running**.
   → Expected: The running game is **terminated** at session start (hard covers already-running, not just new launches). Tier enforcement only applies during a live work phase — never during a break or after expiry.

## 7. Prevent sleep on/off

1. Action: Settings → Prevent sleep **ON**; start a focus session; leave the Deck idle.
   → Expected: The Deck does not sleep during the session (inhibitor active; the on-screen inhibitor indicator shows Timeout as the holder).
2. Action: Stop the session (or let it end); press the power button.
   → Expected: Inhibitor is released and the Deck **sleeps normally**. Toggle prevent-sleep **OFF** and repeat a session.
   → Expected: No inhibition at all; Deck sleeps on schedule even mid-session.

## 8. Backup export/import

1. Action: Settings → Backup → Export, accept the default path.
   → Expected: File created at `~/Documents/timeout_backup.json` (the default sits inside the allowed area).
2. Action: Export to a path outside `~/Documents`/`~/Downloads`, e.g. `/etc/timeout_backup.json`.
   → Expected: Refused with **"Path not allowed — use a file under ~/Documents or ~/Downloads."** Nothing is written outside the allowlist.
3. Action: Export twice to the same path.
   → Expected: Second export refused with **"A file already exists at that path — pick a different name."** (no silent clobber).
4. Action: Change some settings, then Import the file from step 1.
   → Expected: Settings restored from the backup file. If parental controls are locked, protected keys in the file are dropped (a locked admin cannot be overwritten by an imported file).

## 9. Custom sounds

1. Action: Desktop Mode → put `.mp3`/`.wav`/`.ogg` files (≤ 2 MB) into `~/Music/Timeout_Sounds`; Gaming Mode → Settings → Custom Sounds → **Import Sounds**.
   → Expected: Only audio files are imported; they appear in the sound list, preview/play correctly, and can be selected as focus/alarm sounds.
2. Action: From the CEF console, attempt a traversal: call the `get_sound_data` callable with `"custom:../../etc/passwd"` (or any name containing `/`, `\`, or NUL).
   → Expected: Response `success: false` with an error, **no file contents**; the log records `Rejected unsafe sound name`. Basename-only names with an allowed extension that resolve inside the sounds directory are the only accepted input; the same sanitization guards play and list.

## 10. Factory reset

1. Setup: With a focus session running (prevent-sleep on), custom sounds imported, game-limits state and a streak accumulated.
2. Action: Settings → **Factory reset** (must be unlocked — refused while parental controls are locked).
   → Expected: Everything returns to defaults: settings, focus state, game-limits state, streak, stats, missed-items list. The running session is cancelled, and the **sleep inhibitor is released** (jiggler cancelled, input device destroyed — the Deck can sleep immediately). A pre-reset snapshot is saved to `settings.json.bak` first. The plugin remains usable without a Decky restart.

---

## Known limitations

- **Passcode is household-grade.** It is stored as a salted SHA-256 hash on-device — honest friction against casual changes, not account-grade authentication. Anyone with the Deck can recover or replace it; do not treat it as a security boundary.
- **Enabling controls with an empty passcode leaves no unlock path** (pre-existing). Always set a passcode *before* enabling the lock.
- **Whitespace-only passcodes are accepted, not rejected** (pre-existing semantics): a passcode of only spaces is set and must be typed exactly to unlock, so avoid them.
- **A zero-gaming day zeroes the game-limits streak** (pre-existing semantics): the streak counts consecutive days with at least one adherent session.
- **A day that ends in a verified cap/curfew kill is streak-neutral** (new in this build, per spec): hitting the limit fairly neither increments nor breaks the streak. Runaway days (kill could not be verified) still break it.
- **Backup paths are confined to `~/Documents` and `~/Downloads`.** The export RPC also accepts an `allow_overwrite` flag, but it only ever applies inside that same allowlist — it cannot reach other paths.
- **Decky Store submission is pending** (icon/`publish.image` and store listing) — install from zip for now; the store tab will say "coming soon".
- **Known npm (Dependabot) advisories in dev dependencies are deferred.** They affect build-time tooling only and do not ship inside the plugin bundle.
- **The `debug_sound` backend RPC is dead code.** Harmless; scheduled for removal.
- **Running `python3 main.py` standalone does not work** (pre-existing): the Decky runtime provides the `settings` and `decky` modules, which are absent outside it. All real testing happens on-Deck.
- **The Steam-input catch-all gamepad hook was removed** in this build (dead code with store-review risk). Gamepad behavior otherwise unchanged.
- **Legacy plaintext passcode that happens to be exactly 64 hex characters** is indistinguishable from a stored hash, so the one-time migration leaves it as-is (documented in code). Any freshly saved passcode is hashed.

## Getting logs

- **Plugin log:** `/home/deck/homebrew/logs/timeout-decky-plugin/plugin.log` (Decky provides `DECKY_PLUGIN_LOG`/`DECKY_PLUGIN_LOG_DIR` to plugins; see [wiki.deckbrew.xyz/plugin-dev/env-vars](https://wiki.deckbrew.xyz/plugin-dev/env-vars)).
- **Decky Loader core logs:** see [wiki.deckbrew.xyz](https://wiki.deckbrew.xyz/) (user guide → environment variables / log locations).
- **Frontend console:** enable "Allow Remote CEF Debugging" in Decky Developer Settings and attach Chrome at `chrome://inspect` → `SharedJSContext` (see README → CEF Debugging).
