import { useEffect, useState, useCallback } from 'react';
import { addEventListener, removeEventListener, callable } from '@decky/api';
import type { FocusState, FocusTickEvent } from '../types';

// Backend callables
const startFocusCall = callable<[], FocusState>('start_focus_session');
const stopFocusCall = callable<[], boolean>('stop_focus_session');
const skipPhaseCall = callable<[], FocusState>('skip_focus_phase');
const getFocusStateCall = callable<[], FocusState>('get_focus_state');
const resetStatsCall = callable<[], boolean>('reset_focus_stats');
export const startAdhocBreakCall = callable<[duration_min: number], FocusState | { error: string }>('start_adhoc_break');

export function useFocus() {
    const [state, setState] = useState<FocusState>({
        active: false,
        is_break: false,
        current_session: 0,
        end_time: null,
        duration: 0,
        remaining: 0
    });
    const [loading, setLoading] = useState(true);

    // Load initial state
    const loadState = useCallback(async () => {
        try {
            const focusState = await getFocusStateCall();
            setState(focusState);
        } catch (e) {
            console.error('Failed to load Focus state:', e);
        } finally {
            setLoading(false);
        }
    }, []);

    // Start Focus
    const startFocus = useCallback(async () => {
        try {
            const newState = await startFocusCall();
            setState(newState);
        } catch (e) {
            console.error('Failed to start Focus:', e);
        }
    }, []);

    // Stop Focus
    const stopFocus = useCallback(async () => {
        try {
            await stopFocusCall();
            // Only reset countdown fields, preserve stats
            setState(prev => ({
                ...prev,
                active: false,
                is_break: false,
                current_session: 0,
                end_time: null,
                duration: 0,
                remaining: 0
            }));
        } catch (e) {
            console.error('Failed to stop Focus:', e);
        }
    }, []);

    // Skip current phase
    const skipPhase = useCallback(async () => {
        try {
            const newState = await skipPhaseCall();
            setState(newState);
        } catch (e) {
            console.error('Failed to skip phase:', e);
        }
    }, []);

    // Take an ad-hoc break (custom duration)
    const startAdhocBreak = useCallback(async (min: number) => {
        try {
            const newState = await startAdhocBreakCall(min);
            if (!('error' in newState)) setState(newState);
        } catch (e) {
            console.error('Failed to start ad-hoc break:', e);
        }
    }, []);

    // Event handlers
    useEffect(() => {
        const handleTick = (event: FocusTickEvent) => {
            setState(prev => ({
                ...prev,
                remaining: event.remaining,
                is_break: event.is_break,
                current_session: event.session,
                current_cycle: event.cycle,
                // Calculate elapsed time this phase for live stats display
                elapsed_this_phase: prev.duration > 0 ? prev.duration - event.remaining : 0
            }));
        };

        const handlePhaseChange = (newState: FocusState) => {
            setState(newState);
        };

        const handleStopped = (newState: FocusState) => {
            setState(newState);
        };

        addEventListener('timeout_focus_tick', handleTick);
        addEventListener('timeout_focus_started', handlePhaseChange);
        addEventListener('timeout_focus_phase_changed', handlePhaseChange);
        addEventListener('timeout_focus_work_ended', handlePhaseChange);
        addEventListener('timeout_focus_break_ended', handlePhaseChange);
        addEventListener('timeout_focus_stopped', handleStopped);

        // Load initial data
        loadState();

        return () => {
            removeEventListener('timeout_focus_tick', handleTick);
            removeEventListener('timeout_focus_started', handlePhaseChange);
            removeEventListener('timeout_focus_phase_changed', handlePhaseChange);
            removeEventListener('timeout_focus_work_ended', handlePhaseChange);
            removeEventListener('timeout_focus_break_ended', handlePhaseChange);
            removeEventListener('timeout_focus_stopped', handleStopped);
        };
    }, [loadState]);

    // Reset Stats
    const resetStats = useCallback(async () => {
        try {
            await resetStatsCall();
            await loadState(); // Refresh stats
        } catch (e) {
            console.error('Failed to reset stats:', e);
        }
    }, [loadState]);

    return {
        state,
        stats: state.stats,
        loading,
        isActive: state.active,
        isBreak: state.is_break,
        currentSession: state.current_session,
        currentCycle: state.current_cycle || 1,
        remaining: state.remaining || 0,
        elapsedThisPhase: state.elapsed_this_phase || 0,
        startFocus,
        stopFocus,
        skipPhase,
        startAdhocBreak,
        resetStats,
        refresh: loadState
    };
}
