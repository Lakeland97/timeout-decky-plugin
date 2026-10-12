import { useEffect, useMemo, useState } from "react";
import { FaBell, FaBrain, FaGamepad, FaShieldAlt, FaMoon, FaVolumeMute, FaBellSlash } from "react-icons/fa";
import { useSettings } from "../hooks/useSettings";
import { useOverlayData } from "../hooks/useOverlayData";
import { useGameStatus } from "../hooks/useGameStatus";
import { useSleepInhibitor } from "../hooks/useSleepInhibitor";
import { useMissedAlerts } from "../hooks/useMissedAlerts";
import { useGameLimits } from "../hooks/useGameLimits";
import { formatDuration, formatTime } from "../utils/time";
import { Z_INDEX } from "../utils/zIndex";
import type { OverlayAlert, GameLimitsConfig, GameLimitsState } from "../types";

// Category icon mapping
const CATEGORY_ICONS: Record<string, JSX.Element> = {
    focus: <FaBrain />,
};

// Default position style (top-left corner)
const DEFAULT_POSITION_STYLE: React.CSSProperties = {
    top: 12,
    left: 12,
    justifyContent: 'flex-start',
    display: 'flex',
    alignItems: 'center'
};

// Format alert time display
function formatAlertTime(alert: OverlayAlert, use24h: boolean): string {
    const remaining = alert.remaining ?? (alert.time - Date.now() / 1000);

    // For active focus sessions, show countdown
    if (alert.category === 'focus') {
        if (remaining > 0) {
            return formatDuration(Math.round(remaining));
        }
        return '0:00';
    }

    // Fallback: relative or absolute time display
    if (remaining <= 0) return 'Now';
    if (remaining < 60) return '<1m';
    if (remaining < 3600) {
        const mins = Math.ceil(remaining / 60);
        return `${mins}m`;
    }
    if (remaining < 86400) {
        const hrs = Math.floor(remaining / 3600);
        const mins = Math.floor((remaining % 3600) / 60);
        return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
    }

    // Show absolute time for far-off alerts
    const date = new Date(alert.time * 1000);
    return formatTime(date.getHours(), date.getMinutes(), use24h);
}

// Single alert item - compact for bar layout
const OverlayAlertItem = ({
    alert,
    textSize,
    use24h,
    compactMode,
    showPreventSleepBadge
}: {
    alert: OverlayAlert;
    textSize: number;
    use24h: boolean;
    compactMode?: boolean;
    showPreventSleepBadge?: boolean;
}) => {
    const iconSize = Math.max(8, textSize - 1);
    const showShield = showPreventSleepBadge && alert.prevent_sleep;

    const hasAnyIcon = alert.subtle_mode || alert.auto_suspend || showShield;

    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4, // Slightly increased gap for better legibility
            whiteSpace: 'nowrap',
            lineHeight: 1
        }}>
            <div style={{
                fontSize: iconSize,
                opacity: 0.8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                height: iconSize, // Force height to match font size for centering
                width: iconSize
            }}>
                {CATEGORY_ICONS[alert.category] || <FaBell />}
            </div>
            {!compactMode && (
                <span style={{
                    fontSize: textSize,
                    opacity: 0.9,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    maxWidth: 80,
                    lineHeight: 1,
                    display: 'flex',
                    alignItems: 'center'
                }}>
                    {alert.label}
                </span>
            )}
            {hasAnyIcon && (
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 2,
                    opacity: 0.8
                }}>
                    {showShield && (
                        <FaShieldAlt size={Math.max(8, textSize - 2)} color="#e69900" />
                    )}
                    {alert.auto_suspend ? (
                        <FaMoon size={Math.max(8, textSize - 2)} />
                    ) : (
                        alert.subtle_mode && <FaVolumeMute size={Math.max(8, textSize - 2)} />
                    )}
                </div>
            )}
            <span style={{
                fontSize: textSize,
                fontFamily: 'monospace',
                fontWeight: 600,
                opacity: 1,
                flexShrink: 0,
                lineHeight: 1,
                display: 'flex',
                alignItems: 'center'
            }}>
                {formatAlertTime(alert, use24h)}
            </span>
        </div>
    );
};

// ---- Game Limits badge ----
// Reads the same push-fed state as the settings pages (useGameLimits: one
// initial fetch + 'timeout_game_state' events) — no second polling loop.
// The only timer is a local 1s re-render that re-derives values from
// absolute deadlines already present in that state.
interface GameLimitsBadgeData {
    countdownTarget: number | null; // epoch secs (cap or grace end) while counting down
    remaining: number | null;
    showCredits: boolean;
    credits: number;
    warnLevel: 0 | 1 | 2; // 0 = normal, 1 = warn threshold, 2 = at-cap / in grace
    curfewActive: boolean;
    sessionActive: boolean;
}

