// src/services/googleTasksAPI.ts

import {
  getGoogleAccessToken,
  getGoogleTasksAccessToken,
  setGoogleTasksAccessToken,
} from "../utils/settingsStorage";
import { signInWithGoogle, hasRecentUserInteraction, silentRefreshGoogle } from "./googleOAuth";
import { friendlyGoogleError } from "../utils/googleApiErrors";

const TASKS_API_BASE = "https://tasks.googleapis.com/tasks/v1";
const TASKS_SCOPES = ["https://www.googleapis.com/auth/tasks"];

export interface GoogleTask {
  id: string;
  title: string;
  notes?: string;
  status: string;
  due?: string;
}

async function ensureToken(): Promise<string> {
  let token = getGoogleTasksAccessToken() || getGoogleAccessToken();
  if (token) {
    if (!getGoogleTasksAccessToken()) {
      setGoogleTasksAccessToken(token);
    }
    return token;
  }

  // Try silent refresh first (hidden iframe, no UI)
  try {
    const result = await silentRefreshGoogle(TASKS_SCOPES);
    token = result.accessToken;
    setGoogleTasksAccessToken(token);
    return token;
  } catch { /* silent refresh failed */ }

  if (!hasRecentUserInteraction()) {
    throw new Error('Google Tasks token expired. Interact with the page to re-authenticate.');
  }
  const result = await signInWithGoogle(TASKS_SCOPES);
  token = result.accessToken;
  setGoogleTasksAccessToken(token);
  return token;
}

async function tasksFetch(path: string, init?: RequestInit): Promise<Response> {
  const storedTasksToken = getGoogleTasksAccessToken();
  const token = await ensureToken();
  const response = await fetch(`${TASKS_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (
    response.status === 401 ||
    (!storedTasksToken && response.status === 403)
  ) {
    setGoogleTasksAccessToken("");

    // Try silent refresh first
    try {
      const silentResult = await silentRefreshGoogle(TASKS_SCOPES);
      setGoogleTasksAccessToken(silentResult.accessToken);
      return fetch(`${TASKS_API_BASE}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${silentResult.accessToken}`,
          "Content-Type": "application/json",
          ...init?.headers,
        },
      });
    } catch { /* silent refresh failed */ }

    if (!hasRecentUserInteraction()) {
      throw new Error('Google Tasks token expired. Interact with the page to re-authenticate.');
    }
    const freshToken = (await signInWithGoogle(TASKS_SCOPES)).accessToken;
    setGoogleTasksAccessToken(freshToken);
    return fetch(`${TASKS_API_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${freshToken}`,
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });
  }

  return response;
}

/**
 * Creates a new task in the user's default Google Tasks list.
 *
 * NOTE: The Google Tasks API `due` field only stores the DATE — the time portion
 * is explicitly discarded by Google. We therefore:
 *   1. Send `due` as a midnight-UTC date string for the correct calendar day.
 *   2. Write the full human-readable date+time into `notes` so it shows in the UI.
 *
 * @param accessToken The Google OAuth access token with 'https://www.googleapis.com/auth/tasks' scope.
 * @param title The title of the task.
 * @param scheduledTimeLabel The natural-language time string from the AI (e.g. "tomorrow at 8 AM").
 * @param dueDateTime RFC 3339 timestamp with timezone offset produced by the AI (e.g. "2026-04-08T20:00:00-07:00").
 * @returns The created task object.
 */
export async function createGoogleTask(
  accessToken: string,
  title: string,
  scheduledTimeLabel?: string,
  dueDateTime?: string,
): Promise<GoogleTask> {
  const listId = "@default";
  if (accessToken && !getGoogleTasksAccessToken()) {
    setGoogleTasksAccessToken(accessToken);
  }

  // Tag the task clearly as originating from Curio
  const prefixedTitle = title.startsWith("[Curio]")
    ? title
    : `[Curio] ${title}`;

  // Build a human-readable time string for the notes field.
  // Google Tasks UI doesn't display the time from `due`, so we embed it here.
  let humanTime = scheduledTimeLabel || "";
  if (dueDateTime) {
    try {
      const parsed = new Date(dueDateTime);
      if (!isNaN(parsed.getTime())) {
        humanTime = parsed.toLocaleString(undefined, {
          weekday: "short",
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
          timeZoneName: "short",
        });
      }
    } catch {
      // Fall back to the label if parsing fails
    }
  }

  const notes = humanTime ? `⏰ Due: ${humanTime}` : "";

  const bodyObj: Record<string, string> = {
    title: prefixedTitle,
    notes,
  };

  // The `due` field must be a date-only RFC 3339 string (midnight UTC on the correct day).
  // We parse the AI-supplied local datetime and normalize it to midnight UTC on that calendar date.
  if (dueDateTime) {
    try {
      const parsed = new Date(dueDateTime);
      if (!isNaN(parsed.getTime())) {
        // Format as YYYY-MM-DDT00:00:00.000Z (date portion only)
        const yyyy = parsed.getFullYear();
        const mm = String(parsed.getMonth() + 1).padStart(2, "0");
        const dd = String(parsed.getDate()).padStart(2, "0");
        bodyObj.due = `${yyyy}-${mm}-${dd}T00:00:00.000Z`;
      }
    } catch {
      // Skip setting due if parsing fails
    }
  }

  const response = await tasksFetch(`/lists/${listId}/tasks`, {
    method: "POST",
    body: JSON.stringify(bodyObj),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    throw new Error(
      friendlyGoogleError(
        new Error(
          errorData?.error?.message ||
            `Google Tasks API failed with status ${response.status}`,
        ),
      ),
    );
  }

  return response.json();
}

export async function listGoogleTasks(maxResults = 25): Promise<GoogleTask[]> {
  const listId = "@default";
  const response = await tasksFetch(
    `/lists/${listId}/tasks?${new URLSearchParams({
      maxResults: String(maxResults),
      showCompleted: "true",
      showHidden: "true",
      showDeleted: "false",
    })}`,
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    throw new Error(
      friendlyGoogleError(
        new Error(
          errorData?.error?.message ||
            `Google Tasks API failed with status ${response.status}`,
        ),
      ),
    );
  }

  const payload = await response.json();
  return Array.isArray(payload.items) ? payload.items : [];
}

export async function updateGoogleTask(
  taskId: string,
  patch: Partial<Pick<GoogleTask, "title" | "notes" | "status" | "due">>,
): Promise<GoogleTask> {
  const listId = "@default";
  const response = await tasksFetch(`/lists/${listId}/tasks/${taskId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    throw new Error(
      friendlyGoogleError(
        new Error(
          errorData?.error?.message ||
            `Google Tasks API failed with status ${response.status}`,
        ),
      ),
    );
  }

  return response.json();
}

export async function deleteGoogleTask(taskId: string): Promise<void> {
  const listId = "@default";
  const response = await tasksFetch(`/lists/${listId}/tasks/${taskId}`, {
    method: "DELETE",
  });

  if (!response.ok && response.status !== 204) {
    const errorData = await response.json().catch(() => null);
    throw new Error(
      friendlyGoogleError(
        new Error(
          errorData?.error?.message ||
            `Google Tasks API failed with status ${response.status}`,
        ),
      ),
    );
  }
}
