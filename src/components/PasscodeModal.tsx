import { useState } from 'react';
import { ConfirmModal, showModal, Focusable } from "@decky/ui";
import { verifyParentalCall } from "../hooks/useParentalControls";
import { showMindfulnessPause } from "./MindfulnessPauseModal";

// Prompt for the parental passcode; on success call onUnlocked.
// NOTE: passcode compare is server-side against a salted SHA-256 hash (D3) —
// household-grade, not real auth. The typed code crosses the local RPC as-is.
export function showUnlockModal(onUnlocked?: () => void) {
    // Fire the mindfulness pause (parental_unlock trigger) before the passcode modal.
    showMindfulnessPause('parental_unlock', () => showModal(<UnlockModal onUnlocked={onUnlocked} />));
}

const UnlockModal = ({ onUnlocked, closeModal }: { onUnlocked?: () => void; closeModal?: () => void }) => {
    const [code, setCode] = useState('');
    const [err, setErr] = useState('');
    const submit = async () => {
        const ok = await verifyParentalCall(code);
        if (ok) {
            closeModal?.();
            onUnlocked?.();
        } else {
            setErr('Wrong passcode');
        }
    };
    return (
        <ConfirmModal
            strTitle="Parental controls"
            strDescription="Enter passcode to unlock."
            strOKButtonText="Unlock"
            strCancelButtonText="Cancel"
            onOK={submit}
            onCancel={() => closeModal?.()}
        >
            <Focusable>
                <input
                    value={code}
                    onChange={(e) => { setCode(e.target.value); setErr(''); }}
                    placeholder="Passcode"
                    type="password"
                    style={{ width: '100%', padding: '8px', borderRadius: 4, border: '1px solid #444', backgroundColor: '#222', color: '#fff' }}
                />
                {err && <div style={{ color: '#e55', fontSize: 12, marginTop: 6 }}>{err}</div>}
            </Focusable>
        </ConfirmModal>
    );
};