// Backend compares datetime.now().strftime("%a") — "Mon".."Sun".
const WEEKDAY_ABBRS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const hhmmToMinutes = (s: string): number => {
    const m = /^(\d{1,2}):(\d{1,2})/.exec(String(s ?? ''));
    if (!m) return 0;
    return Math.min(23, parseInt(m[1], 10)) * 60 + Math.min(59, parseInt(m[2], 10));
};

// Mirrors backend _now_in_curfew: day-mask filter, then [start, end) window
// that wraps midnight; start == end is an empty window (never active).
const isCurfewActiveNow = (global: GameLimitsConfig['global'], nowSec: number): boolean => {
    if (!global.curfew_enabled) return false;
    const days = Array.isArray(global.curfew_days) ? global.curfew_days : [];
    const now = new Date(nowSec * 1000);
    if (days.length > 0 && !days.includes(WEEKDAY_ABBRS[now.getDay()])) return false;
    const start = hhmmToMinutes(global.curfew_start);
    const end = hhmmToMinutes(global.curfew_end);
    if (start === end) return false;
    const nowMin = now.getHours() * 60 + now.getMinutes();
    return start < end ? nowMin >= start && nowMin < end : nowMin >= start || nowMin < end;
};

// null when Game Limits is off and nothing is active → badge renders nothing.
const buildGameLimitsBadge = (
    config: GameLimitsConfig | null,
    state: GameLimitsState,
    nowSec: number
): GameLimitsBadgeData | null => {
    if (!config || !config.enabled) return null;
    const base = config.global;
    const found = Object.entries(state ?? {}).find(([, entry]) => !!entry && !!entry.session_start);
    // Effective rule: global merged with the running game's override
    // (mirrors backend _effective_rule; empty override = global).
    const override = found ? (config.per_game?.[found[0]] ?? {}) : {};
    const g: GameLimitsConfig['global'] = {
        ...base,
        ...Object.fromEntries(Object.entries(override).filter(([, v]) => v !== null && v !== undefined))
    };

    const curfewActive = isCurfewActiveNow(g, nowSec);
    if (!found && !curfewActive) return null;

    const sessionActive = !!found;
    let countdownTarget: number | null = null;
    let remaining: number | null = null;
    let warnLevel: 0 | 1 | 2 = 0;
    let credits = 0;

    if (found) {
        const entry = found[1];
        const target = entry.in_grace && entry.grace_until ? entry.grace_until : entry.session_cap_end;
        if (typeof target === 'number') {
            countdownTarget = target;
            remaining = Math.max(0, target - nowSec);
            // Warn thresholds persist as [before-cap, at-cap] (default [5, 1]);
            // same shape guard as the settings page.
            const thresholds = Array.isArray(g.warn_thresholds_minutes) ? g.warn_thresholds_minutes : [5, 1];
            const warnBefore = typeof thresholds[0] === 'number' ? thresholds[0] : 5;
            const warnAt = typeof thresholds[1] === 'number' ? thresholds[1] : 1;
            if (entry.in_grace || remaining <= warnAt * 60) warnLevel = 2;
            else if (remaining <= warnBefore * 60) warnLevel = 1;
        } else if (entry.in_grace) {
            warnLevel = 2;
        }
        credits = typeof entry.credits_remaining === 'number' ? entry.credits_remaining : 0;
    }

    return {
        countdownTarget,
        remaining,
        showCredits: !!g.opens_enabled,
        credits,
        warnLevel,
        curfewActive,
        sessionActive
    };
};

