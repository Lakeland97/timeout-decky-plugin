import {
    ButtonItem,
    Focusable,
    PanelSection,
    PanelSectionRow,
    ProgressBarWithInfo,
    ToggleField
} from "@decky/ui";
import { FaPlay, FaStop, FaForward, FaCoffee, FaBrain } from "react-icons/fa";
import { useFocus } from "../hooks/useFocus";
import { useSettings } from "../hooks/useSettings";
import { formatDuration } from "../utils/time";
import { FocusStatsPanel } from "./FocusStatsPanel";


export function FocusPanel() {
    const {
        isActive,
        isBreak,
        currentSession,
        currentCycle,
        remaining,
        elapsedThisPhase,
        startFocus,
        stopFocus,
        skipPhase,
        resetStats,
        stats
    } = useFocus();
    const { settings, updateSetting } = useSettings();

    const workDuration = settings.focus_work_duration * 60;
    const breakDuration = settings.focus_break_duration * 60;
    const longBreakDuration = settings.focus_long_break_duration * 60;
    const sessionsUntilLong = settings.focus_sessions_until_long_break;

    const getCurrentPhaseDuration = () => {
        if (!isActive) return workDuration;
        if (isBreak) {
            return currentSession % sessionsUntilLong === 0 ? longBreakDuration : breakDuration;
        }
        return workDuration;
    };

    const progress = isActive
        ? ((getCurrentPhaseDuration() - remaining) / getCurrentPhaseDuration()) * 100
        : 0;

    const getPhaseLabel = () => {
        if (!isActive) return "Ready to focus";
        if (isBreak) {
            return currentSession % sessionsUntilLong === 0 ? "Long Break" : "Short Break";
        }
        return "Focus Time";
    };

    const isLongBreakNext = currentSession % sessionsUntilLong === 0;

    return (
        <div>
            <PanelSection title="Focus Timer">
                {/* Status Display */}
                <PanelSectionRow>
                    <div style={{
                        textAlign: 'center',
                        padding: '24px 0'
                    }}>
                        {/* Phase Icon */}
                        <div style={{ marginBottom: 16 }}>
                            {isActive && isBreak ? (
                                <FaCoffee size={48} color="#44aa88" />
                            ) : (
                                <FaBrain size={48} color={isActive ? "#aa4444" : "#888888"} />
                            )}
                        </div>

                        {/* Phase Label */}
                        <div style={{
                            fontSize: 18,
                            color: isBreak ? '#44aa88' : '#ffffff',
                            marginBottom: 8
                        }}>
                            {getPhaseLabel()}
                        </div>

                        {/* Timer Display */}
                        <div style={{
                            fontSize: 64,
                            fontWeight: 'bold',
                            fontFamily: 'monospace',
                            color: isActive
                                ? (isBreak ? '#44aa88' : (remaining < 60 ? '#ff6666' : '#ffffff'))
                                : '#666666'
                        }}>
                            {formatDuration(isActive ? remaining : workDuration)}
                        </div>

                        {/* Session Counter */}
                        {isActive && (
                            <div style={{
                                fontSize: 14,
                                color: '#888888',
                                marginTop: 8
                            }}>
                                Session {currentSession} of {sessionsUntilLong} <span style={{ opacity: 0.7 }}>(Cycle {currentCycle})</span>
                                {isLongBreakNext && !isBreak && (
                                    <span style={{ color: '#44aa88' }}> • Long break next!</span>
                                )}
                            </div>
                        )}
                    </div>
                </PanelSectionRow>

                {/* Progress Bar */}
                {isActive && (
                    <PanelSectionRow>
                        <ProgressBarWithInfo
                            nProgress={progress}
                            sOperationText={isBreak ? "Relaxing..." : "Focusing..."}
                        />
                    </PanelSectionRow>
                )}

                {/* Controls */}
                {!isActive ? (
                    <PanelSectionRow>
                        <ButtonItem
                            layout="below"
                            onClick={startFocus}
                        >
                            <FaPlay size={12} style={{ marginRight: 8 }} />
                            Start Focus Session
                        </ButtonItem>
                    </PanelSectionRow>
                ) : (
                    <>
                        <PanelSectionRow>
                            <ButtonItem
                                layout="below"
                                onClick={skipPhase}
                            >
                                <FaForward size={12} style={{ marginRight: 8 }} />
                                {isBreak ? "Skip Break → Start Work" : "Skip Work → Take Break"}
                            </ButtonItem>
                        </PanelSectionRow>
                        <PanelSectionRow>
                            <ButtonItem
                                layout="below"
                                onClick={stopFocus}
                            >
                                <FaStop size={12} style={{ marginRight: 8 }} />
                                Stop Session
                            </ButtonItem>
                        </PanelSectionRow>
                    </>
                )}

                <PanelSectionRow>
                    <ToggleField
                        icon={<span style={{ fontSize: 14 }}>📵</span>}
                        label="Subtle Mode"
                        description="Show a small toast instead of fullscreen popup"
                        checked={settings.focus_subtle_mode ?? false}
                        onChange={(value) => updateSetting('focus_subtle_mode', value)}
                    />
                </PanelSectionRow>

                <PanelSectionRow>
                    <ToggleField
                        icon={<span style={{ fontSize: 14 }}>🛡️</span>}
                        label="Prevent Sleep"
                        description="Keep device awake during sessions. Use with caution - may drain battery."
                        checked={settings.focus_prevent_sleep ?? false}
                        onChange={(value) => updateSetting('focus_prevent_sleep', value)}
                    />
                </PanelSectionRow>

            </PanelSection>

            {/* Focus Info */}
            <PanelSection title="How it works">
                <PanelSectionRow>
                    <Focusable style={{ width: '100%' }}>
                        <div style={{ fontSize: 13, color: '#aaaaaa', lineHeight: 1.5, paddingRight: 16 }}>
                            <p style={{ marginBottom: 8 }}>
                                <strong>1.</strong> Focus for {settings.focus_work_duration} minutes
                            </p>
                            <p style={{ marginBottom: 8 }}>
                                <strong>2.</strong> Take a {settings.focus_break_duration} minute break
                            </p>
                            <p style={{ marginBottom: 8 }}>
                                <strong>3.</strong> After {sessionsUntilLong} sessions, enjoy a {settings.focus_long_break_duration} minute break
                            </p>
                            <p style={{ color: '#888888', fontSize: 12 }}>
                                Customize durations in Settings.
                            </p>
                        </div>
                    </Focusable>
                </PanelSectionRow>
            </PanelSection>

            {/* Stats Panel (New Unified Component) */}
            <FocusStatsPanel
                stats={stats}
                elapsedThisPhase={elapsedThisPhase}
                isActive={isActive}
                isBreak={isBreak}
                onResetStats={resetStats}
                dailyGoalEnabled={settings.focus_daily_goal_enabled}
                dailyGoalHours={settings.focus_daily_goal}
            />
        </div>
    );
}
