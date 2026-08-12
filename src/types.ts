// TypeScript type definitions for Timeout plugin

// Sound file types
export interface SoundFile {
    filename: string;
    name: string;
}

// Focus types
export interface FocusState {
    active: boolean;
    is_break: boolean;
    current_session: number;
    current_cycle?: number;
    tier?: FocusTier;
    end_time: number | null;
    duration: number;
    remaining?: number;
    elapsed_this_phase?: number;
    break_type?: 'short' | 'long';
    sound?: string;
    volume?: number;
    subtle_mode?: boolean;
    prevent_sleep?: boolean;
    stats?: FocusStats;
}

export interface FocusStats {
    daily_focus_time: number;
    daily_break_time: number;
    daily_sessions: number;
    daily_cycles: number;
    total_focus_time: number;
    total_break_time: number;
    total_sessions: number;
    total_cycles: number;
    last_active_date: string;
    daily_history: DailyHistoryEntry[];
    current_streak: number;
    longest_streak: number;
}

export interface DailyHistoryEntry {
    date: string;
    focus_time: number;
    sessions: number;
}

// Settings types
export interface UserSettings {
    time_format_24h: boolean;
    // Focus settings
    focus_sound: string;
    focus_volume: number;
    focus_subtle_mode: boolean;
    focus_prevent_sleep: boolean;
    focus_work_duration: number;
    focus_break_duration: number;
    focus_long_break_duration: number;
    focus_sessions_until_long_break: number;
    focus_default_tier: FocusTier;  // soft | medium | hard
    focus_take_a_break_max_per_session: number;
    parental_controls: ParentalControls;
    focus_daily_goal_enabled: boolean;
    focus_daily_goal: number;  // hours per day goal
    // Missed Alerts Global Settings
    missed_alerts_enabled: boolean;
    missed_alerts_window: number; // hours to look back
    // Suspend Behavior
    focus_suspend_behavior?: 'continue' | 'pause';
    // Display settings
    snooze_activation_delay: number;
    // Overlay settings
    overlay_enabled: boolean;
    overlay_display_mode: OverlayDisplayMode;
    overlay_position: OverlayPosition;
    overlay_custom_x: number;
    overlay_custom_y: number;
    overlay_text_size: number;
    overlay_opacity: number;
    overlay_max_alerts: number;
    overlay_time_window: number;        // hours ahead to show
    overlay_show_focus: boolean;
    overlay_compact_mode: boolean;
    overlay_show_prevent_sleep_badge: boolean;
    overlay_show_missed_badge: boolean;
    // Tab Order
    tab_order?: string[];
    // Legacy/deprecated (kept for migration)
    overlay_position_steamui?: OverlayPosition;
    subtle_mode?: boolean;
}

    // Sleep inhibitor status
export interface SleepInhibitorItem {
    type: string;
    id: string;
    label: string;
}

export interface SleepInhibitorStatus {
    active: boolean;
    reason?: string;
    items?: SleepInhibitorItem[];
}

export interface MissedItem {
    id: string;
    type: 'focus';
    label: string;
    due_time: number;
    missed_at: number;
    details?: string; // Richer details about what was missed
}

// Event payload types
export interface FocusTickEvent {
    remaining: number;
    is_break: boolean;
    session: number;
    cycle?: number;
}

// Overlay types
export type OverlayPosition = 'default' | 'custom';

export type OverlayDisplayMode = 'both' | 'steam_only' | 'gaming_only' | 'always';

export type OverlayCategory = 'focus';

export interface OverlayAlert {
    id: string;
    category: OverlayCategory;
    label: string;
    time: number;       // UNIX timestamp of trigger/end
    remaining?: number; // seconds remaining (for focus)
    subtle_mode?: boolean;
    auto_suspend?: boolean;
    prevent_sleep?: boolean;
}

// Tab types
export type TabId = 'focus' | 'settings';

// ==================== Game Limits (sub-project B) ====================

export type GameLimitsMode = 'whitelist' | 'blacklist';

export interface GameLimitsGlobal {
    opens_enabled: boolean;
    opens_per_day: number;
    opens_bypass_curfew: boolean;
    time_enabled: boolean;
    time_cap_minutes: number;
    half_open_cap_minutes: number;
    curfew_enabled: boolean;
    curfew_start: string;   // "HH:MM" 24h
    curfew_end: string;     // "HH:MM" 24h
    curfew_days: string[];  // weekday names
    cooldown_enabled: boolean;
    cooldown_minutes: number;
    grace_seconds: number;
    five_min_finish_minutes: number;
    warn_thresholds_minutes: number[];
}

export type GameLimitsOverride = Partial<GameLimitsGlobal>;

export interface GameLimitsConfig {
    enabled: boolean;
    mode: GameLimitsMode;
    global: GameLimitsGlobal;
    per_game: Record<string, GameLimitsOverride>;
}

export interface GameLimitsStateEntry {
    credits_remaining: number;       // doubled int (full=2, half=1)
    time_consumed_today_sec: number;
    session_start: number | null;
    session_cap_end: number | null;
    is_half_open: boolean;
    cooldown_until: number | null;
    five_min_finish_used: boolean;
    in_grace: boolean;
    grace_until: number | null;
    time_limit_disabled_at: number | null;
    time_limit_disabled_cap_sec: number | null;
    last_reset_date: string;
}

export type GameLimitsState = Record<string, GameLimitsStateEntry>;

export type GameLaunchMode = 'full' | 'half';

export interface GameLaunchDecision {
    limited: boolean;
    blocked?: 'cooldown' | 'curfew' | 'no_credits';
    mode?: 'choose';
    appid?: string;
    app_name?: string;
}

export interface GameSessionStartedEvent {
    appid: string;
    app_name?: string;
    mode: GameLaunchMode;
    cap_end: number | null;
}

export interface GameSessionStoppedEvent {
    appid: string;
    reason: 'manual' | 'terminated' | 'cap' | 'curfew';
}

export interface GameWarningEvent {
    appid: string;
    reason: 'time_warn' | 'curfew' | 'time' | 'opens';
    grace_remaining?: number;
}

// ==================== Focus tiers (sub-project C) ====================

export type FocusTier = 'soft' | 'medium' | 'hard';

// ==================== Take-a-break (Focus, post-strip) ====================

export type AdhocBreakMinutes = 1 | 2 | 3 | 5 | 7 | 10;

// ==================== Parental controls (sub-project D) ====================

export type ParentalMode = 'self' | 'admin';

export type ParentalLockedFeature = 'game_limits' | 'focus_tier' | 'take_a_break';

export interface ParentalControls {
    enabled: boolean;
    passcode: string;   // plaintext STUB — not real auth; revisit before release
    mode: ParentalMode;
    locked_features: ParentalLockedFeature[];
}
