import { useState, useEffect } from 'react';
import { PanelSection, PanelSectionRow, ToggleField, SliderField, Focusable, ButtonItem } from "@decky/ui";
import { useMindfulness } from "../hooks/useMindfulness";
import { showUnlockModal } from "./PasscodeModal";
import type { MindfulnessTriggerId } from "../types";

const Wrap = ({ children }: { children: React.ReactNode }) => (
    <div style={{ padding: '16px 24px', maxHeight: 'calc(100vh - 60px)', overflowY: 'auto' }}>{children}</div>
);

const TRIGGERS: { id: MindfulnessTriggerId; label: string; description?: string }[] = [
    { id: 'game_launch', label: 'Game launch' },
    { id: 'parental_unlock', label: 'Parental unlock' },
    { id: 'focus_stop', label: 'Stopping a focus session' },
    { id: 'focus_skip', label: 'Taking a break during focus' },
    { id: 'settings_change', label: 'Changing limit settings', description: 'WIP — stored but not enforced yet' }
];

export const MindfulnessSettingsPage = () => {
    const { config, updateMindfulness } = useMindfulness();
    const [text, setText] = useState(config.text);

    // Sync local text when the async config load completes.
    useEffect(() => { setText(config.text); }, [config.text]);

    const apply = async (partial: Parameters<typeof updateMindfulness>[0]) => {
        const r = await updateMindfulness(partial);
        if ('error' in r && r.error === 'parental_locked') showUnlockModal();
    };

    const toggleTrigger = (id: MindfulnessTriggerId, on: boolean) => {
        apply({ triggers: { [id]: { enabled: on } } });
    };

    return (
        <Wrap>
            <PanelSection title="Mindfulness pause">
                <PanelSectionRow>
                    <div style={{ fontSize: 12, color: '#aaa' }}>
                        Show a pause with a custom prompt and a cooldown countdown before distractions or limit bypasses.
                    </div>
                </PanelSectionRow>
                <PanelSectionRow>
                    <ToggleField
                        label="Enable mindfulness pause"
                        checked={config.enabled}
                        onChange={(v) => apply({ enabled: v })}
                    />
                </PanelSectionRow>
                {config.enabled && (
                    <>
                        <PanelSectionRow>
                            <Focusable flow-children="row" style={{ display: 'flex', gap: 6, width: '100%' }}>
                                <input
                                    value={text}
                                    onChange={(e) => setText(e.target.value)}
                                    placeholder="Prompt text"
                                    style={{ flex: 1, minWidth: 0, padding: '8px', borderRadius: 4, border: '1px solid #444', backgroundColor: '#222', color: '#fff' }}
                                />
                                <ButtonItem layout="below" onClick={() => apply({ text })} bottomSeparator="none">Save</ButtonItem>
                            </Focusable>
                        </PanelSectionRow>
                        <PanelSectionRow>
                            <SliderField
                                label="Cooldown"
                                description={`${config.cooldown} s before Continue enables`}
                                value={config.cooldown}
                                min={1} max={30} step={1}
                                onChange={(v) => apply({ cooldown: v })}
                            />
                        </PanelSectionRow>
                    </>
                )}
            </PanelSection>

            <PanelSection title="Triggers">
                <PanelSectionRow>
                    <div style={{ fontSize: 12, color: '#aaa' }}>
                        Toggle which actions fire the pause. The prompt and cooldown above apply to all enabled triggers.
                    </div>
                </PanelSectionRow>
                {TRIGGERS.map((tr) => (
                    <PanelSectionRow key={tr.id}>
                        <ToggleField
                            label={tr.label}
                            description={tr.description}
                            checked={!!(config.triggers?.[tr.id]?.enabled)}
                            onChange={(v) => toggleTrigger(tr.id, v)}
                        />
                    </PanelSectionRow>
                ))}
            </PanelSection>
        </Wrap>
    );
};
