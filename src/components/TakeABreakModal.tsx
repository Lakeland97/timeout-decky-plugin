import { ConfirmModal, showModal, Focusable } from "@decky/ui";
import { FaCoffee } from "react-icons/fa";
import { startAdhocBreakCall } from "../hooks/useFocus";

// Ad-hoc break picker (presets). Taking a break does NOT break the streak.
export function showTakeABreakModal() {
    showModal(<TakeABreakModal />);
}

const PRESETS = [1, 2, 3, 5, 7, 10];

const TakeABreakModal = ({ closeModal }: { closeModal?: () => void }) => {
    const choose = async (min: number) => {
        try {
            await startAdhocBreakCall(min);
        } catch (e) {
            console.error('[Timeout] start_adhoc_break failed:', e);
        }
        closeModal?.();
    };
    return (
        <ConfirmModal
            strTitle="Take a Break"
            strDescription="Pick a break length (won't break your streak):"
            strOKButtonText="Close"
            strCancelButtonText="Close"
            onOK={() => closeModal?.()}
            onCancel={() => closeModal?.()}
        >
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '8px 0' }}>
                {PRESETS.map((min) => (
                    <Focusable
                        key={min}
                        onActivate={() => choose(min)}
                        onClick={() => choose(min)}
                        style={{
                            padding: '12px',
                            textAlign: 'center',
                            backgroundColor: '#ffffff22',
                            borderRadius: 8,
                            cursor: 'pointer',
                            border: '2px solid transparent'
                        }}
                    >
                        <FaCoffee style={{ marginRight: 6 }} />
                        {min} min
                    </Focusable>
                ))}
            </div>
        </ConfirmModal>
    );
};
