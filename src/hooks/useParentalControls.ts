import { useState, useEffect, useCallback } from 'react';
import { callable, addEventListener, removeEventListener } from '@decky/api';
import type { ParentalControls, ParentalLockedFeature } from '../types';

const DEFAULTS: ParentalControls = {
    enabled: false,
    passcode: '',
    mode: 'self',
    locked_features: ['game_limits', 'focus_tier', 'take_a_break']
};

export const getParentalCall = callable<[], ParentalControls>('get_parental_controls');
export const updateParentalCall = callable<[partial: Partial<ParentalControls>], ParentalControls | { error: string }>('update_parental_controls');
export const verifyParentalCall = callable<[code: string], { ok: boolean; controls?: ParentalControls }>('verify_parental_passcode');
export const lockParentalCall = callable<[], boolean>('lock_parental');

export function useParentalControls() {
    const [controls, setControls] = useState<ParentalControls>(DEFAULTS);

    const load = useCallback(async () => {
        try { setControls(await getParentalCall()); } catch (e) { console.error('parental load:', e); }
    }, []);

    const update = useCallback(async (partial: Partial<ParentalControls>) => {
        try {
            const r = await updateParentalCall(partial);
            if (!('error' in r)) setControls(r);
        } catch (e) { console.error('parental update:', e); }
    }, []);

    const verify = useCallback(async (code: string) => {
        try {
            const r = await verifyParentalCall(code);
            if (r.ok && r.controls) setControls(r.controls);
            return r.ok;
        } catch (e) { console.error('parental verify:', e); return false; }
    }, []);

    const lock = useCallback(async () => {
        try {
            await lockParentalCall();
            setControls(c => ({ ...c, mode: 'self' }));
        } catch (e) { console.error('parental lock:', e); }
    }, []);

    useEffect(() => {
        const onSettings = (s: any) => { if (s?.parental_controls) setControls(s.parental_controls); };
        addEventListener('timeout_settings_updated', onSettings);
        load();
        return () => removeEventListener('timeout_settings_updated', onSettings);
    }, [load]);

    const isLocked = useCallback((feature: ParentalLockedFeature) =>
        controls.enabled && controls.mode === 'self' && (controls.locked_features ?? []).includes(feature),
        [controls]);

    return { controls, isLocked, load, update, verify, lock };
}