export const GameOverlay = () => {
    const { settings } = useSettings();
    const isGameRunning = useGameStatus();
    const alerts = useOverlayData(settings, isGameRunning);
    const { isActive: inhibitorActive } = useSleepInhibitor();
    const { hasNewMissedAlerts } = useMissedAlerts();
    const { config: gameLimitsConfig, state: gameLimitsState } = useGameLimits();
    const [nowSec, setNowSec] = useState(() => Date.now() / 1000);
    const gameLimitsBadge = useMemo(
        () => buildGameLimitsBadge(gameLimitsConfig, gameLimitsState, nowSec),
        [gameLimitsConfig, gameLimitsState, nowSec]
    );

    // Local 1s re-render for countdown / curfew-boundary accuracy — only while
    // the overlay is on and Game Limits is enabled; nothing ticks otherwise.
    useEffect(() => {
        if (!settings.overlay_enabled || !gameLimitsConfig?.enabled) return;
        const interval = setInterval(() => setNowSec(Date.now() / 1000), 1000);
        return () => clearInterval(interval);
    }, [settings.overlay_enabled, gameLimitsConfig?.enabled]);

    const hasContent = alerts.length > 0 || inhibitorActive || hasNewMissedAlerts || !!gameLimitsBadge;

    const positionStyle = useMemo(() => {
        const isCustom = settings.overlay_position === 'custom';
        if (isCustom) {
            return {
                ...DEFAULT_POSITION_STYLE,
                left: settings.overlay_custom_x ?? 12,
                top: settings.overlay_custom_y ?? 12
            };
        }
        return DEFAULT_POSITION_STYLE;
    }, [settings.overlay_position, settings.overlay_custom_x, settings.overlay_custom_y]);

    if (!settings.overlay_enabled || !hasContent) {
        return null;
    }

    const displayMode = settings.overlay_display_mode || 'both';
    if (displayMode === 'gaming_only' && !isGameRunning) {
        return null;
    }
    if (displayMode === 'steam_only' && isGameRunning) {
        return null;
    }

    const baseOpacity = settings.overlay_opacity ?? 0.85;

    return (
        <div
            style={{
            position: 'fixed',
            ...positionStyle,
            zIndex: Z_INDEX.GAME_OVERLAY_BASE,
            pointerEvents: 'none',
            opacity: baseOpacity,
            color: '#8b8b8b',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            userSelect: 'none',
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12
        }}
        >
            {/* Main line */}
            <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                {/* Badges Container */}
                {((settings.overlay_show_prevent_sleep_badge ?? true) && inhibitorActive) ||
                 ((settings.overlay_show_missed_badge ?? true) && hasNewMissedAlerts) ? (
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6
                    }}>
                        {(settings.overlay_show_prevent_sleep_badge ?? true) && inhibitorActive && (
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                color: '#e69900'
                            }}>
                                <FaShieldAlt size={settings.overlay_text_size ?? 11} />
                            </div>
                        )}

                        {(settings.overlay_show_missed_badge ?? true) && hasNewMissedAlerts && (
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                color: '#ff4444'
                            }}>
                                <FaBellSlash size={settings.overlay_text_size ?? 11} />
                            </div>
                        )}
                    </div>
                ) : null}

                {/* Separator between badges and alerts if both exist */}
                {(((settings.overlay_show_prevent_sleep_badge ?? true) && inhibitorActive) ||
                  ((settings.overlay_show_missed_badge ?? true) && hasNewMissedAlerts)) &&
                 alerts.length > 0 && (
                    <div style={{
                        width: 1,
                        height: (settings.overlay_text_size ?? 11) + 2,
                        backgroundColor: '#8b8b8b',
                        opacity: 0.3
                    }} />
                )}

                {/* Horizontal bar layout - alerts separated by dots */}
                {alerts.map((alert, index) => (
                    <div key={alert.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        {index > 0 && (
                            <span style={{
                                opacity: 0.4,
                                fontSize: 10,
                                lineHeight: 0,
                                display: 'flex',
                                alignItems: 'center',
                                height: '100%',
                                marginBottom: -1
                            }}>·</span>
                        )}
                        <OverlayAlertItem
                            alert={alert}
                            textSize={settings.overlay_text_size ?? 11}
                            use24h={settings.time_format_24h}
                            compactMode={settings.overlay_compact_mode}
                            showPreventSleepBadge={(settings.overlay_show_prevent_sleep_badge ?? true) && alerts.length > 1}
                        />
                    </div>
                ))}

                {/* Game Limits badge — only present when a tracked session or the
                    curfew is active (buildGameLimitsBadge returns null otherwise). */}
                {gameLimitsBadge && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', lineHeight: 1 }}>
                        {alerts.length > 0 && (
                            <div style={{
                                width: 1,
                                height: (settings.overlay_text_size ?? 11) + 2,
                                backgroundColor: '#8b8b8b',
                                opacity: 0.3
                            }} />
                        )}
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                            color: gameLimitsBadge.warnLevel === 2
                                ? '#ff4444'
                                : gameLimitsBadge.warnLevel === 1
                                    ? '#e69900'
                                    : undefined
                        }}>
                            <FaGamepad
                                size={settings.overlay_text_size ?? 11}
                                style={{ opacity: 0.8, flexShrink: 0 }}
                            />
                            {gameLimitsBadge.sessionActive && gameLimitsBadge.remaining !== null && (
                                <span style={{
                                    fontSize: settings.overlay_text_size ?? 11,
                                    fontFamily: 'monospace',
                                    fontWeight: 600
                                }}>
                                    {formatDuration(Math.round(gameLimitsBadge.remaining))}
                                </span>
                            )}
                            {gameLimitsBadge.sessionActive && gameLimitsBadge.showCredits && (
                                <span style={{
                                    fontSize: settings.overlay_text_size ?? 11,
                                    fontFamily: 'monospace',
                                    fontWeight: 600,
                                    opacity: 0.9
                                }}>
                                    {gameLimitsBadge.credits} credits
                                </span>
                            )}
                            {gameLimitsBadge.curfewActive && (
                                <span style={{
                                    fontSize: settings.overlay_text_size ?? 11,
                                    fontWeight: 600,
                                    color: '#ff4444'
                                }}>
                                    Curfew
                                </span>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
