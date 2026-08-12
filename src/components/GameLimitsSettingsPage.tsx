import {
    Dropdown,
    Focusable,
    PanelSection,
    PanelSectionRow,
    SliderField,
    ToggleField,
    ButtonItem
} from "@decky/ui";
import { toaster } from "@decky/api";
import { FaGamepad, FaPlus, FaTrash, FaClock } from "react-icons/fa";
import { useState } from "react";
import { useGameLimits } from "../hooks/useGameLimits";
import type { GameLimitsMode } from "../types";

const Wrap = ({ children }: { children: React.ReactNode }) => (
    <div style={{ padding: '16px 24px', maxHeight: 'calc(100vh - 60px)', overflowY: 'auto' }}>
        {children}
    </div>
);

const hourToHHMM = (h: number) => `${String(h).padStart(2, '0')}:00`;
const hhmmToHour = (s: string): number => {
    const m = /^(\d{1,2}):/.exec(s);
    return m ? Math.min(23, Math.max(0, parseInt(m[1], 10))) : 0;
};

export const GameLimitsSettingsPage = () => {
    const { config, state, streak, updateConfig, resetStreak, getInstalledGames } = useGameLimits();
    const [newAppId, setNewAppId] = useState('');
    const [newAppName, setNewAppName] = useState('');

    if (!config) {
        return <Wrap><div style={{ color: '#888' }}>Loading…</div></Wrap>;
    }

    const g = config.global;
    const setG = (patch: Partial<typeof g>) => updateConfig({ global: patch });

    const addApp = () => {
        const id = newAppId.trim();
        if (!id) return;
        updateConfig({ per_game: { ...config.per_game, [id]: {} } });
        setNewAppId('');
        setNewAppName('');
    };
    const removeApp = (id: string) => {
        const next = { ...config.per_game };
        delete next[id];
        updateConfig({ per_game: next });
    };

    const listLabel = config.mode === 'whitelist' ? 'Limited games (AppIDs)' : 'Exempt games (AppIDs)';

    return (
        <Wrap>
            <PanelSection>
                <PanelSectionRow>
                    <ToggleField
                        icon={<FaGamepad size={16} />}
                        label="Enable Game Limits"
                        description="Enforce opens / time / curfew on games"
                        checked={config.enabled}
                        onChange={(v) => updateConfig({ enabled: v })}
                    />
                </PanelSectionRow>

                <PanelSectionRow>
                    <Focusable flow-children="row" style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
                        <span style={{ flexShrink: 0 }}>Mode</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <Dropdown
                                rgOptions={[
                                    { data: 'blacklist', label: 'Blacklist — all limited except listed' },
                                    { data: 'whitelist', label: 'Whitelist — only listed are limited' }
                                ]}
                                selectedOption={config.mode}
                                onChange={(o) => updateConfig({ mode: o.data as GameLimitsMode })}
                                strDefaultLabel="Mode"
                            />
                        </div>
                    </Focusable>
                </PanelSectionRow>
            </PanelSection>

            <PanelSection title="Opens (daily launch budget)">
                <PanelSectionRow>
                    <ToggleField label="Limit daily opens" checked={g.opens_enabled} onChange={(v) => setG({ opens_enabled: v })} />
                </PanelSectionRow>
                {g.opens_enabled && (
                    <>
                        <PanelSectionRow>
                            <SliderField
                                label="Opens per day"
                                description={`${g.opens_per_day} opens`}
                                value={g.opens_per_day}
                                min={1} max={20} step={1}
                                onChange={(v) => setG({ opens_per_day: v })}
                            />
                        </PanelSectionRow>
                        <PanelSectionRow>
                            <ToggleField
                                label="Opens bypass curfew"
                                description="Let an open spend through the curfew window"
                                checked={g.opens_bypass_curfew}
                                onChange={(v) => setG({ opens_bypass_curfew: v })}
                            />
                        </PanelSectionRow>
                    </>
                )}
            </PanelSection>

            <PanelSection title="Session time cap">
                <PanelSectionRow>
                    <ToggleField label="Limit session length" checked={g.time_enabled} onChange={(v) => setG({ time_enabled: v })} />
                </PanelSectionRow>
                {g.time_enabled && (
                    <PanelSectionRow>
                        <SliderField
                            label="Full-session cap"
                            description={`${g.time_cap_minutes} min (half = ${g.half_open_cap_minutes} min)`}
                            value={g.time_cap_minutes}
                            min={5} max={180} step={5}
                            onChange={(v) => setG({ time_cap_minutes: v, half_open_cap_minutes: Math.max(1, Math.round(v / 2)) })}
                        />
                    </PanelSectionRow>
                )}
            </PanelSection>

            <PanelSection title="Curfew (time-of-day block)">
                <PanelSectionRow>
                    <ToggleField
                        icon={<FaClock size={16} />}
                        label="Enable curfew"
                        checked={g.curfew_enabled}
                        onChange={(v) => setG({ curfew_enabled: v })}
                    />
                </PanelSectionRow>
                {g.curfew_enabled && (
                    <>
                        <PanelSectionRow>
                            <SliderField
                                label="Curfew starts at"
                                description={hourToHHMM(hhmmToHour(g.curfew_start))}
                                value={hhmmToHour(g.curfew_start)}
                                min={0} max={23} step={1}
                                onChange={(v) => setG({ curfew_start: hourToHHMM(v) })}
                            />
                        </PanelSectionRow>
                        <PanelSectionRow>
                            <SliderField
                                label="Curfew ends at"
                                description={hourToHHMM(hhmmToHour(g.curfew_end))}
                                value={hhmmToHour(g.curfew_end)}
                                min={0} max={23} step={1}
                                onChange={(v) => setG({ curfew_end: hourToHHMM(v) })}
                            />
                        </PanelSectionRow>
                    </>
                )}
            </PanelSection>

            <PanelSection title="Enforcement">
                <PanelSectionRow>
                    <ToggleField label="Cooldown between sessions" checked={g.cooldown_enabled} onChange={(v) => setG({ cooldown_enabled: v })} />
                </PanelSectionRow>
                {g.cooldown_enabled && (
                    <PanelSectionRow>
                        <SliderField
                            label="Cooldown"
                            description={`${g.cooldown_minutes} min`}
                            value={g.cooldown_minutes}
                            min={1} max={120} step={1}
                            onChange={(v) => setG({ cooldown_minutes: v })}
                        />
                    </PanelSectionRow>
                )}
                <PanelSectionRow>
                    <SliderField
                        label="Warn→kill grace"
                        description={`${g.grace_seconds} s`}
                        value={g.grace_seconds}
                        min={10} max={300} step={10}
                        onChange={(v) => setG({ grace_seconds: v })}
                    />
                </PanelSectionRow>
                <PanelSectionRow>
                    <SliderField
                        label="5-min finish (once/day)"
                        description={`${g.five_min_finish_minutes} min`}
                        value={g.five_min_finish_minutes}
                        min={1} max={15} step={1}
                        onChange={(v) => setG({ five_min_finish_minutes: v })}
                    />
                </PanelSectionRow>
            </PanelSection>

            <PanelSection title={listLabel}>
                <PanelSectionRow>
                    <Focusable flow-children="row" style={{ display: 'flex', gap: 6, width: '100%' }}>
                        <input
                            value={newAppId}
                            onChange={(e) => setNewAppId(e.target.value)}
                            placeholder="AppID"
                            style={{ flex: '0 0 90px', padding: '6px', borderRadius: 4, border: '1px solid #444', backgroundColor: '#222', color: '#fff' }}
                        />
                        <input
                            value={newAppName}
                            onChange={(e) => setNewAppName(e.target.value)}
                            placeholder="Name (optional)"
                            style={{ flex: 1, minWidth: 0, padding: '6px', borderRadius: 4, border: '1px solid #444', backgroundColor: '#222', color: '#fff' }}
                        />
                        <ButtonItem layout="below" onClick={addApp} bottomSeparator="none">
                            <FaPlus /> Add
                        </ButtonItem>
                    </Focusable>
                </PanelSectionRow>
                <PanelSectionRow>
                    <ButtonItem layout="below" onClick={async () => {
                        try {
                            const games = await getInstalledGames();
                            toaster.toast({ title: 'Game Limits', body: `${games.length} installed games found.` });
                        } catch (e) { console.error(e); }
                    }} bottomSeparator="none">
                        Load installed games
                    </ButtonItem>
                </PanelSectionRow>
                {Object.keys(config.per_game).map((id) => (
                    <PanelSectionRow key={id}>
                        <Focusable flow-children="row" style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
                            <span style={{ flex: 1 }}>{id}</span>
                            <ButtonItem layout="below" onClick={() => removeApp(id)} bottomSeparator="none">
                                <FaTrash /> Remove
                            </ButtonItem>
                        </Focusable>
                    </PanelSectionRow>
                ))}
            </PanelSection>

            <PanelSection title="Streak">
                <PanelSectionRow>
                    <div style={{ fontSize: 13, color: '#aaa' }}>
                        Current: <strong>{streak.current}</strong> · Longest: <strong>{streak.longest}</strong>
                        {' '}({Object.keys(state).length} tracked)
                    </div>
                </PanelSectionRow>
                <PanelSectionRow>
                    <ButtonItem layout="below" onClick={resetStreak} bottomSeparator="none">
                        Reset streak
                    </ButtonItem>
                </PanelSectionRow>
            </PanelSection>
        </Wrap>
    );
};
