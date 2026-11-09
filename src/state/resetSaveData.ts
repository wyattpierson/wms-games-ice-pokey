import { ACHIEVEMENTS_STORAGE_KEY } from './achievementsStore';
import { clearCareerStats } from './careerStatsStore';
import { resetMetaState } from './metaStore';
import { clearRunSave } from './runStore';

/** Achievements and their lifetime counters deliberately outlive every campaign reset. */
export function wipeSaveData(): void {
  resetMetaState();
  clearRunSave();
  clearCareerStats();
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key?.startsWith('ice-pokey:') && key !== ACHIEVEMENTS_STORAGE_KEY) localStorage.removeItem(key);
    }
  } catch { /* storage may be unavailable */ }
}
