import React, { useMemo, useState } from "react";
import { Download, ShieldCheck, Upload } from "lucide-react";

import {
  createCurioBackupFile,
  previewCurioBackupFile,
  restoreCurioBackupPayload,
  validateCurioBackupPassword,
  type CurioBackupPayloadV1,
  type CurioBackupSummary,
} from "../../../services/curioBackupService";
import SettingsSection from "../SettingsSection";

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100";

const actionClass =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50 active:scale-95";

const secondaryActionClass =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 active:scale-95";

const dangerActionClass =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50 active:scale-95";

const buildErrorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message ? error.message : fallback;

const downloadBackup = (backupText: string): void => {
  const blob = new Blob([backupText], {
    type: "application/vnd.curio.backup+json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `curio-backup-${new Date().toISOString().slice(0, 10)}.curio-backup`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

const formatDate = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
};

const SummaryRow: React.FC<{ label: string; value: React.ReactNode }> = ({
  label,
  value,
}) => (
  <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2">
    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
      {label}
    </span>
    <span className="text-right text-xs font-semibold text-slate-700">{value}</span>
  </div>
);

const BackupSummaryPreview: React.FC<{ summary: CurioBackupSummary }> = ({
  summary,
}) => {
  const accountText = summary.accountCategories.length
    ? summary.accountCategories.join(", ")
    : "None";

  return (
    <div className="space-y-2 rounded-2xl border border-sky-100 bg-sky-50/60 p-3">
      <div className="flex items-center gap-2 text-xs font-bold text-sky-700">
        <ShieldCheck size={14} />
        Restore preview
      </div>
      <SummaryRow label="Created" value={formatDate(summary.createdAt)} />
      <SummaryRow label="App" value={summary.appVersion} />
      <SummaryRow
        label="Dashboard"
        value={`${summary.dashboardPageCount} pages, ${summary.dashboardWidgetCount} widgets`}
      />
      <SummaryRow
        label="Settings"
        value={`${summary.storageEntryCount} settings, ${summary.secretCount} secrets`}
      />
      <SummaryRow label="Assets" value={summary.assetCount} />
      <SummaryRow label="Accounts" value={accountText} />
    </div>
  );
};

interface BackupRestoreSectionProps {
  reloadAfterRestore?: boolean;
}

const BackupRestoreSection: React.FC<BackupRestoreSectionProps> = ({
  reloadAfterRestore = true,
}) => {
  const [backupPassword, setBackupPassword] = useState("");
  const [backupConfirmPassword, setBackupConfirmPassword] = useState("");
  const [restorePassword, setRestorePassword] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pendingRestore, setPendingRestore] = useState<{
    payload: CurioBackupPayloadV1;
    summary: CurioBackupSummary;
  } | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const backupValidation = useMemo(
    () => validateCurioBackupPassword(backupPassword),
    [backupPassword],
  );
  const restoreValidation = useMemo(
    () => validateCurioBackupPassword(restorePassword),
    [restorePassword],
  );

  const clearStatus = () => {
    setMessage("");
    setError("");
  };

  const handleCreateBackup = async () => {
    clearStatus();
    if (!backupValidation.valid) {
      setError(backupValidation.message || "Enter a valid backup password.");
      return;
    }
    if (backupPassword !== backupConfirmPassword) {
      setError("Backup passwords do not match.");
      return;
    }

    setExporting(true);
    try {
      const backupText = await createCurioBackupFile({
        password: backupPassword,
      });
      downloadBackup(backupText);
      setMessage("Encrypted backup created.");
    } catch (err) {
      setError(buildErrorMessage(err, "Could not create backup."));
    } finally {
      setExporting(false);
    }
  };

  const handlePreviewRestore = async () => {
    clearStatus();
    setPendingRestore(null);
    if (!restoreValidation.valid) {
      setError(restoreValidation.message || "Enter a valid restore password.");
      return;
    }
    if (!selectedFile) {
      setError("Choose a Curio backup file first.");
      return;
    }

    setPreviewing(true);
    try {
      const backupText = await selectedFile.text();
      const preview = await previewCurioBackupFile(backupText, restorePassword);
      setPendingRestore({
        payload: preview.payload,
        summary: preview.summary,
      });
      setMessage("Backup decrypted. Review the summary before restoring.");
    } catch (err) {
      setError(buildErrorMessage(err, "Could not preview backup."));
    } finally {
      setPreviewing(false);
    }
  };

  const handleRestore = async () => {
    if (!pendingRestore) return;
    clearStatus();
    setRestoring(true);
    try {
      await restoreCurioBackupPayload(pendingRestore.payload);
      setMessage("Backup restored. Reloading Curio...");
      if (reloadAfterRestore) {
        window.setTimeout(() => {
          try {
            window.location.reload();
          } catch {
            // jsdom and some embedded shells may not allow programmatic reload.
          }
        }, 100);
      }
    } catch (err) {
      setError(buildErrorMessage(err, "Could not restore backup."));
    } finally {
      setRestoring(false);
    }
  };

  return (
    <SettingsSection
      title="Backup & Restore"
      icon={<ShieldCheck size={18} className="text-emerald-500" />}
    >
      <div className="space-y-4">
        <div className="rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <Download size={15} className="text-sky-500" />
            <div>
              <div className="text-sm font-bold text-slate-700">Encrypted backup</div>
              <div className="text-[10px] text-slate-400">
                Saves local settings, dashboard pages, accounts, secrets, and user assets.
              </div>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Backup password
              </span>
              <input
                aria-label="Backup password"
                type="password"
                value={backupPassword}
                onChange={(event) => setBackupPassword(event.target.value)}
                className={inputClass}
                placeholder="At least 6 digits"
                onKeyDown={(event) => event.stopPropagation()}
              />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Confirm password
              </span>
              <input
                aria-label="Confirm backup password"
                type="password"
                value={backupConfirmPassword}
                onChange={(event) => setBackupConfirmPassword(event.target.value)}
                className={inputClass}
                placeholder="Repeat password"
                onKeyDown={(event) => event.stopPropagation()}
              />
            </label>
          </div>
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={handleCreateBackup}
              disabled={exporting}
              className={actionClass}
            >
              <Download size={14} />
              {exporting ? "Creating..." : "Create Backup"}
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <Upload size={15} className="text-emerald-500" />
            <div>
              <div className="text-sm font-bold text-slate-700">Restore backup</div>
              <div className="text-[10px] text-slate-400">
                Decrypts first, previews what will be restored, then replaces Curio local data.
              </div>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_1.1fr]">
            <label className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Restore password
              </span>
              <input
                aria-label="Restore password"
                type="password"
                value={restorePassword}
                onChange={(event) => {
                  setRestorePassword(event.target.value);
                  setPendingRestore(null);
                }}
                className={inputClass}
                placeholder="Backup password"
                onKeyDown={(event) => event.stopPropagation()}
              />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Backup file
              </span>
              <input
                aria-label="Backup file"
                type="file"
                accept=".curio-backup,application/json,application/vnd.curio.backup+json"
                onChange={(event) => {
                  setSelectedFile(event.currentTarget.files?.[0] || null);
                  setPendingRestore(null);
                }}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-white"
              />
            </label>
          </div>
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={handlePreviewRestore}
              disabled={previewing}
              className={secondaryActionClass}
            >
              <ShieldCheck size={14} />
              {previewing ? "Decrypting..." : "Preview Restore"}
            </button>
            <button
              type="button"
              onClick={handleRestore}
              disabled={!pendingRestore || restoring}
              className={dangerActionClass}
            >
              <Upload size={14} />
              {restoring ? "Restoring..." : "Restore Backup"}
            </button>
          </div>
          {pendingRestore && (
            <div className="mt-3">
              <BackupSummaryPreview summary={pendingRestore.summary} />
            </div>
          )}
        </div>

        {(message || error) && (
          <div
            className={`rounded-xl px-3 py-2 text-xs font-semibold ${
              error
                ? "border border-red-200 bg-red-50 text-red-600"
                : "border border-emerald-200 bg-emerald-50 text-emerald-700"
            }`}
          >
            {error || message}
          </div>
        )}
      </div>
    </SettingsSection>
  );
};

export default React.memo(BackupRestoreSection);
