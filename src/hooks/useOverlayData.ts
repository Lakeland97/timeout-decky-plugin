import { useEffect, useState, useCallback, useRef } from 'react';
import { addEventListener, removeEventListener, callable } from '@decky/api';
import type { OverlayAlert, UserSettings, FocusTickEvent } from '../types';

// Backend callable
const getOverlayDataCall = callable<[], { alerts: OverlayAlert[]; settings: Record<string, any> }>('get_overlay_data');

export function useOverlayData(settings: UserSettings, isGameRunning?: boolean) {
    const [alerts, setAlerts] = useState<OverlayAlert[]>([]);
    const alertsRef = useRef<OverlayAlert[]>([]);

    // Fetch full overlay data from backend
    const fetchOverlayData = useCallback(async () => {
        if (!settings.overlay_enabled) {
            setAlerts([]);
            alertsRef.current = [];
            return;
        }
        try {
            const data = await getOverlayDataCall();
            if (data && data.alerts) {
                setAlerts(data.alerts);
                alertsRef.current = data.alerts;
            }
        } catch (e) {
            console.error('[Timeout Overlay] Failed to fetch overlay data:', e);
        }
    }, [settings.overlay_enabled]);

    useEffect(() => {
        if (!settings.overlay_enabled) {
            setAlerts([]);
            alertsRef.current = [];
            return;
        }

        // Initial fetch
        fetchOverlayData();

        // Re-fetch when data sources change
        const handleFocusStarted = () => fetchOverlayData();
        const handleFocusStopped = () => fetchOverlayData();
        const handleFocusPhaseChanged = () => fetchOverlayData();

        // Real-time tick updates for focus
        const handleFocusTick = (event: FocusTickEvent) => {
            setAlerts(prev => prev.map(alert =>
                alert.category === 'focus'
                    ? {
                        ...alert,
                        remaining: event.remaining,
                        label: `${event.is_break ? 'Break' : 'Focus'} #${event.session}`
                    }
                    : alert
            ));
        };

        addEventListener('timeout_focus_started', handleFocusStarted);
        addEventListener('timeout_focus_stopped', handleFocusStopped);
        addEventListener('timeout_focus_phase_changed', handleFocusPhaseChanged);
        addEventListener('timeout_focus_tick', handleFocusTick);

        // Periodic refresh (every 30s)
        const refreshInterval = setInterval(fetchOverlayData, 30000);

        return () => {
            removeEventListener('timeout_focus_started', handleFocusStarted);
            removeEventListener('timeout_focus_stopped', handleFocusStopped);
            removeEventListener('timeout_focus_phase_changed', handleFocusPhaseChanged);
            removeEventListener('timeout_focus_tick', handleFocusTick);
            clearInterval(refreshInterval);
        };
    }, [settings.overlay_enabled, fetchOverlayData]);

    // Re-fetch when category filters or time window change
    useEffect(() => {
        if (settings.overlay_enabled) {
            fetchOverlayData();
        }
    }, [
        settings.overlay_display_mode,
        settings.overlay_position,
        settings.overlay_custom_x,
        settings.overlay_custom_y,
        settings.overlay_show_focus,
        settings.overlay_time_window,
        settings.overlay_max_alerts,
        isGameRunning,
        fetchOverlayData
    ]);

    return alerts;
}
