import { ConfirmModal, showModal, Focusable } from "@decky/ui";
import { toaster } from "@decky/api";
import { FaPlay } from "react-icons/fa";
import { chooseLaunch, useFiveMinFinish, reportGameStarted } from "../hooks/useGameLimits";

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
    const start = async (choice: 'full' | 'half') => {
        try {
            await chooseLaunch(appId, choice);
        } catch (e) {
            console.error('[Timeout] choose_launch failed:', e);
            toaster.toast({ title: 'Game Limits', body: 'Failed to start session.' });
        }
        closeModal?.();
    };
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
