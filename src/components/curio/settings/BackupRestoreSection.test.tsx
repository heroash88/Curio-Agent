import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import BackupRestoreSection from "./BackupRestoreSection";

const backupServiceMock = vi.hoisted(() => ({
  createCurioBackupFile: vi.fn(),
  previewCurioBackupFile: vi.fn(),
  restoreCurioBackupPayload: vi.fn(),
}));

vi.mock("../../../services/curioBackupService", async () => {
  const actual = await vi.importActual<typeof import("../../../services/curioBackupService")>(
    "../../../services/curioBackupService",
  );
  return {
    ...actual,
    createCurioBackupFile: backupServiceMock.createCurioBackupFile,
    previewCurioBackupFile: backupServiceMock.previewCurioBackupFile,
    restoreCurioBackupPayload: backupServiceMock.restoreCurioBackupPayload,
  };
});

const backupPayload = {
  schemaVersion: 1 as const,
  createdAt: "2026-05-01T10:00:00.000Z",
  appVersion: "1.3.34",
  storage: { curio_dashboard_title: "Kitchen" },
  secrets: { gemini_live_api_key: "secret" },
  assets: {
    dashboardGalleryImages: [],
    offlineImages: [],
    customWakeWords: [],
    voiceProfiles: [],
  },
};

const backupSummary = {
  createdAt: backupPayload.createdAt,
  appVersion: backupPayload.appVersion,
  storageEntryCount: 1,
  secretCount: 1,
  dashboardPageCount: 2,
  dashboardWidgetCount: 5,
  assetCount: 0,
  accountCategories: ["Gemini"],
};

describe("BackupRestoreSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    backupServiceMock.createCurioBackupFile.mockResolvedValue("encrypted backup");
    backupServiceMock.previewCurioBackupFile.mockResolvedValue({
      envelope: {},
      payload: backupPayload,
      summary: backupSummary,
    });
    backupServiceMock.restoreCurioBackupPayload.mockResolvedValue(undefined);
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:backup"),
      revokeObjectURL: vi.fn(),
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
  });

  it("blocks export until the password has at least six digits and confirmation matches", async () => {
    render(<BackupRestoreSection reloadAfterRestore={false} />);

    fireEvent.click(screen.getByRole("button", { name: /Backup & Restore/i }));
    fireEvent.change(screen.getByLabelText("Backup password"), {
      target: { value: "12345" },
    });
    fireEvent.change(screen.getByLabelText("Confirm backup password"), {
      target: { value: "12345" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Create Backup/i }));

    expect(await screen.findByText(/at least 6 digits/i)).toBeInTheDocument();
    expect(backupServiceMock.createCurioBackupFile).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Backup password"), {
      target: { value: "123456" },
    });
    fireEvent.change(screen.getByLabelText("Confirm backup password"), {
      target: { value: "654321" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Create Backup/i }));

    expect(await screen.findByText(/passwords do not match/i)).toBeInTheDocument();
    expect(backupServiceMock.createCurioBackupFile).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Confirm backup password"), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Create Backup/i }));

    await waitFor(() => {
      expect(backupServiceMock.createCurioBackupFile).toHaveBeenCalledWith(
        expect.objectContaining({ password: "123456" }),
      );
    });
  });

  it("shows an import preview before replacing local state", async () => {
    render(<BackupRestoreSection reloadAfterRestore={false} />);

    fireEvent.click(screen.getByRole("button", { name: /Backup & Restore/i }));
    fireEvent.change(screen.getByLabelText("Restore password"), {
      target: { value: "123456" },
    });
    fireEvent.change(screen.getByLabelText("Backup file"), {
      target: { files: [new File(["encrypted backup"], "curio.curio-backup")] },
    });
    fireEvent.click(screen.getByRole("button", { name: /Preview Restore/i }));

    expect(await screen.findByText(/2 pages/i)).toBeInTheDocument();
    expect(screen.getByText(/5 widgets/i)).toBeInTheDocument();
    expect(screen.getByText(/Gemini/i)).toBeInTheDocument();
    expect(backupServiceMock.restoreCurioBackupPayload).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /Restore Backup/i }));

    await waitFor(() => {
      expect(backupServiceMock.restoreCurioBackupPayload).toHaveBeenCalledWith(backupPayload);
    });
  });

  it("blocks restore when the password is wrong", async () => {
    backupServiceMock.previewCurioBackupFile.mockRejectedValueOnce(
      new Error("Backup password is incorrect."),
    );

    render(<BackupRestoreSection reloadAfterRestore={false} />);

    fireEvent.click(screen.getByRole("button", { name: /Backup & Restore/i }));
    fireEvent.change(screen.getByLabelText("Restore password"), {
      target: { value: "654321" },
    });
    fireEvent.change(screen.getByLabelText("Backup file"), {
      target: { files: [new File(["encrypted backup"], "curio.curio-backup")] },
    });
    fireEvent.click(screen.getByRole("button", { name: /Preview Restore/i }));

    expect(await screen.findByText(/password is incorrect/i)).toBeInTheDocument();
    expect(backupServiceMock.restoreCurioBackupPayload).not.toHaveBeenCalled();
  });
});
