import { PanelSection, PanelSectionRow, ToggleField, ButtonItem, Focusable } from "@decky/ui";
import { toaster } from "@decky/api";
import { useState } from "react";
import { FaLock, FaLockOpen, FaShieldAlt } from "react-icons/fa";
import { useParentalControls } from "../hooks/useParentalControls";
import { showUnlockModal } from "./PasscodeModal";
import type { ParentalLockedFeature } from "../types";

const FEATURES: { key: ParentalLockedFeature; label: string }[] = [
    { key: 'game_limits', label: 'Game Limits settings' },
    { key: 'focus_tier', label: 'Focus tier changes' },
    { key: 'take_a_break', label: 'Take-a-break' },
    { key: 'mindfulness', label: 'Mindfulness pause' }
];

const Wrap = ({ children }: { children: React.ReactNode }) => (
    <div style={{ padding: '16px 24px', maxHeight: 'calc(100vh - 60px)', overflowY: 'auto' }}>{children}</div>
);

export const ParentalControlsSettingsPage = () => {
    const { controls, update, lock } = useParentalControls();
    // Passcode starts empty on purpose: the backend stores only a salted
    // SHA-256 hash (D3), so there is nothing meaningful to prefill.
    const [passcode, setPasscode] = useState('');
    const [savingPasscode, setSavingPasscode] = useState(false);

    // Guarded save: an empty field is a no-op (no RPC — the backend treats
    // passcode:"" as *clear* — and no field clear); a tap while a save is in
    // flight no-ops (double-tap can't set-then-erase); the field clears only
    // after the backend confirms the new hash is stored. Backend semantics:
    // update_parental_controls returns {error} while locked, or the updated
    // block whose passcode is the freshly salted SHA-256 hash on success.
    const STORED_HASH_RE = /^[0-9a-f]{64}$/;
    const savePasscode = async () => {
        if (savingPasscode) return;
        const value = passcode;
        if (!value) return;
        setSavingPasscode(true);
        try {
            const r = await update({ passcode: value });
            if (r && STORED_HASH_RE.test(String(r.passcode ?? ''))) {
                // Clear only the text we just saved (keep any newer typing).
                setPasscode(prev => (prev === value ? '' : prev));
            } else {
                console.error('passcode save: backend did not confirm a stored hash', r);
                toaster.toast({ title: 'Timeout', body: 'Passcode failed to save — see logs' });
            }
        } finally {
            setSavingPasscode(false);
        }
    };

    const locked = controls.enabled && controls.mode === 'self';

    const toggleFeature = (key: ParentalLockedFeature, on: boolean) => {
        const next = new Set(controls.locked_features ?? []);
        if (on) next.add(key); else next.delete(key);
        update({ locked_features: Array.from(next) as ParentalLockedFeature[] });
    };

    return (
        <Wrap>
            <PanelSection>
                <PanelSectionRow>
                    <div style={{ fontSize: 12, color: '#e9a23b', background: '#3a2e00', padding: 8, borderRadius: 6 }}>
                        ⚠ Passcode is hashed (SHA-256+salt), not full account-grade auth — adequate for household use.
                    </div>
                </PanelSectionRow>
                <PanelSectionRow>
                    <ToggleField
                        icon={<FaShieldAlt size={16} />}
                        label="Enable parental controls"
                        checked={controls.enabled}
                        onChange={(v) => update({ enabled: v })}
                    />
                </PanelSectionRow>
                <PanelSectionRow>
                    <div style={{ fontSize: 13, color: '#aaa' }}>
                        Status: {controls.mode === 'admin' ? 'Admin (unlocked)' : locked ? 'Self (locked)' : 'Self (controls off)'}
                    </div>
                </PanelSectionRow>
            </PanelSection>

            <PanelSection title="Passcode">
                <PanelSectionRow>
                    <Focusable flow-children="row" style={{ display: 'flex', gap: 6, width: '100%' }}>
                        <input
                            value={passcode}
                            onChange={(e) => setPasscode(e.target.value)}
                            placeholder="Set passcode"
                            style={{ flex: 1, minWidth: 0, padding: '6px', borderRadius: 4, border: '1px solid #444', backgroundColor: '#222', color: '#fff' }}
                        />
                        <ButtonItem layout="below" onClick={savePasscode} bottomSeparator="none">Save</ButtonItem>
                    </Focusable>
                </PanelSectionRow>
            </PanelSection>

            <PanelSection title="Locked features (in Self mode)">
                {FEATURES.map((f) => (
                    <PanelSectionRow key={f.key}>
                        <ToggleField
                            label={f.label}
                            checked={(controls.locked_features ?? []).includes(f.key)}
                            onChange={(v) => toggleFeature(f.key, v)}
                        />
                    </PanelSectionRow>
                ))}
            </PanelSection>

            <PanelSection>
                <PanelSectionRow>
                    {locked ? (
                        <ButtonItem layout="below" onClick={() => showUnlockModal()}>
                            <FaLockOpen style={{ marginRight: 8 }} />Unlock (enter passcode)
                        </ButtonItem>
                    ) : (
                        <ButtonItem layout="below" onClick={() => lock()}>
                            <FaLock style={{ marginRight: 8 }} />Lock now
                        </ButtonItem>
                    )}
                </PanelSectionRow>
            </PanelSection>
        </Wrap>
    );
};
