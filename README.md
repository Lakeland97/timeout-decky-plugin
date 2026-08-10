# Timeout - Decky Loader Plugin

Play-time discipline, focus with teeth, and optional parental lockout for Steam Deck.

![Timeout](https://img.shields.io/badge/Decky-Plugin-blue)
![Version](https://img.shields.io/badge/release-v0.1.0-green)
![License](https://img.shields.io/badge/license-BSD--3--Clause-blue)

> **Status — v0.1.0 (foundation).** This release ships the full alarm / timer / focus toolkit, which is stable and usable today. The discipline features that define Timeout — **Game Limits**, **Focus enforcement tiers**, and **Parental lockout** — are designed but not yet built. See [Planned](#planned).

## Implemented

The toolkit Timeout is built on. All of the below works today.

### ⏳ Timers
- **Multiple concurrent timers** - Run several timers at once
- **Saved presets** - Save any timer as a custom preset and start it with one click
- **Custom labels** - Name your timers for easy identification
- **Recent timers** - Quick access to your last 5 used timers
- **Persistent** - Survive Decky Loader restarts
- **Auto-suspend** - Optionally suspend the device when a timer completes

### 🔔 Alarms
- **Time-based alarms** - Set alarms for specific times
- **Recurring patterns** - Once, Daily, Weekdays, Weekends, or custom day selection
- **Snooze** - Configurable snooze duration (1-30 minutes)
- **Per-alarm options** - Individual subtle mode, auto-suspend, and prevent-sleep
- **Persistent** - Survive device reboots

### 🍅 Focus (Pomodoro)
- **Customizable sessions** - Work duration (15-60 min), short/long breaks, sessions until long break
- **Statistics** - Daily and lifetime focus time, sessions, and cycles; streak tracking
- **Skip controls** - Skip to break or back to work anytime
- **Background persistence** - Keeps running when you close the menu
- **Reset stats** - Wipe history and start fresh

### 🔊 Sound Options
- **Per-feature sounds** - Different sounds for Timers, Alarms, and Focus
- **Custom sounds** - Import your own MP3, WAV, or OGG from `~/Music/Timeout_Sounds`
- **Volume control** - Independent volume per feature

### 🎮 In-Game Overlay
- **At-a-glance** - See upcoming alarms and timers while gaming
- **Native integration** - Renders above game content only when needed; the Quick Access Menu and plugin pages stay interactive while a game runs
- **Non-intrusive** - Horizontal micro-alerts that don't block game UI
- **Pixel shift** - OLED burn-in protection that slowly orbits the overlay position

### 💤 Prevent Sleep
- Keep the Deck awake while you have active timers, alarms, or focus sessions
- Uses native SteamOS input inhibition for seamless operation in Game Mode

### 💾 Backup & Restore
- Export settings, alarms, timers, and stats to a file
- Move data between devices or restore after a re-install

### ⚙️ Settings
- Subtle mode (toast vs. fullscreen), auto-suspend, 24/12-hour format, per-feature volume, overlay placement

## Planned

The discipline layer that makes Timeout *Timeout*. These are the next milestones, in priority order. None are implemented yet.

### 🎮 Game Limits
The flagship feature. Bound how and when games are played.
- **Game selection** - whitelist or blacklist which games the limits apply to
- **Limits** - a global default plus per-game overrides
- **Budgets** - a daily open budget (e.g. 3 opens/day) and/or a per-session time cap (e.g. 20 min/open), resetting at midnight
- **Half-opens** - quit a session past a threshold to bank a partial open instead of losing the whole budget
- **Cooldowns** - optional compounding cooldowns between sessions
- **Curfew** - day-of-week-aware time windows (e.g. no play 12am-5am)
- **Concession** - a one-time "5 more minutes" so a curfew hit can save/finish

### 🎯 Focus enforcement tiers
Escalation levels (loose / steady / strict) so Pomodoro focus has actual teeth — not just a timer you can dismiss.

### 🔒 Parental controls + passcode
Distinguish self-control mode (you setting your own limits) from administrative lockout (a parent/guardian setting limits someone else can't bypass).

> Have thoughts on these? Game Limits is the furthest along — [open an issue](https://github.com/Lakeland97/timeout-decky-plugin/issues) to weigh in before the spec is finalized.

## Installation

### From Decky Store
1. Open Decky Loader on your Steam Deck
2. Go to the Store tab
3. Search for **Timeout** (coming soon — use manual install below for now)

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

BSD-3-Clause — see [LICENSE](LICENSE).

## Credits

- **Author**: Lakeland97
- **Framework**: [Decky Loader](https://github.com/SteamDeckHomebrew/decky-loader)
- **Icons**: [React Icons](https://react-icons.github.io/react-icons/)

## Support

If you run into a bug or have a feature request, please [open an issue](https://github.com/Lakeland97/timeout-decky-plugin/issues).
