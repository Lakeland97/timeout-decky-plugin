// TypeScript type definitions for Timeout plugin

// Alarm types
export type RecurringType = 'once' | 'daily' | 'weekdays' | 'weekends' | string;

export interface Alarm {
    id: string;
    hour: number;
    minute: number;
    label: string;
    recurring: RecurringType;
    enabled: boolean;
    created_at: number;
    snoozed_until: number | null;
    next_trigger?: number | null;
    sound?: string;           // filename of the sound to play
    volume?: number;          // 0-100, per-alarm volume override
    subtle_mode?: boolean;    // per-alarm subtle mode override
    auto_suspend?: boolean;   // per-alarm auto suspend override
    prevent_sleep?: boolean;  // per-alarm prevent sleep override
    prevent_sleep_window?: number; // minutes before alarm to start preventing sleep
}

// Sound file types
export interface SoundFile {
    filename: string;
    name: string;
}

// Pomodoro types
export interface PomodoroState {
    active: boolean;
    is_break: boolean;
    current_session: number;
    current_cycle?: number;
    end_time: number | null;
    duration: number;
    remaining?: number;
    elapsed_this_phase?: number;
    break_type?: 'short' | 'long';
    sound?: string;
    volume?: number;
    subtle_mode?: boolean;
    prevent_sleep?: boolean;
    stats?: PomodoroStats;
}

export interface PomodoroStats {
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
    snooze_duration: number;      // default snooze for alarms
    time_format_24h: boolean;
    // Pomodoro settings
    pomodoro_sound: string;
    pomodoro_volume: number;
    pomodoro_subtle_mode: boolean;
    pomodoro_prevent_sleep: boolean;
    pomodoro_work_duration: number;
    pomodoro_break_duration: number;
    pomodoro_long_break_duration: number;
    pomodoro_sessions_until_long_break: number;
    pomodoro_daily_goal_enabled: boolean;
    pomodoro_daily_goal: number;  // hours per day goal
    // Missed Alerts Global Settings
    missed_alerts_enabled: boolean;
    missed_alerts_window: number; // hours to look back
    // Suspend Behavior
    pomodoro_suspend_behavior?: 'continue' | 'pause';
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
    overlay_show_timers: boolean;
    overlay_show_alarms: boolean;
    overlay_show_pomodoros: boolean;
    overlay_compact_mode: boolean;
    overlay_show_prevent_sleep_badge: boolean;
    overlay_show_missed_badge: boolean;
    // Legacy Prevent Sleep settings (deprecated - now per-item)
    prevent_sleep_enabled?: boolean;
    prevent_sleep_timers?: boolean;
    prevent_sleep_pomodoro?: boolean;
    prevent_sleep_alarms?: boolean;
    prevent_sleep_alarms_window?: number;  // minutes before alarm to keep awake
    // Tab Order
    tab_order?: string[];
    // Pixel shift
    pixel_shift_enabled?: boolean;
    pixel_shift_range?: number;
    pixel_shift_interval_seconds?: number;
    // Legacy/deprecated (kept for migration)
    overlay_position_steamui?: OverlayPosition;
    overlay_pixel_shift?: boolean;
    overlay_pixel_shift_interval?: number;
    overlay_pixel_shift_range?: number;
    subtle_mode?: boolean;
    auto_suspend?: boolean;
    alarm_volume?: number;
    alarm_sound?: string;
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
    type: 'alarm' | 'timer' | 'pomodoro';
    label: string;
    due_time: number;
    missed_at: number;
    details?: string; // Richer details about what was missed
}

// Event payload types
export interface AlarmTriggeredEvent {
    id: string;
    label: string;
    subtle: boolean;
    sound?: string;
    volume?: number;
    snooze_duration?: number;
    auto_suspend?: boolean;
    time_format_24h?: boolean;
    snooze_activation_delay?: number;
}

export interface PomodoroTickEvent {
    remaining: number;
    is_break: boolean;
    session: number;
    cycle?: number;
}

export interface SnoozeEvent {
    id: string;
    snoozed_until: number;
    minutes: number;
}

// Overlay types
export type OverlayPosition = 'default' | 'custom';

export type OverlayDisplayMode = 'both' | 'steam_only' | 'gaming_only' | 'always';

export type OverlayCategory = 'timer' | 'alarm' | 'pomodoro';

export interface OverlayAlert {
    id: string;
    category: OverlayCategory;
    label: string;
    time: number;       // UNIX timestamp of trigger/end
    remaining?: number; // seconds remaining (for timers/pomodoro)
    subtle_mode?: boolean;
    auto_suspend?: boolean;
    prevent_sleep?: boolean;
}

// Tab types
export type TabId = 'timers' | 'alarms' | 'pomodoro' | 'settings';
