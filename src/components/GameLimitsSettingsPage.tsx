import {
    Dropdown,
    Focusable,
    PanelSection,
    PanelSectionRow,
    SliderField,
    TextField,
    ToggleField,
    ButtonItem
} from "@decky/ui";
import { FaGamepad, FaPlus, FaTrash, FaClock } from "react-icons/fa";
import { useEffect, useState } from "react";
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

// Weekday keys must match the backend's datetime.now().strftime("%a")
// comparison in _now_in_curfew (main.py) — "Mon".."Sun".
const WEEK_DAYS = [
    { key: 'Mon', label: 'Monday' },
    { key: 'Tue', label: 'Tuesday' },
    { key: 'Wed', label: 'Wednesday' },
    { key: 'Thu', label: 'Thursday' },
    { key: 'Fri', label: 'Friday' },
    { key: 'Sat', label: 'Saturday' },
    { key: 'Sun', label: 'Sunday' }
];
const ALL_WEEK_DAYS = WEEK_DAYS.map((d) => d.key);

export const GameLimitsSettingsPage = () => {
    const { config, state, streak, updateConfig, resetStreak, getInstalledGames } = useGameLimits();
    const [newAppId, setNewAppId] = useState('');
    const [newAppName, setNewAppName] = useState('');
    const [installedGames, setInstalledGames] = useState<{ appid: string; name: string }[] | null>(null);
    const [gamesStatus, setGamesStatus] = useState<'loading' | 'ready' | 'error'>('loading');
    const [gamesQuery, setGamesQuery] = useState('');
    const [gamesReload, setGamesReload] = useState(0);

    // Load the installed-games picker once on mount; the counter re-runs it for Retry.
    useEffect(() => {
        let cancelled = false;
        setGamesStatus('loading');
        (async () => {
            try {
                const games = await getInstalledGames();
                if (cancelled) return;
                setInstalledGames(Array.isArray(games) ? games : []);
                setGamesStatus('ready');
            } catch (e) {
                console.error('[Timeout] get_installed_games failed:', e);
                if (!cancelled) setGamesStatus('error');
            }
        })();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [gamesReload]);

    if (!config) {
        return <Wrap><div style={{ color: '#888' }}>Loading…</div></Wrap>;
    }

    const g = config.global;
    const setG = (patch: Partial<typeof g>) => updateConfig({ global: patch });

    // Warn thresholds are persisted as a 2-element list [before-cap, at-cap]
    // (default [5, 1]); guard the shape in case an older config predates it.
    const thresholds = Array.isArray(g.warn_thresholds_minutes) ? g.warn_thresholds_minutes : [5, 1];
    const warnBefore = typeof thresholds[0] === 'number' ? thresholds[0] : 5;
    const warnAt = typeof thresholds[1] === 'number' ? thresholds[1] : 1;

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
    // Picker "Add": create the per-game override entry with empty (default) overrides.
    const addAppId = (id: string) => {
        updateConfig({ per_game: { ...config.per_game, [id]: {} } });
    };

    // Day mask; missing/older configs default to all seven days.
    const curfewDays = Array.isArray(g.curfew_days) ? g.curfew_days : ALL_WEEK_DAYS;

    // Installed-games search filter (name or AppID, case-insensitive).
    const query = gamesQuery.trim().toLowerCase();
    const filteredGames = (installedGames ?? [])
        .filter((game) => !query || game.name.toLowerCase().includes(query) || game.appid.includes(query))
        .sort((a, b) => a.name.localeCompare(b.name));

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
                        <PanelSectionRow>
                            <ToggleField
                                label="Active window (relaxes outside)"
                                description="Only spend the opens budget during these hours"
                                checked={g.opens_window_enabled}
                                onChange={(v) => setG({ opens_window_enabled: v })}
                            />
                        </PanelSectionRow>
                        {g.opens_window_enabled && (
                            <>
                                <PanelSectionRow>
                                    <SliderField
                                        label="Window starts at"
                                        description={hourToHHMM(hhmmToHour(g.opens_window_start))}
                                        value={hhmmToHour(g.opens_window_start)}
                                        min={0} max={23} step={1}
                                        onChange={(v) => setG({ opens_window_start: hourToHHMM(v) })}
                                    />
                                </PanelSectionRow>
                                <PanelSectionRow>
                                    <SliderField
                                        label="Window ends at"
                                        description={hourToHHMM(hhmmToHour(g.opens_window_end))}
                                        value={hhmmToHour(g.opens_window_end)}
                                        min={0} max={23} step={1}
                                        onChange={(v) => setG({ opens_window_end: hourToHHMM(v) })}
                                    />
                                </PanelSectionRow>
                            </>
                        )}
                    </>
                )}
            </PanelSection>

            <PanelSection title="Session time cap">
                <PanelSectionRow>
                    <ToggleField label="Limit session length" checked={g.time_enabled} onChange={(v) => setG({ time_enabled: v })} />
                </PanelSectionRow>
                {g.time_enabled && (
                    <>
                        <PanelSectionRow>
                            <SliderField
                                label="Full-session cap"
                                description={`${g.time_cap_minutes} min (half = ${g.half_open_cap_minutes} min)`}
                                value={g.time_cap_minutes}
                                min={5} max={180} step={5}
                                onChange={(v) => setG({ time_cap_minutes: v, half_open_cap_minutes: Math.max(1, Math.round(v / 2)) })}
                            />
                        </PanelSectionRow>
                        <PanelSectionRow>
                            <SliderField
                                label="Warn before cap"
                                description={`${warnBefore} min remaining`}
                                value={warnBefore}
                                min={0} max={30} step={1}
                                onChange={(v) => setG({ warn_thresholds_minutes: [v, warnAt] })}
                            />
                        </PanelSectionRow>
                        <PanelSectionRow>
                            <SliderField
                                label="Warn at cap"
                                description={`${warnAt} min remaining`}
                                value={warnAt}
                                min={1} max={10} step={1}
                                onChange={(v) => setG({ warn_thresholds_minutes: [warnBefore, v] })}
                            />
                        </PanelSectionRow>
                        <PanelSectionRow>
                            <ToggleField
                                label="Active window (relaxes outside)"
                                description="Only enforce the session cap during these hours"
                                checked={g.time_window_enabled}
                                onChange={(v) => setG({ time_window_enabled: v })}
                            />
                        </PanelSectionRow>
                        {g.time_window_enabled && (
                            <>
                                <PanelSectionRow>
                                    <SliderField
                                        label="Window starts at"
                                        description={hourToHHMM(hhmmToHour(g.time_window_start))}
                                        value={hhmmToHour(g.time_window_start)}
                                        min={0} max={23} step={1}
                                        onChange={(v) => setG({ time_window_start: hourToHHMM(v) })}
                                    />
                                </PanelSectionRow>
                                <PanelSectionRow>
                                    <SliderField
                                        label="Window ends at"
                                        description={hourToHHMM(hhmmToHour(g.time_window_end))}
                                        value={hhmmToHour(g.time_window_end)}
                                        min={0} max={23} step={1}
                                        onChange={(v) => setG({ time_window_end: hourToHHMM(v) })}
                                    />
                                </PanelSectionRow>
                            </>
                        )}
                    </>
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
                        <PanelSectionRow>
                            <div style={{ width: '100%' }}>
                                <div style={{ fontSize: 13, color: '#aaa', marginBottom: 4 }}>Active days</div>
                                <Focusable flow-children="row" style={{ display: 'flex', flexWrap: 'wrap', gap: '0 12px' }}>
                                    {WEEK_DAYS.map((day) => (
                                        <div key={day.key} style={{ minWidth: 140 }}>
                                            <ToggleField
                                                label={day.label}
                                                checked={curfewDays.includes(day.key)}
                                                onChange={(v) => setG({
                                                    curfew_days: v
                                                        ? [...curfewDays, day.key]
                                                        : curfewDays.filter((d) => d !== day.key)
                                                })}
                                            />
                                        </div>
                                    ))}
                                </Focusable>
                                {curfewDays.length === 0 && (
                                    <div style={{ fontSize: 12, color: '#e69900', marginTop: 4 }}>
                                        No days selected — the curfew applies every day.
                                    </div>
                                )}
                            </div>
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
                    <TextField
                        label="Search installed games"
                        value={gamesQuery}
                        onChange={(e) => setGamesQuery(e.target.value)}
                    />
                </PanelSectionRow>
                {gamesStatus === 'loading' && (
                    <PanelSectionRow>
                        <div style={{ color: '#888', fontSize: 13 }}>Loading installed games…</div>
                    </PanelSectionRow>
                )}
                {gamesStatus === 'error' && (
                    <PanelSectionRow>
                        <Focusable flow-children="row" style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
                            <span style={{ color: '#ff6666', fontSize: 13, flex: 1 }}>Couldn't load installed games.</span>
                            <ButtonItem layout="below" onClick={() => setGamesReload((n) => n + 1)} bottomSeparator="none">
                                Retry
                            </ButtonItem>
                        </Focusable>
                    </PanelSectionRow>
                )}
                {gamesStatus === 'ready' && filteredGames.length === 0 && (
                    <PanelSectionRow>
                        <div style={{ color: '#888', fontSize: 13 }}>
                            {(installedGames ?? []).length > 0 ? 'No games match your search.' : 'No installed games found.'}
                        </div>
                    </PanelSectionRow>
                )}
                {gamesStatus === 'ready' && filteredGames.length > 0 && (
                    <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                        {filteredGames.map((game) => {
                            const added = Object.prototype.hasOwnProperty.call(config.per_game, game.appid);
                            return (
                                <PanelSectionRow key={game.appid}>
                                    <Focusable flow-children="row" style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
                                        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {game.name}
                                        </span>
                                        <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#888', flexShrink: 0 }}>
                                            {game.appid}
                                        </span>
                                        {added ? (
                                            <ButtonItem layout="below" onClick={() => removeApp(game.appid)} bottomSeparator="none">
                                                <FaTrash /> Remove
                                            </ButtonItem>
                                        ) : (
                                            <ButtonItem layout="below" onClick={() => addAppId(game.appid)} bottomSeparator="none">
                                                <FaPlus /> Add
                                            </ButtonItem>
                                        )}
                                    </Focusable>
                                </PanelSectionRow>
                            );
                        })}
                    </div>
                )}
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
