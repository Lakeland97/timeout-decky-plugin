import { ConfirmModal, showModal, Focusable } from "@decky/ui";
import { toaster } from "@decky/api";
import { FaPlay } from "react-icons/fa";
import { chooseLaunch, useFiveMinFinish, reportGameStarted } from "../hooks/useGameLimits";
import type { GameLaunchDecision } from "../types";

// Launch-time menu: choose Full / Half / Cancel when a limited game starts.
export function showLaunchMenu(appId: string, appName: string) {
    showModal(<LaunchMenuModal appId={appId} appName={appName} />);
}

const LaunchMenuModal = ({ appId, appName, closeModal }: {
    appId: string;
    appName: string;
    closeModal?: () => void;
}) => {
    const label = appName || `App ${appId}`;
    // Decision D1: Cancel terminates the game through the same verified-kill
    // path as blocked launches — cancelling must not leave it running free.
    const cancel = async () => {
        try {
            const r = await reportGameStarted(appId, appName, 'cancel');
            showGameToast('Game Limits', r.terminated
                ? `${label} cancelled — game stopped.`
                : `${label} cancelled — could not be stopped; close it manually.`);
        } catch (e) {
            console.error('[Timeout] cancel launch failed:', e);
            toaster.toast({ title: 'Game Limits', body: `Could not stop ${label} — close it manually.` });
        }
        closeModal?.();
    };
    const start = async (choice: 'full' | 'half') => {
        try {
            const r = await chooseLaunch(appId, choice);
            if (r && 'blocked' in r && r.blocked) {
                // choose_launch refused the start (e.g. no_credits): the
                // backend already ran the blocked-launch path (_block_launch)
                // and terminated the game — show the same blocked toast the
                // game-lifetime handler uses, then close.
                showBlockedLaunchToast(appId, r);
                closeModal?.();
                return;
            }
            if (r && 'error' in r && r.error) {
                // Error result: no session_start was recorded, so the game
                // must not keep running un-sessioned — same terminate path as
                // Cancel (D1), which also reports the kill verdict.
                toaster.toast({ title: 'Game Limits', body: `Could not start ${label} (${r.error}).` });
                await cancel();
                return;
            }
        } catch (e) {
            console.error('[Timeout] choose_launch failed:', e);
            toaster.toast({ title: 'Game Limits', body: `Failed to start ${label}.` });
            // Same reasoning as the error result above: a start that failed
            // must never leave the game running unlimited.
            await cancel();
            return;
        }
        closeModal?.();
    };
    return (
        <ConfirmModal
            strTitle="Game Limits"
            strDescription={`${label} is limited. Choose how to start:`}
            strOKButtonText="Start Full"
            strCancelButtonText="Cancel"
            onOK={() => start('full')}
            onCancel={cancel}
        >
            <Focusable
                onActivate={() => start('half')}
                onClick={() => start('half')}
                style={{
                    padding: '12px',
                    margin: '8px 0',
                    textAlign: 'center',
                    backgroundColor: '#ffffff22',
                    borderRadius: 8,
                    cursor: 'pointer',
                    border: '2px solid transparent'
                }}
            >
                <FaPlay style={{ marginRight: 8 }} />
                Start Half Session (0.5 opens)
            </Focusable>
        </ConfirmModal>
    );
};

// Once-a-day "5 more minutes" prompt when a cap/curfew trips.
export function showFiveMinFinishPrompt(appId: string) {
    showModal(<FiveMinFinishModal appId={appId} />);
}

const FiveMinFinishModal = ({ appId, closeModal }: { appId: string; closeModal?: () => void }) => {
    return (
        <ConfirmModal
            strTitle="Time's Up"
            strDescription="Need a few more minutes to save or finish?"
            strOKButtonText="5 More Minutes"
            strCancelButtonText="Quit Now"
            onOK={async () => {
                try { await useFiveMinFinish(appId); } catch (e) { console.error('[Timeout] use_five_min_finish:', e); }
                closeModal?.();
            }}
            onCancel={() => closeModal?.()}
        />
    );
};

export function showGameToast(title: string, body: string) {
    toaster.toast({ title, body });
}

// Shared blocked-launch toast for the backend's _block_launch result
// (limited + blocked + terminated). Used by the game-lifetime handler and by
// the launch menu when choose_launch itself blocks — one formatting, two
// callers.
export function showBlockedLaunchToast(appId: string, decision: Pick<GameLaunchDecision, 'blocked' | 'terminated'>) {
    showGameToast("Game Limits", decision.terminated
        ? `${appId} blocked (${decision.blocked})`
        : `${appId} blocked (${decision.blocked}) — could not be stopped, close it manually`);
}
