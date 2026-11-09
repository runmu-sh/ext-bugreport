/**
 * The bug-report contract (Torchship, GMCP package `Bug 1`) and the extension's exported API.
 * The payload schemas in `schema/` and the README's table describe the same shapes; change them together.
 */

/** The last error the game showed the character (`Bug.Traceback`, and `last_traceback` in `Bug.Draft`). */
export interface BugTraceback {
  /** Epoch seconds. */
  time: number;
  /** `E_RANGE`, `timeout` … */
  code: string;
  msg: string;
  /** `#123:verb (line 4)`: the first frame with code of its own. */
  where: string;
  /** What the player typed; '' when the error did not come from a typed command. */
  command: string;
  location: string;
  traceback: string[];
}

/** The open draft, as the server keeps it (`@bug` edits the same one). */
export interface BugDraft {
  subject: string;
  /** Newline-joined lines. */
  body: string;
  severity: string;
  category: string;
  /** Whether the last error is attached. */
  traceback: boolean;
  /** Epoch seconds. */
  started: number;
  /** Where the draft was started. */
  location: string;
}

/** `Bug.Draft`: the draft (null when none is open), the choices, and the last error. */
export interface BugState {
  draft: BugDraft | null;
  severities: string[];
  categories: string[];
  lastTraceback: BugTraceback | null;
}

/** `Bug.Result`: what became of the last action. */
export interface BugResult {
  action: string;
  ok: boolean;
  message: string;
  id?: number;
}

/** One of the character's own reports (`Bug.Mine`), newest first. */
export interface BugReport {
  id: number;
  /** `bugs/45`, or `archived`. */
  ref: string;
  subject: string;
  status: string;
  created: number;
  updated: number;
}

/** The fields `Bug.Save` and `Bug.Submit` take; each is optional. */
export interface BugFields {
  subject?: string;
  body?: string;
  severity?: string;
  category?: string;
  traceback?: boolean;
}

/** `await ctx.api('bugreport')`. */
export interface BugReportApi {
  /** Open the panel on a report (starting a draft on the server when none is open). */
  open(sid?: string): void;
  /** The session's last `Bug.Draft`, or null. A copy. */
  state(sid?: string): BugState | null;
}

/** Subject and body limits the server enforces. */
export const SUBJECT_MAX = 80;
export const BODY_MAX = 8000;
export const BODY_LINES_MAX = 100;

export const SETTINGS = {
  button: 'button.show',
  offer: 'offer.errors',
} as const;
