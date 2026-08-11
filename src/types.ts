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
