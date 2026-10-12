# Timeout - Decky Loader Plugin

Play-time limits, focus modes, and parental controls for Steam Deck.

![Timeout](https://img.shields.io/badge/Decky-Plugin-blue)
![Version](https://img.shields.io/badge/release-v0.2.0-green)
![License](https://img.shields.io/badge/license-BSD--3--Clause-blue)

> **Timeout is in early development.**

**Testers:** the field-test runbook lives in **[TESTING.md](TESTING.md)** — install
steps, 10 manual test scenarios, and known limitations.

## Features

✓ shipped · ◐ WIP · ✗ planned

### ⚡ Focus
- ✓ Focus sessions
- ✓ Statistics
- ✓ Background persistence
- ✓ Take-a-break (per-session cap persists)

### 🔊 Custom sounds
- ✓ Import custom sounds

### 💤 Prevent sleep
- ✓ SteamOS sleep inhibition

### 💾 Backup & restore
- ✓ Export/import backup (paths confined to ~/Documents and ~/Downloads)

### 🎮 Game Limits
- ✓ Game selection
- ✓ Limits
- ✓ Budgets
- ✓ Half-opens
- ✓ Cooldowns
- ✓ Curfew
- ✓ Per-limit active windows
- ✓ Concession

### 🎯 Focus enforcement tiers
- ✓ Soft
- ✓ Medium (launch warn)
- ✓ Hard (launch + already-running)

### 🔒 Parental controls + passcode
- ✓ Self-control mode
- ✓ Administrative lockout

Passcodes are stored as a salted SHA-256 hash on-device: **household-grade
(hashed), not account-grade auth** — see [TESTING.md known limitations](TESTING.md#known-limitations).

### 🧘 Mindfulness pause
- ✓ Cooldown before distractions
- ✓ Cooldown on entering settings

### 🔥 Streaks
- ✓ Game-limits streak[^streak]
- ✗ Unified metric

[^streak]: Consecutive adherent days. A day ending in a verified cap/curfew kill
is streak-neutral (no increment, no zero); a zero-gaming day resets the count —
see [TESTING.md](TESTING.md#known-limitations).

> [Open an issue](https://github.com/Lakeland97/timeout-decky-plugin/issues) if you have feedback.

## Installation

### From Decky Store
1. Open Decky Loader on your Steam Deck
2. Go to the Store tab
3. Search for **Timeout** (coming soon - use manual install below for now)

### Manual Installation
1. Download the latest release from the [Releases](https://github.com/Lakeland97/timeout-decky-plugin/releases) page
2. Open Decky Loader > Settings > General > "Install from Zip" > Select the Zip release file (not source code!)
3. Restart Decky Loader

## Adding Custom Sounds

1. Go to Desktop Mode
2. Create a folder named `Timeout_Sounds` in your Music folder (`~/Music/Timeout_Sounds`)
3. Place your sound files (`.mp3`, `.wav`, or `.ogg`, max 2MB) in this folder
4. Return to Gaming Mode > Timeout > Settings
5. Scroll down to "**Custom Sounds**" and click "**Import Sounds**"

## Development

```bash
# Prerequisites: Node.js 18+ and pnpm v9
pnpm install
pnpm run build        # production build
pnpm run watch        # dev watch mode
```

Deploy to a Steam Deck over SSH:
```bash
./deploy.sh 192.168.X.X
```

### CEF Debugging
1. Enable "Allow Remote CEF Debugging" in Decky Developer Settings
2. Open Chrome/Edge at `chrome://inspect`, configure network target `DECK_IP:8081`
3. Select "SharedJSContext" to debug

## Privacy

- All data stays on your device. No analytics, telemetry, or tracking.

## License

BSD-3-Clause - see [LICENSE](LICENSE).

## Credits

- **Author**: Lakeland97
- **Based on**: [AlarMe](https://github.com/lemossilva/alarme-decky-plugin) by Guilherme Lemos
- **Framework**: [Decky Loader](https://github.com/SteamDeckHomebrew/decky-loader)
- **Icons**: [React Icons](https://react-icons.github.io/react-icons/)

## Support

If you run into a bug or have a feature request, please [open an issue](https://github.com/Lakeland97/timeout-decky-plugin/issues).
