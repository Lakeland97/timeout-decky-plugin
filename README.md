# Timeout - Decky Loader Plugin

Play-time discipline, focus with teeth, and optional parental lockout for Steam Deck.

![Timeout](https://img.shields.io/badge/Decky-Plugin-blue)
![Version](https://img.shields.io/badge/release-v0.1.0-green)
![License](https://img.shields.io/badge/license-BSD--3--Clause-blue)

> **Timeout is in early development.** Focus sessions work today. **Game Limits**, **Focus enforcement tiers**, and **Parental controls** are on the roadmap below.

## Today

### ⚡ Focus
- **Focus sessions** - Schedule and run timed focus sessions
- **Statistics** - Daily and lifetime focus time, sessions, and cycles
- **Skip controls** - Skip to a break or back to work anytime
- **Background persistence** - Keeps running when you close the menu

### 🔊 Custom sounds
- Per-feature sounds; import your own `.mp3`, `.wav`, or `.ogg` from `~/Music/Timeout_Sounds`

### 💤 Prevent sleep
- Keep the Deck awake during active focus sessions, using native SteamOS input inhibition

### 💾 Backup & restore
- Export your settings and data; move between devices or restore after a re-install

## Planned

The discipline layer that makes Timeout *Timeout*.

### 🎮 Game Limits
Bound how and when games are played.
- **Game selection** - whitelist or blacklist which games are limited
- **Limits** - a global default plus per-game overrides
- **Budgets** - a daily open budget (e.g. 3 opens/day) and/or a per-session time cap (e.g. 20 min/open), resetting at midnight
- **Half-opens** - quit a session past a threshold to bank a partial open instead of losing the whole budget
- **Cooldowns** - optional, compounding, between sessions
- **Curfew** - day-of-week-aware time windows (e.g. no play 12am-5am)
- **Concession** - a one-time "5 more minutes" so a curfew hit can save/finish

### 🎯 Focus enforcement tiers
Escalation levels (loose / steady / strict) so focus sessions have actual teeth - not just a prompt you can dismiss.

### 🔒 Parental controls + passcode
Distinguish self-control mode (you setting your own limits) from administrative lockout (a parent/guardian setting limits someone else can't bypass).

### 🔥 Streaks (span everything)
A unified streak metric across all discipline features - focus adherence, game-limits adherence, and more. Disabling a limit costs your streak, with one asymmetry: turning off an **open limit** breaks the streak immediately; turning off a **time limit** breaks it only if you then exceed the cap.

> Have thoughts? [Open an issue](https://github.com/Lakeland97/timeout-decky-plugin/issues) - Game Limits is the furthest along.

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
