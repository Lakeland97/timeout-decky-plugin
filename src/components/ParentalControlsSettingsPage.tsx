import { PanelSection, PanelSectionRow, ToggleField, ButtonItem, Focusable } from "@decky/ui";
import { useState } from "react";
import { FaLock, FaLockOpen, FaShieldAlt } from "react-icons/fa";
import { useParentalControls } from "../hooks/useParentalControls";
import { showUnlockModal } from "./PasscodeModal";
import type { ParentalLockedFeature } from "../types";

const FEATURES: { key: ParentalLockedFeature; label: string }[] = [
    { key: 'game_limits', label: 'Game Limits settings' },
    { key: 'focus_tier', label: 'Focus tier changes' },
    { key: 'take_a_break', label: 'Take-a-break' }
];

const Wrap = ({ children }: { children: React.ReactNode }) => (
    <div style={{ padding: '16px 24px', maxHeight: 'calc(100vh - 60px)', overflowY: 'auto' }}>{children}</div>
);

export const ParentalControlsSettingsPage = () => {
    const { controls, update, lock } = useParentalControls();
    const [passcode, setPasscode] = useState(controls.passcode);

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
                        ⚠ Passcode is a plaintext STUB — not real authentication. Do not rely on it yet.
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
                        <ButtonItem layout="below" onClick={() => update({ passcode })} bottomSeparator="none">Save</ButtonItem>
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
