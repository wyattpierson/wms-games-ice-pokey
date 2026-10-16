# Ice Pokéy — Progress

Living progress doc. **DESIGN.md** has the full design; this file tracks what's
built, how to run it, current tuning constants, and what to work on next.

**Status: MVP build-order steps 1–3 done** — rink + 4v4 movement + carry/pass/
switch/shot + **jukes (J/K/L) + parry + check + perfect shot + Pokémon sprites +
parry-aware AI**. Game verified loading & running after the session-4
preloader fix; user playtesting the new 1v1 layer.

---

## How to run

- `npm run dev` → vite prints the port (5173/5174/… whichever is free)
- `npx tsc --noEmit` — typecheck (strict: noUnusedLocals/Parameters)
- `npm test` — vitest (pure `core/` tests)
- `npm run build` — production build
- `node scripts/smoke.mjs [url]` — headless playwright smoke test. Asserts
  GameScene is actually running and the match reached `live` (this is what
  caught the session-3 blank screen), replays inputs (move/pass/charge-shot/
  juke/check), reports loaded sprite count, collects console/page errors.
  **Do NOT rely on pixel-probing for visual bugs — user confirms visuals in
  the app; that's the agreed test channel.**

Dev deep-links:
- `?opp=0|1|2` — pick opponent (Tidal Wave / Ember Blitz / Tundra Kings)
- `?renderer=canvas` — force canvas (Phaser config key is `type`, not `renderer`)
- In-game: **R** restarts when a match is over

---

## Current state

### What works (playtest-confirmed by user)
- Rink rendering, 4v4 (3 field + 1 goalie per team), static camera
- User controls one player: carrier on offense, one defender on defense
- **Sticks**: drawn container-local, attached to body, follow puck at blade ✅
- **Movement**: WASD/arrows, carriers keep last facing when stopped (no orbit)
- **Passing (SPACE)**: always passes to best teammate (aim alignment − soft
  distance penalty, no threshold); pass is **led** toward receiver's velocity ✅
- **Shooting (hold Enter/Shift)**: charge 0→1 over 0.65s; **goal-anchored aim**
  (base = goal-mouth center, Up/Down adjusts corner ±0.5 rad); charging snaps the
  stick toward the goal ✅ ("definitely an improvement", tweak later)
