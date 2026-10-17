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
    gameplay.ts                ALL tuning constants (see below); ENABLED_MOVES
    difficulty.ts              ONE knob (level 0..1) → all AI pace/sharpness numbers
    bindings.ts                EVERY key binding (swap scheme here only)
    teams.ts                   4 teams × 4 Pokémon (names/colors/sprite ID; stats)
  core/                        pure TS, no Phaser, unit-tested
    vec2.ts                    v/add/sub/scale/len/dist/dot/norm/clampLen/lerp/clamp
    stats.ts + stats.test.ts   statNorm, deriveStats(BaseStats) → HockeyStats, check geometry
    moves.ts + moves.test.ts   MOVE_DEFS (tell/dash/knock/stagger/colors), windowSeconds,
                               parryTiming (early/success/late), movePhase, dashSpeedAt
    aiPlan.ts + aiPlan.test.ts how an AI defender answers a tell (parry/block/none, timing
                               error, misreads) + difficulty ramp tests
  gameplay/
    controls.ts                keyboard wrapper (direction/justPressed/held/justReleased)
    ai.ts                      stepAI: goalie / carrier (jukes) / zone / 1v1 defense
                               (executes core/aiPlan plans + pressure blocks) / chase
    entities/
      Rink.ts                  static graphics (boards, lines, dots, creases, nets)
      Player.ts                sprite + stick + ring + arrow; carry/charge/swing/tumble/
                               stagger anims; tell visuals (glow/ring/band/badge);
                               check-stance wall; dash; canStartMove/startMove/whiff
      Puck.ts                  loose/carried/scored; friction, board bounces, scores
  scenes/
    GameScene.ts               whole game loop, input (offense juke / defense
                               parry+check), tryParry/doCheck/applyGuards/finishMove
                               (stuff + dash)/popup, perfect shot, pickup/save, HUD
    scene.sim.test.ts          headless integration tests: REAL scene with a stubbed
                               Phaser (parry, block, stuff, wall, dash, AI ramp)
