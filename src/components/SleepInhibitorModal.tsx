import { ConfirmModal, showModal, Focusable } from "@decky/ui";
import { callable } from "@decky/api";
import { FaBrain, FaShieldAlt } from "react-icons/fa";
import { useUIComposition, UIComposition } from "../utils/uiComposition";

const disableAllSleepInhibitors = callable<[], boolean>('disable_all_sleep_inhibitors');

interface SleepInhibitorItem {
    type: string;
    id: string;
    label: string;
}

interface SleepInhibitorModalProps {
    items: SleepInhibitorItem[];
    closeModal?: () => void;
}

export function showSleepInhibitorModal(items: SleepInhibitorItem[]) {
    showModal(<SleepInhibitorModalContent items={items} />);
}

function showDisableAllConfirmModal(onConfirm: () => void) {
    showModal(
        <ConfirmModal
            strTitle="Disable All Sleep Blockers"
            strDescription="This will stop all timers, end the focus session, and turn off all alarms that are preventing sleep. Are you sure?"
            strOKButtonText="Disable All"
            strCancelButtonText="Cancel"
            onOK={onConfirm}
        />
    );
}

function SleepInhibitorModalContent({ items, closeModal }: SleepInhibitorModalProps) {
    useUIComposition(UIComposition.Opaque);

    const handleClose = () => {
        closeModal?.();
    };

    const handleDisableAll = () => {
        showDisableAllConfirmModal(async () => {
            await disableAllSleepInhibitors();
            closeModal?.();
        });
    };

    const getIcon = (type: string) => {
        switch (type) {
            case 'focus': return <FaBrain />;
            default: return <FaShieldAlt />;
        }
    };

    const getTypeLabel = (type: string) => {
        switch (type) {
            case 'focus': return 'Focus Session';
            default: return type;
        }
    };

    return (
        <ConfirmModal
            strTitle="Sleep Blocked"
            strDescription={`${items.length} item${items.length !== 1 ? 's' : ''} preventing sleep.`}
            strOKButtonText="Close"
            strCancelButtonText="Disable All"
            onOK={handleClose}
            onCancel={handleDisableAll}
        >
            <div style={{
                maxHeight: '300px',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                padding: '4px 8px 4px 0',
                marginTop: '10px'
            }}>
                <Focusable>
                    {items.map((item, idx) => (
                        <Focusable
                            key={idx}
                            onActivate={() => {}}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                backgroundColor: '#e6990022',
                                padding: '10px 12px',
                                borderRadius: 8,
                                gap: 12,
                                marginBottom: idx < items.length - 1 ? 8 : 0,
                                border: '1px solid #e6990044',
                                transition: 'background-color 0.2s'
                            }}
                        >
                            <div style={{ fontSize: 18, color: '#e69900', display: 'flex', alignItems: 'center' }}>
                                {getIcon(item.type)}
                            </div>
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                                <div style={{ fontWeight: 'bold', fontSize: '14px' }}>{item.label}</div>
                                <div style={{ fontSize: 12, color: '#aaaaaa' }}>
                                    {getTypeLabel(item.type)}                                </div>
                            </div>
                        </Focusable>
                    ))}
                </Focusable>
            </div>
        </ConfirmModal>
    );
}

export default showSleepInhibitorModal;