- **Fast-puck skill contest**: grabs of pucks >350 px/s roll
  `0.9 + 0.5×puckSense − (speed−350)/700` (clamped 0.12–0.95); miss = 0.45s
  `whiffCooldown` (player flails, can't re-grab that puck)
- **Goalie saves**: within 34 px, stat roll `0.25 + 0.5×puckSense − 0.1×(speed/660)`
- **AI roles** (replaced mirror-following):
  - Offense: slot 0 = slot player (in front of enemy goal, weak side),
    slot 1 = receiver (behind carrier, open side), slot 2 = roamer (neutral
    support). Teammates have anti-clumping push.
  - Defense: slot 0 = net-front (tracks puck y), slot 1 = support (130 px behind
    puck toward own goal, **offset 70 px to the side** so lanes stay open),
    slot 2 = cover (mirror side)
  - AI carrier: sine-weave toward goal, decision timer 0.5–1.1s (shoot/pass),
    **jukes when threatened** (opponent <110 px → per-second chance 0.9 to start
    a random move; committed coast during the tell)
- **Jukes (J/K/L)** — Spin 0.30s tell (orange) / Crossover 0.35s (blue) /
  Deke 0.45s (yellow). During the tell: stick flashes move color (dim flicker →
  **bright flash in the last half** = parryable), blade oscillates with the puck,
  carrier is committed (no steering). Unparried → burst (195/260/320×SpA),
  crossover cuts AWAY from the nearest defender, spin does a full 2π turn, and
  nearby defenders get **knocked back biased behind the carrier** + tumble.
  Cooldown 1.2s + tell + effect. Whiff/early/late parry press = 0.5s stagger +
  tumble (gray flash).
- **Parry (defense, J/K/L same-key)**: success window = last
  `0.16 + 0.2×SpD` s of the tell (≤70% of tell, floor 0.05s), must be within
  62 px of the carrier. Success = **steal + 330 px/s counter-burst** + green "!";
  carrier tumbles/staggers. Wrong key/early/late = whiff stagger. No tell =
  harmless tap. AI defenders: 12% + 35%×SpD plan a parry (random press in window
  → they whiff too), else 18% plan a check; they shadow-skate behind the carrier.
- **Check (defense, Enter/Shift)**: safe (no whiff), 1.0s cooldown; pushes the
  carrier 260 px/s and can dislodge the puck (35% + 0.4×Def/100) when the carrier
  isn't mid-tell. (HP damage still pending.)
- **Perfect shot**: hold charge ≥ 80% → shot ×1.18 + white "!" popup; the **enemy
  goalie flashes white** while you hold in the zone (the tell), charge arc turns
  white with a tick at 80%. User shots only.
- **Pokémon sprites**: 96×96 PokeAPI PNGs per player (16 unique) via a Preloader
  scene; walk-bob, facing flip, team-color ring, **yellow arrow + ring marks the
  controlled player** (offense AND defense). Offline → placeholder disc (game
  still works).
- HUD: score, banners (goal/end), hint text (updated for new controls)
- Match: first to 3, puck drop at center, no clock

### Files
```
src/
  main.ts                      Phaser boot: Preloader (sprites) + GameScene,
                               FIT scale, pixelArt, ?renderer= → { type: ... }
  config/
    rink.ts                    rink geometry (RINK_W 1080, GAME_WIDTH 1192, ...)
    gameplay.ts                ALL tuning constants (see below)
    bindings.ts                EVERY key binding (swap scheme here only)
    teams.ts                   4 teams × 4 Pokémon (names/colors/sprite ID; stats)
  core/                        pure TS, no Phaser, unit-tested
    vec2.ts                    v/add/sub/scale/len/dist/dot/norm/clampLen/lerp/clamp
    stats.ts + stats.test.ts   deriveStats(BaseStats) → HockeyStats
    moves.ts + moves.test.ts   MOVE_DEFS (tells/bursts/knock/colors), effectiveWindow,
                               parryTiming (early/success/late), movePhase
  gameplay/
    controls.ts                keyboard wrapper (direction/justPressed/held/justReleased)
    ai.ts                      stepAI: goalie / carrier (jukes) / zone / 1v1 parry
                               planning (parryRollSeq/parryPlanT/checkPlanT) / chase
    entities/
      Rink.ts                  static graphics (boards, lines, dots, creases, nets)
      Player.ts                sprite + stick + ring + arrow; carry/charge/tell/
                               swing/tumble/stagger anims; canStartMove/startMove/whiff
      Puck.ts                  loose/carried/scored; friction, board bounces, scores
  scenes/
    GameScene.ts               whole game loop, input (offense juke / defense
                               parry+check), tryParry/doCheck/finishMove/popup,
                               perfect shot, pickup/save logic, HUD
scripts/smoke.mjs              headless smoke test (errors only, no pixel probes)
```

### Key constants (`src/config/gameplay.ts`)
| Constant | Value | Note |
|---|---|---|
| PLAYER_RADIUS | 15 | GOALIE_RADIUS 18 |
| BASE_SPEED / SPEED_PER_STAT | 150 / 1.05 | per Spd stat |
| PASS_SPEED | 470 | × passPower (0.9–1.1) |
| CHARGE_TIME | 0.65 s | |
| SHOT_SPEED_MIN / MAX | 430 / 660 | × shotPower (0.75–1.25) |
| SHOT_SPREAD | 0.5 rad | corner adjust range |
| FAST_PUCK_SPEED | 350 | above → grab is a stat roll |
| SHOOT_RANGE | 290 | AI shot range |
| PICKUP_RADIUS | 30 | +6 for goalies |
| PICKUP_DELAY | 0.3 s | |
| GOALIE_SAVE_RADIUS | 34 | base save 0.25 |
| GOALS_TO_WIN | 3 | |
| DOWN_TIME | 5 s | (downed state not implemented yet) |
| DROP_TIME / GOAL_PAUSE | 1.3 / 1.9 s | |
| MOVE tells (spin/cross/deke) | 0.30 / 0.35 / 0.45 s | `core/moves.ts` |
| MOVE bursts (×SpA) | 195 / 260 / 320 | knock 150/210/260, radius 55/65/75 |
| MOVE_COOLDOWN | 1.2 s | + tell + effect |
| PARRY_WINDOW_BASE / PER_SPD | 0.16 / 0.20 s | clamped ≤70% of tell, floor 0.05 |
| PARRY_RANGE | 62 px | defender must be this close |
| COUNTER_BURST | 330 px/s | after a successful parry steal |
| WHIFF_TIME / TUMBLE_TIME | 0.5 / 0.5 s | stagger / tumble anim |
| PERFECT_SHOT_CHARGE / MULT | 0.80 / ×1.18 | goalie white-flash tell in zone |
| CHECK_PUSH / DISLODGE_BASE | 260 px/s / 0.35 | +0.4×Def/100; check CD 1.0 s |
| AI parry base / per SpD | 0.12 / 0.35 | else 0.18 check; juke 0.9/s <110 px |

### Controls (final, per playtest)
- **WASD/arrows** move · **SPACE** pass / switch defender
- **Enter or Shift** hold = charge shoot (≥80% = perfect, Up/Down = corner) /
  **check** (defense, safe push)
- **J/K/L** Spin / Crossover / Deke (offense) · matching **parry** (defense)

---

## Known issues / next tuning work

1. **Offense was too hard vs AI defense** — jukes (separation) + perfect shots
   are now the intended answer; **user playtest pending**. If shots still feel
   stopped: scale the `deriveStats` spread (user's own suggestion), raise
   `FAST_PUCK_SPEED`, shrink `GOALIE_SAVE_RADIUS`/base save, or loosen AI lane
   coverage.
2. **New 1v1 layer is unplaytested** — open tuning questions: parry window
   length (0.16–0.36s), AI parry pressure (12%+35%×SpD), knockback strength
   (defenders flying too far?), check push (260), whether the bright-stick
   phase is a readable window cue. Playtest first, then tune.
3. Sprites load from the network (PokeAPI GitHub mirror); offline dev falls back
   to discs automatically. Bundle the 16 PNGs locally before any real ship.

---

## MVP build order (from DESIGN.md)

1. ✅ Rink + 4v4 movement + carry/pass/switch/shot
2. ✅ Spin (J) + parry (same-key) + check (Enter/Shift on defense) — tell flash,
   parry window (SpD-scaled), whiff stagger, steal
3. ✅ Crossover (K) + Deke (L) + whiff/stagger + steal→counter transition +
   **perfect shot** + **Pokémon sprites** (moved up from step 8) +
   **parry-aware AI** (defenders parry/check; carriers juke)
4. ⬜ **Next gameplay**: HP/down (5 s, full recovery) + check damage +
   stat-driven goalie saves polish
5. ⬜ AI: difficulty ramp, more varied defense
6. ⬜ Shooting stages: goalie dive tells → shot adjust (perfect shot was the
   lightweight first step)
7. ⬜ Campaign (poach, 4-man rosters, gauntlet) + menus
8. ⬜ Polish: sound, more anims, game feel

## Next session (user playtest of the 1v1 layer)

Ask how it feels: (a) are juke tells readable (stick color + bright phase),
(b) is the parry window fair, (c) does the knockback push defenders "behind you"
as intended, (d) is the perfect-shot goalie flash a satisfying tell, (e) do the
sprites read at rink scale (0.44 scale, 96×96). Then tune from the notes above.

## Playtest log

- **Session 1**: display works; stick floating in space (double-offset bug —
  stick was drawn in world coords inside a positioned container → fixed with
  container-local coords); puck orbit (carrier re-aimed facing at puck while
  stopped → keep last travel facing).
- **Session 2**: sticks confirmed fixed ✅. Controls swap (SPACE pass,
  Enter/Shift shoot) confirmed good ✅. Goal-anchored aim "definitely an
  improvement" ✅. Always-pass fix works ✅. **Remaining: shots still stopped by
  defense — offense too hard** (see known issues #1).
- **Session 3**: built the whole 1v1 layer — juke moves J/K/L with
  stick-flash tells (dim→bright parry cue + puck oscillation), same-key parry
  (steal + counter-burst, whiff stagger), safe check (push/dislodge), unparried
  knockback biased behind the carrier, perfect shot (≥80% charge, goalie white
  flash tell, ×1.18, "!"), parry-aware AI (defenders parry/check, carriers
  juke), 96×96 Pokémon sprites with offline fallback, controlled-player arrow +
  ring. `tsc` clean, 9/9 tests pass (new `core/moves.test.ts`), smoke test clean.
- **Session 4 (blank-screen fix)**: user reported blank screen after session 3.
  Root cause: the new **Preloader** queued `load.image` calls in `create()` —
  but Phaser only runs the load step *once*, before `create()`. Files queued
  during create sit in the queue forever, `load.on('complete')` never fires,
  GameScene never starts → silent blank (no console error). Fixed: queue
  sprites in `preload()`, start GameScene from `create()`, plus a 4s
  `setTimeout` failsafe so a *hung* network request can never block the game.
  Also hardened `scripts/smoke.mjs`: it now asserts GameScene is actually
  running and the match reached `live` (the old smoke only checked canvas +
  console errors, which is how the blank slipped through). Verified headlessly:
  scene live, 8 players, 16 sprites, canvas visible, zero errors. Debug hook:
  `window.__game` in main.ts. **User confirmed the game loads and works again**
  (playtest in progress). Game renamed **Ice Pokeyé → Ice Pokéy** (accent on
  first e, no final accent): index.html title + both docs.
