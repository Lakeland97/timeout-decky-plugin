import { useState, useEffect, useCallback } from 'react';
import { callable, addEventListener, removeEventListener } from '@decky/api';
import type { MindfulnessConfig, MindfulnessEffective, MindfulnessTriggerId } from '../types';

const DEFAULTS: MindfulnessConfig = {
    enabled: false,
    text: 'Is there something more productive I could be doing?',
    cooldown: 5,
    triggers: {
        game_launch: { enabled: true },
        parental_unlock: { enabled: true },
        focus_stop: { enabled: true },
        focus_skip: { enabled: true },
        settings_enter: { enabled: true }
    }
};

// Raw callable — used by MindfulnessPauseModal outside React hooks.
export const getMindfulnessEffectiveCall = callable<[trigger: MindfulnessTriggerId], MindfulnessEffective>('get_mindfulness_effective');

const getCall = callable<[], MindfulnessConfig>('get_mindfulness');
const updateCall = callable<[partial: Partial<MindfulnessConfig>], MindfulnessConfig | { error: string }>('update_mindfulness');

export type MindfulnessUpdate = Partial<Omit<MindfulnessConfig, 'triggers'>> & { triggers?: Record<string, { enabled: boolean }> };

// NOTE: this hook deliberately does NOT import showUnlockModal. updateMindfulness returns
// { error: 'parental_locked' } and the caller (settings page) decides whether to prompt —
// this keeps the import graph acyclic (PasscodeModal -> MindfulnessPauseModal -> useMindfulness).
export function useMindfulness() {
    const [config, setConfig] = useState<MindfulnessConfig>(DEFAULTS);

    const load = useCallback(async () => {
        try { setConfig(await getCall()); } catch (e) { console.error('[Timeout] mindfulness load:', e); }
    }, []);

    const updateMindfulness = useCallback(async (partial: MindfulnessUpdate) => {
        try {
            const r = await updateCall(partial as Partial<MindfulnessConfig>);
            if ('error' in r) return r;
            setConfig(r);
            return r;
        } catch (e) {
            console.error('[Timeout] mindfulness update:', e);
            return { error: 'exception' } as const;
        }
    }, []);

    useEffect(() => {
        const onSettings = (s: any) => { if (s?.mindfulness) setConfig(s.mindfulness); };
        addEventListener('timeout_settings_updated', onSettings);
        load();
        return () => removeEventListener('timeout_settings_updated', onSettings);
    }, [load]);

    return { config, load, updateMindfulness };
}
