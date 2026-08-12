import { useState } from 'react';
import { ConfirmModal, showModal, Focusable } from "@decky/ui";
import { verifyParentalCall } from "../hooks/useParentalControls";

// Prompt for the parental passcode; on success call onUnlocked.
// NOTE: passcode compare is a plaintext STUB — not real auth.
export function showUnlockModal(onUnlocked?: () => void) {
    showModal(<UnlockModal onUnlocked={onUnlocked} />);
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
