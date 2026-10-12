import { useEffect, useState, useCallback } from 'react';
import { addEventListener, removeEventListener, callable } from '@decky/api';
import type { GameLimitsConfig, GameLimitsGlobal, GameLimitsOverride, GameLimitsMode, GameLimitsState, GameLaunchDecision, GameLaunchMode } from '../types';
import { showUnlockModal } from '../components/PasscodeModal';

// Nested-partial update shape (backend deep-merges 'global' and replaces 'per_game')
export type GameLimitsConfigUpdate = {
    enabled?: boolean;
    mode?: GameLimitsMode;
    global?: Partial<GameLimitsGlobal>;
    per_game?: Record<string, GameLimitsOverride>;
};

// Raw callables (used by the index.tsx game listener + modals, which live outside React hooks)
export const reportGameStarted = callable<[app_id: string, app_name: string, decision?: 'cancel'], GameLaunchDecision>('report_game_session_started');
export const reportGameStopped = callable<[app_id: string], boolean>('report_game_session_stopped');
export const chooseLaunch = callable<[app_id: string, choice: GameLaunchMode], { appid: string; mode: GameLaunchMode; cap_end: number | null } | { error: string }>('choose_launch');
export const useFiveMinFinish = callable<[app_id: string], boolean>('use_five_min_finish');
export const getInstalledGames = callable<[], { appid: string; name: string }[]>('get_installed_games');

// Hook-only callables
const getConfigCall = callable<[], GameLimitsConfig>('get_game_limits_config');
const updateConfigCall = callable<[partial: GameLimitsConfigUpdate], GameLimitsConfig | { error: string }>('update_game_limits_config');
const getStateCall = callable<[], GameLimitsState>('get_game_limits_state');
const resetStreakCall = callable<[], boolean>('reset_game_limits_streak');

export function useGameLimits() {
    const [config, setConfig] = useState<GameLimitsConfig | null>(null);
    const [state, setState] = useState<GameLimitsState>({});
    const [streak, setStreak] = useState<{ current: number; longest: number }>({ current: 0, longest: 0 });

    const load = useCallback(async () => {
        try {
            const [cfg, st] = await Promise.all([getConfigCall(), getStateCall()]);
            setConfig(cfg);
            setState(st);
        } catch (e) {
            console.error('[Timeout] Game Limits load failed:', e);
        }
    }, []);

    useEffect(() => {
        load();
        const onSettings = () => { getConfigCall().then(setConfig).catch(() => {}); };
        const onState = (s: GameLimitsState) => setState(s);
        const onStreak = (s: { current: number; longest: number }) => setStreak(s);
        addEventListener('timeout_settings_updated', onSettings);
        addEventListener('timeout_game_state', onState);
        addEventListener('timeout_game_streak', onStreak);
        return () => {
            removeEventListener('timeout_settings_updated', onSettings);
            removeEventListener('timeout_game_state', onState);
            removeEventListener('timeout_game_streak', onStreak);
        };
    }, [load]);

    const updateConfig = useCallback(async (partial: GameLimitsConfigUpdate) => {
        const cfg = await updateConfigCall(partial);
        if ('error' in cfg) {
            if (cfg.error === 'parental_locked') showUnlockModal();
            return cfg;
        }
        setConfig(cfg);
        return cfg;
    }, []);

    const resetStreak = useCallback(async () => {
        await resetStreakCall();
        await load();
    }, [load]);

    return {
        config, state, streak, load, updateConfig, resetStreak,
        getInstalledGames
    };
}
