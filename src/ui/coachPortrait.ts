import { STARTER_EVOLUTIONS } from '../config/progression';
import { RIVAL_STARTER, STORY_CHARACTERS as C } from '../config/storyCampaign';
import type { MetaState } from '../state/metaStore';

/** Resolve from the speaking identity, so UNKNOWN never leaks Mimikyu's reveal. */
export function storyPortrait(speaker: string, meta: MetaState): { texture?: string; partner?: number; trainer?: boolean; sinister?: boolean } {
  if (speaker === C.signal.revealedName) return { texture: 'pkm-778' };
  if (speaker === C.arceus.name) return { texture: 'pkm-493' };
  if (speaker === C.villain.name) return {
    texture: meta.story.catastrophe ? 'trainer-valen-revealed' : 'trainer-valen',
    trainer: true, sinister: meta.story.catastrophe,
  };
  if (speaker !== C.player.name && speaker !== C.rival.name) return {};
  const rival = speaker === C.rival.name;
  const starter = meta.starter;
  const stages = starter ? STARTER_EVOLUTIONS[rival ? RIVAL_STARTER[starter] : starter] : undefined;
  const partner = stages && (rival ? stages[stages.length - 1] : [...stages].reverse().find(stage => meta.starterXp[starter!] >= stage.at) || stages[0]);
  return { texture: rival ? 'trainer-rival' : 'trainer-player', trainer: true, partner: partner?.sprite };
}
