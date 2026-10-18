import { ABANDONED_MATCH_ENDS_RUN } from '../config/campaign';
import { abandonMatch, isResumable, newRun, type CampaignState } from '../core/campaign';
import { parseRun, serializeRun } from '../core/runSave';

/**
 * The single campaign run, shared across menu scenes (Phaser scenes have no clean
 * shared-state mechanism, so a module singleton is the pragmatic choice).
 *
 * It is saved to the browser's localStorage after every change and restored on load,
 * so a refresh (or a closed tab) doesn't lose the run. The key is namespaced because
 * every GitHub Pages site under one domain shares one localStorage. If storage is
 * unavailable (private mode, blocked, full) the game just plays on without saving.
 */
const STORAGE_KEY = 'ice-pokey:run';

let state: CampaignState = newRun();
let notice: string | null = null;
/** True once a run really exists: restored from a save, or started/updated this session. */
let runExists = false;

function readSave(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeSave(): void {
  try {
    localStorage.setItem(STORAGE_KEY, serializeRun(state));
  } catch {
    // Storage unavailable or full: keep playing, just without a save.
  }
}

/** Restore the saved run (if any, and valid). A match left unfinished is handled per config. */
function restore(): void {
  const saved = parseRun(readSave());
  if (!saved) return;
  runExists = true;
  if (saved.matchInProgress) {
    if (ABANDONED_MATCH_ENDS_RUN) {
      state = abandonMatch(saved);
      notice = 'Last match left unfinished: counted as a forfeit.';
    } else {
      state = { ...saved, matchInProgress: undefined };
    }
    writeSave();
  } else {
    state = saved;
  }
}
restore();

export function getRun(): CampaignState {
  return state;
}

export function setRun(next: CampaignState): void {
  state = next;
  runExists = true;
  writeSave();
}

/** Start a brand-new run (called from the title screen / end-of-run screens). */
export function resetRun(): CampaignState {
  state = newRun();
  runExists = true;
  writeSave();
  return state;
}

/** Is there a saved run the player can pick up where they left off? */
export function hasSavedRun(): boolean {
  return runExists && isResumable(state);
}

/** One-time message about what happened to the saved run on load (null if nothing to say). */
export function takeNotice(): string | null {
  const message = notice;
  notice = null;
  return message;
}
