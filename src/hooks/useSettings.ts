import { useEffect, useState, useCallback } from 'react';
import { addEventListener, removeEventListener, callable } from '@decky/api';
import type { UserSettings } from '../types';

// Backend callables
const getSettingsCall = callable<[], UserSettings>('get_settings');
const updateSettingsCall = callable<[settings: Partial<UserSettings>], UserSettings>('update_settings');

const DEFAULT_SETTINGS: UserSettings = {
    time_format_24h: true,
    // Focus settings
    focus_sound: 'alarm.mp3',
    focus_volume: 100,
    focus_subtle_mode: false,
    focus_prevent_sleep: false,
    focus_work_duration: 25,
    focus_break_duration: 5,
    focus_long_break_duration: 15,
    focus_sessions_until_long_break: 4,
    focus_daily_goal_enabled: false,
    focus_daily_goal: 4,  // 4 hours default
    // Missed Alerts settings
    missed_alerts_enabled: true,
    missed_alerts_window: 24,
    // Pixel shift for OLED burn-in prevention
    pixel_shift_enabled: true,
    pixel_shift_range: 3,
    pixel_shift_interval_seconds: 60,
    // Suspend Behavior
    focus_suspend_behavior: 'continue', // 'continue' = missed session, 'pause' = shift session
    // Display settings
    snooze_activation_delay: 2.0,
    // Overlay settings
    overlay_enabled: false,
    overlay_display_mode: 'both' as const,
    overlay_position: 'default' as const,
    overlay_custom_x: 10,
    overlay_custom_y: 12,
    overlay_text_size: 13,
    overlay_opacity: 0.4,
    overlay_max_alerts: 2,
    overlay_time_window: 1,
    overlay_show_focus: true,
    overlay_compact_mode: false,
    overlay_show_prevent_sleep_badge: true,
    overlay_show_missed_badge: true,
    // Tab Order
    tab_order: ["focus"],
    // Prevent Sleep settings
    prevent_sleep_enabled: false,
    prevent_sleep_timers: true,
};

export function useSettings() {
    const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
    const [loading, setLoading] = useState(true);

    // Load initial settings
    const loadData = useCallback(async () => {
        try {
            const userSettings = await getSettingsCall();
            setSettings(userSettings);
        } catch (e) {
            console.error('Failed to load settings:', e);
        } finally {
            setLoading(false);
        }
    }, []);

    // Update a single setting
    const updateSetting = useCallback(async <K extends keyof UserSettings>(
        key: K,
        value: UserSettings[K]
    ) => {
        try {
            const updatedSettings = await updateSettingsCall({ [key]: value });
            setSettings(updatedSettings);
        } catch (e) {
            console.error('Failed to update setting:', e);
        }
    }, []);

    // Update multiple settings
    const updateSettings = useCallback(async (newSettings: Partial<UserSettings>) => {
        try {
            const updatedSettings = await updateSettingsCall(newSettings);
            setSettings(updatedSettings);
        } catch (e) {
            console.error('Failed to update settings:', e);
        }
    }, []);

    // Event handlers
    useEffect(() => {
        const handleSettingsUpdated = (updatedSettings: UserSettings) => {
            setSettings(updatedSettings);
        };

        addEventListener('timeout_settings_updated', handleSettingsUpdated);

        // Load initial data
        loadData();

        return () => {
            removeEventListener('timeout_settings_updated', handleSettingsUpdated);
        };
    }, [loadData]);

    return {
        settings,
        loading,
        updateSetting,
        updateSettings,
        refresh: loadData
    };
}
