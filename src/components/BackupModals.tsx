import { ConfirmModal, showModal, TextField } from "@decky/ui";
import { callable } from "@decky/api";
import { useState } from "react";


// Backend contract (main.py): export_backup_to_file and
// import_backup_from_file each return {"ok": true, ...} on success or
// {"ok": false, "error": <code>} on refusal — never a bare boolean.
type BackupResult = { ok: boolean; error?: string };

const exportBackupToFileCall = callable<[string], BackupResult>('export_backup_to_file');
const importBackupFromFileCall = callable<[string], BackupResult>('import_backup_from_file');

// Default path for Steam Deck user — must sit inside the backend's
// ~/Documents / ~/Downloads allowlist (main.py `_safe_user_path`) or the
// default flow is deterministically refused.
const DEFAULT_BACKUP_PATH = "~/Documents/timeout_backup.json";

// Refusal codes → short human messages for the modal status line.
const EXPORT_ERROR_MESSAGES: Record<string, string> = {
    path_not_allowed: "Path not allowed — use a file under ~/Documents or ~/Downloads.",
    file_exists: "A file already exists at that path — pick a different name.",
    export_failed: "Export failed — check the logs.",
};
const IMPORT_ERROR_MESSAGES: Record<string, string> = {
    path_not_allowed: "Path not allowed — use a file under ~/Documents or ~/Downloads.",
    file_not_found: "No backup file found at that path.",
    import_failed: "Import failed — the file is not a valid backup.",
};
const describeBackupError = (messages: Record<string, string>, error?: string) =>
    messages[error ?? ""] ?? `Operation failed${error ? ` (${error})` : ""} — check the logs.`;

const ExportModalContent = ({ closeModal }: { closeModal?: () => void }) => {
    const [path, setPath] = useState(DEFAULT_BACKUP_PATH);
    const [status, setStatus] = useState<string>("");

    const handleExport = async () => {
        if (!path.trim()) return;

        setStatus("Exporting...");
        try {
            const r = await exportBackupToFileCall(path);
            if (r.ok) {
                setStatus("Success! Backup saved.");
                setTimeout(() => closeModal?.(), 1500);
            } else {
                setStatus(`Error: ${describeBackupError(EXPORT_ERROR_MESSAGES, r.error)}`);
            }
        } catch (e) {
            setStatus(`Error: ${e}`);
        }
    };

    return (
        <ConfirmModal
            strTitle="📤 Export Configuration"
            strDescription="Enter the file path to save your backup."
            strOKButtonText="Export"
            strCancelButtonText="Cancel"
            onOK={handleExport}
            onCancel={() => closeModal?.()}
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <TextField
                    value={path}
                    onChange={(e) => setPath(e.target.value)}
                    label="Export File Path"
                />

                {status && (
                    <div style={{
                        color: status.includes("Error") ? '#ff6666' : '#44aa44',
                        textAlign: 'center',
                        fontWeight: 'bold'
                    }}>
                        {status}
                    </div>
                )}
            </div>
        </ConfirmModal>
    );
};

const ImportModalContent = ({ closeModal }: { closeModal?: () => void }) => {
    const [path, setPath] = useState(DEFAULT_BACKUP_PATH);
    const [status, setStatus] = useState<string>("");

    const handleImport = async () => {
        if (!path.trim()) return;

        setStatus("Importing...");
        try {
            const r = await importBackupFromFileCall(path);
            if (r.ok) {
                setStatus("Success! Configuration restored.");
                setTimeout(() => closeModal?.(), 1500);
            } else {
                setStatus(`Error: ${describeBackupError(IMPORT_ERROR_MESSAGES, r.error)}`);
            }
        } catch (e) {
            setStatus(`Error: ${e}`);
        }
    };

    return (
        <ConfirmModal
            strTitle="📥 Import Configuration"
            strDescription="Enter the file path to load your backup from."
            strOKButtonText="Import"
            strCancelButtonText="Cancel"
            onOK={handleImport}
            onCancel={() => closeModal?.()}
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <TextField
                    value={path}
                    onChange={(e) => setPath(e.target.value)}
                    label="Import File Path"
                />

                {status && (
                    <div style={{
                        color: status.includes("Error") ? '#ff6666' : '#44aa44',
                        textAlign: 'center',
                        fontWeight: 'bold'
                    }}>
                        {status}
                    </div>
                )}
            </div>
        </ConfirmModal>
    );
};

export function showExportModal() {
    showModal(<ExportModalContent />);
}

export function showImportModal() {
    showModal(<ImportModalContent />);
}
