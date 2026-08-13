import { useEffect, useState } from 'react';
import { ConfirmModal, showModal } from '@decky/ui';
import { getMindfulnessEffectiveCall } from '../hooks/useMindfulness';
import type { MindfulnessTriggerId } from '../types';

// Universal friction gate. Resolves the effective pause config for `trigger`:
//   - disabled (globally off, this trigger off, or the lookup failed) -> call onProceed
//     immediately, no modal. Never block the user on a missing/failed config.
//   - enabled -> show a ConfirmModal whose Continue button stays disabled until the
//     cooldown elapses. Continue -> onProceed; Cancel -> nothing.
// The config is resolved BEFORE showModal so there is no render-then-dismiss flash.
export function showMindfulnessPause(trigger: MindfulnessTriggerId, onProceed?: () => void) {
    getMindfulnessEffectiveCall(trigger)
        .then((cfg) => {
            if (!cfg.enabled) { onProceed?.(); return; }
            showModal(<MindfulnessPauseModal text={cfg.text} cooldown={cfg.cooldown} onProceed={onProceed} />);
        })
        .catch((e) => {
            console.error('[Timeout] mindfulness effective lookup failed:', e);
            onProceed?.();
        });
}

const MindfulnessPauseModal = ({ text, cooldown, onProceed, closeModal }: {
    text: string;
    cooldown: number;
    onProceed?: () => void;
    closeModal?: () => void;
}) => {
    const [remaining, setRemaining] = useState(Math.max(0, cooldown));

    useEffect(() => {
        if (remaining <= 0) return;
        const t = setTimeout(() => setRemaining((r) => Math.max(0, r - 1)), 1000);
        return () => clearTimeout(t);
    }, [remaining]);

    const proceed = () => { closeModal?.(); onProceed?.(); };

    return (
        <ConfirmModal
            strTitle="Mindful moment"
            strDescription={text}
            strOKButtonText={remaining > 0 ? `Continue (${remaining}s)` : 'Continue'}
            strCancelButtonText="Cancel"
            bOKDisabled={remaining > 0}
            onOK={proceed}
            onCancel={() => closeModal?.()}
        />
    );
};