scripts/smoke.mjs              headless smoke test (errors only, no pixel probes)
```

### Key constants (`src/config/gameplay.ts`)
| Constant | Value | Note |
|---|---|---|
| PLAYER_RADIUS | 15 | GOALIE_RADIUS 18 |
| BASE_SPEED / SPEED_RANGE | 150 / 140 | × `statNorm(speed)` → 150–290 px/s |
| STAT_LO / STAT_HI | 40 / 120 | base stat range mapped onto 0..1 |
| ENABLED_MOVES | spin, deke | crossover built but disabled |
| PASS_SPEED | 470 | × passPower (0.9–1.1) |
| CHARGE_TIME | 0.65 s | |
| SHOT_SPEED_MIN / MAX | 430 / 660 | × shotPower (0.75–1.35) |
| SHOT_SPREAD | 0.5 rad | corner adjust range |
| FAST_PUCK_SPEED | 350 | above → grab is a stat roll |
| SHOOT_RANGE | 290 | AI shot range |
| PICKUP_RADIUS | 30 | +6 for goalies |
| PICKUP_DELAY | 0.3 s | |
| GOALIE_SAVE_RADIUS | 34 | base save 0.25 |
| GOALS_TO_WIN | 3 | |
| DOWN_TIME | 5 s | (downed state not implemented yet) |
| DROP_TIME / GOAL_PAUSE | 1.3 / 1.9 s | |
| MOVE tells (spin/deke) | 0.30 / 0.50 s | × tellMult (SpA 1.10–0.85) × AI difficulty scale; `core/moves.ts` |
| MOVE dash (×skill) | 720 px/s·0.22s / 880 px/s·0.28s | held, eases out (`dashSpeedAt`); knock 260/340, radius 60/85, stun 0.30/0.45 |
| TELL_STEER | 0.45 | speed factor while winding up |
| MOVE_COOLDOWN | 1.2 s | + tell + effect |
| PARRY_FRAC_MIN / MAX | 0.35 / 0.75 | window = fraction of tell by SpD; floor 0.07s |
| PARRY_RANGE | 62 px | defender must be this close |
| COUNTER_BURST | 330 px/s | after a successful parry steal |
| WHIFF_TIME / TUMBLE_TIME | 0.5 / 0.5 s | stagger / tumble anim |
| PERFECT_SHOT_CHARGE / MULT | 0.80 / ×1.18 | goalie white-flash tell in zone |
| CHECK_TIME / COOLDOWN / SLOW | 0.55 s / 1.1 s / 0.2 | check = block stance (never steals) |
| CHECK_RADIUS_BASE / PER_DEF / STUFF_REACH | 30 / 14 / 32 px | wall radius; stuff range = radius + reach (≥ PARRY_RANGE) |
| STUFF_STAGGER_BASE / PER_DEF | 0.25 / 0.30 s | stun on a stuffed carrier |
| AI behaviour | `config/difficulty.ts` | all AI numbers live there (one `level` knob) |

### Controls (final, per playtest)
- **WASD/arrows** move · **SPACE** pass / switch defender
- **Enter or Shift** hold = charge shoot (≥80% = perfect, Up/Down = corner) /
  **check** (defense — a block, never steals)
- **J / K** Spin / Deke (offense, aim with WASD at the end of the tell) ·
  same key = **parry** (defense). L (Crossover) is disabled.
- Dev: `?level=0..1` = AI difficulty (default 0), `?opp=N` = opponent

---

## Known issues / next tuning work

All session-5 changes are **unplaytested** (no browser was available when they
were written; verified by tsc, 35 unit/integration tests, and a headless
simulation of the real scene — which can't judge how things *look*).

1. **Check how the new tell reads** — glow + shrinking ring + window band +
   shape badge + key letter. If still hard to see: bigger ring/badge, or a brief
   time-dilation when a human defender is in range of a tell.
2. **Dash distances** (`core/moves.ts` `dash`/`effect`) — Spin ≈100px, Deke
   ≈170px at skill 1.0 (up to ×1.35). Offense should now feel like a real dash;
   it may be too strong or too weak. Tune `dash`/`effect` first.
3. **Block numbers** — 0.55s stance, 1.1s cooldown, wall 30–44px, stuff stun
   0.25–0.55s. Is it too safe / too weak vs a parry? Is the wall readable?
4. **Difficulty ramp** — level 0 (default) is deliberately slow and forgiving;
   check the pace. `HARD` in `config/difficulty.ts` neutralises ~50% of jukes
   per defender; with 2 defenders close it compounds.
5. **Puck speeds are NOT scaled by difficulty** (only AI skating, tells and
   reactions). If the game still feels too fast, add a puck/pass/shot tempo.
6. **Goalie save formula changed** (`0.15 + 0.7×puckSense − 0.12×speed/max`),
   with wider puckSense spread (0.2–1.0). Watch scoring rates.
7. HP / down / stamina still unimplemented (stats derived, unused).
8. Sprites load from the network (PokeAPI GitHub mirror); bundle the PNGs before ship.

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

## Next session (playtest of session-5 changes)

Ask: (a) can you read the tell now — ring/band/badge/letter — and press in time?
(b) does a landed Spin/Deke feel like a dash worth the wind-up? (c) is block
useful but not dominant over parry? (d) is level 0 a good tutorial pace, and how
fast should it ramp? (e) 2 moves — still too many, or want Crossover back?

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
- **Session 5 (design pass)**: playtest feedback — parry too hard to see, AI
  didn't juke enough to test defense, AI too fast, offense moves felt bad, 3
  moves confusing. Audit found: parry window saturated (identical for all
  Pokémon on Spin/Crossover); AI parries never whiffed and AI never contested a
  non-juking carrier (so jukes were pure risk); the juke "burst" moved you ~7px
  (friction ate it); block range was smaller than parry range at low Defense;
  defender-switch index never reset. Changes: 2 moves (Crossover disabled);
  tells = glow + shrinking ring + window band + shape badge + key letter;
  check → block/wall/stuff (no steal); moves → held dash, steerable wind-up,
  aimed, stuns defenders; stat mappings via `statNorm`; honest AI (`core/aiPlan.ts`:
  timing error, reaction floor, misreads, blocks, pressure-blocks, juke rate);
  one-knob difficulty (`config/difficulty.ts`, `?level=`); AI_SPEED_FACTOR now
  used; SPACE defender pick now sticks. Added `core/aiPlan.ts`,
  `config/difficulty.ts`, `scenes/scene.sim.test.ts` (headless scene sim with a
  stubbed Phaser). `tsc` clean, 35/35 tests, `vite build` OK. **Not run in a
  browser** (sandbox had none) — playtest next.
