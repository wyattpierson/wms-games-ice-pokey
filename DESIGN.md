# Ice Pokéy — Design Doc

A retro-style 4v4 **hockey** browser game where every player is a Pokémon, with the
**roguelike poach meta** from pokemon-bowl (beat a team → take one of their Pokémon)
and a **fighting-game parry system** layered on top of arcade hockey.

This is a living document. Update as decisions are made.

**Status: IN PRODUCTION** — Step 1 (base hockey loop) + Step 2–3 (jukes, parry,
check, perfect shot, Pokémon sprites, parry-aware AI) built. Current state, run
instructions, and tuning notes live in **PROGRESS.md**.

---

## Elevator pitch

Top-down arcade hockey, Pokémon bodies with real sticks and a real puck. You control
one player at a time — the puck carrier on offense, your best-positioned defender on
defense. Beating a 1v1 is an **action game**: skill moves are "attacks" with visible
tells, defenders **parry** by matching the counter in the window (steal the puck!),
or **check** (block — safer, less reward). Knock opponents down with checks to earn
power plays. Win matches, poach Pokémon, beat the gauntlet.

---

## Base references

- **Retro Bowl control model** (via pokemon-bowl): one active player controlled,
  team-colored sprites, retro pixel look, browser-first keyboard controls.
- **Arcade hockey reference**: Atari 2600 *Ice Hockey* (1977) is the classic:
  top-down rink, ~3v3, you control the player nearest the puck, stick + puck with
  simple physics. (*Air Hockey* (2600, 1975) as the paddle-style ancestor;
  modern JS/CodePen air-hockey demos exist but are 1v1 paddle games — not a great
  base. If nothing better comes up, we port the *Ice Hockey* feel by hand — it's
  simple enough that we don't strictly need a codebase to copy from.)
- **Parry feel reference**: Sekiro/DMC-style — precise counter = big reward (steal +
  counter-attack burst), whiffed parry = punishable stagger, block = safe but passive.

## Core changes from pokemon-bowl

1. **You play both sides** (big difference from pokemon-bowl's offense-only):
   - Offense: you control the **puck carrier**.
   - Defense: you control **one defender** (nearest to puck); the same button used
     for passing on offense **switches** which defender you control on defense.
   - AI: the other 2 field players + goalie on your team, and all 4 on the opponent's
     — and the AI **uses the parry layer too** (implemented): each AI defender
     rolls once per tell (base 0.12 + 0.35×SpD → plan a parry press at a random
     point in the success window, so they genuinely whiff sometimes; else 0.18 →
     plan a check) and shadow-skates behind the carrier so presses are in range.
     AI carriers juke when a defender closes in (per-second chance 0.9 within
     110 px).
2. **Continuous play**, not downs/plays: live clock, possessions change on goals and
   puck drops, no "snap."
3. **The parry layer** (below) replaces tackle/avoidance rolls with a skill-based,
   readable, timing-based 1v1 system.

---

## The parry system (the heart of the game)

### Vocabulary

- **Skill move (offense "attack")**: an animated feint that creates separation.
  Has a **tell phase** (sprite flashes a color, stick animates) then an **effect**
  (speed burst, direction change, etc.).
- **Parry (defense "counter")**: pressing the matching counter key **during the
  tell window**. Success = **steal the puck** + defender gets a counter-attack
  speed burst (transitioning immediately to offense). Failure (wrong key, too
  early, too late) = defender **whiffs**: staggered ~0.5s, open ice.
- **Check (defense "block")**: no timing match needed. Press the check key in
  range. Slows/pushes the carrier, **deals HP damage**, small chance to dislodge
  the puck. Cannot steal, cannot whiff — but has a cooldown and no big reward.
  This is the "block in a fighting game": safe, positional, but you lose if you
  only do this.

**Parry matching (decided): same-key matching** — J counters J, K counters K, L counters L.
Simplest to teach; the color flash tells you which key to press.

### Move list (2 moves + a check — same keys both sides) — **implemented (session 5)**

Cut from 3 moves to **2** (3 was too much to learn at once). Crossover is still
defined in `core/moves.ts` but disabled via `ENABLED_MOVES` in
`config/gameplay.ts` — re-enable by adding it back to that array.

| Key | Offense (skill move) | Base tell | Landed effect | Defense |
|-----|----------------------|-----------|---------------|---------|
| **J** | **Spin** — fast, cheap | 0.30s · orange · **circle** badge | **dash** 720 px/s × SpA for 0.22s (≈100 px), stuns nearby defenders 0.30s | press **J** in the window = parry (steal) |
| **K** | **Deke** — slow, big | 0.50s · yellow · **diamond** badge | **dash** 880 px/s × SpA for 0.28s (≈170 px), bigger knock radius, stuns 0.45s | press **K** in the window = parry (steal) |
| **Enter/Shift** | (shoot) | — | — | **Check = block** (below). Never steals. |

**Offense feel (what changed and why).** The old "burst" was a one-shot velocity
impulse; friction (`exp(-7dt)`) and input blending ate it in ~0.1s, so a juke
moved you ~7px more than just running — the move had no payoff. Now a landed
move is a **dash**: velocity is *held* along the dash direction for the whole
effect phase and eases out (`dashSpeedAt`). You also keep **limited steering
during the wind-up** (`TELL_STEER` = 45% speed), and **the dash goes where you
point at the end of the tell**. A dashing carrier slips through the defenders it
just stunned. A short afterimage trail marks the dash.

**Tell readability (the #1 playtest complaint).** Four layers, none of which
need you to read the busy sprite: (1) colour **glow** on the body; (2) a
**shrinking ring** that lands on a fixed target ring exactly when the tell ends,
with your actual **parry window drawn as a shaded band** — the ring turns white
inside it; (3) a **shape badge** above the carrier (circle = Spin, diamond =
Deke); (4) the **key letter** inside the badge (learning aid, shown below
difficulty level 0.7). A whiff pops up *why*: TOO EARLY / TOO LATE / WRONG MOVE.

**Parry resolution (`core/moves.ts`).** The window is the last
`windowSeconds(tell, parryFrac)` of the tell, where `parryFrac` is
0.35–0.75 (by Special Defense) — a **fraction of the tell**, not seconds clamped
to it (the old clamp made the window *identical* for every Pokémon on Spin /
Crossover). Right key in window = steal + counter-burst + "PARRY!". Early / late /
wrong key = whiff (0.5s stagger). No tell = harmless tap.

**Check = block (`CHECK_*` constants).** Never steals, never whiffs. The defender
plants for 0.55s (moves at 20% speed, cooldown 1.1s) and becomes a **wall**:
opponents can't enter its radius (30–44px by Defense) and lose velocity into it
("blocks forward progress"). A juke that *resolves* within the block's reach
(radius + 32 ≥ the parry range) is **stuffed**: dash cancelled, carrier stunned
0.25–0.55s (by Defense), puck kept. Faint outer ring shows the stuff reach.
Block is the safe, positional answer; parry is the risky, rewarding one.

Design intent:
- **Fast & cheap → slow & rewarding**: Spin is the most readable (shortest, most
  common), Deke is the big gamble (longest tell = easiest to parry, biggest payoff).
- **Color tells are the readability layer** (Pokémon sprites are busy art). The
  flash color + stick animation is what the defender reads; the key to press is
  taught once and always consistent (same key both sides).
- Skill moves have a **cooldown** (so you can't mash) and cost a little
  **stamina** (see below).
- Parry success chance is **not** a coin flip — if you press the right key in the
  window, it succeeds. **SpD scales the window width** (see stat system). This
  keeps it feeling like skill, not RNG. (AI defenders are *honest*: they roll a
  response per tell — parry / block / nothing — aim for the middle of the
  window with timing error, can misread the move, and can't react before a
  reaction time. They whiff, and you can bait it. See "Difficulty".)

### What else is a "attack"?

- **Shots**: shooting is the attack the *goalie* reads (see "Shooting" below).
  Defenders in the lane can also **block shots positionally** (no timing).
- **Passes**: a flying puck. Defenders near the lane can **intercept**
  (position + SpD based, no timing). Intercepts are the "zone control" part of
  defense; timing parries are the 1v1 part.

### Shooting (design direction — implement in stages)

We want the shot to have the same read/react feel as parries, not a plain
"aim and fire." No meter bar (for now); the goalie is the thing you react to:

- **Base (MVP)**: shot speed + power from Attack; goalie save chance from goalie
  SpD + shot speed + how centered the aim is. Positional blocks by defenders in
  the lane. That's it — a shippable dumb goalie.
  - **Goal-anchored aim (implemented)**: shots aim at the goal-mouth center; the
    input's lateral component (Up/Down while charging) adjusts the corner within
    ±`SHOT_SPREAD` (0.5 rad) — most of the range is the net, full hold can still
    go a bit wide. Charging also snaps the carrier's stick toward the goal.
  - **Fast-puck skill contest (implemented)**: pucks faster than `FAST_PUCK_SPEED`
    (350) are no longer auto-grabbable — a grab rolls
    `0.9 + 0.5×puckSense − (speed−350)/700` (clamped 0.12–0.95). A miss = 0.45s
    whiff (can't re-grab that puck). Hard shots vs average defenders can fly past;
    normal passes (~450) are still mostly catchable. (Per user: "if an offensive
    player can shoot harder than a defender can handle, sometimes it goes past them.")
- **Perfect shot (implemented — user's ask)**: release with charge ≥ 80%
  (`PERFECT_SHOT_CHARGE`) → shot speed ×1.18 and a **"!" popup** over the
  shooter. The shooter's tell: the **enemy goalie flashes white** while the
  charge sits in the zone ("let them know with a little white flash"), and the
  charge arc turns white with a tick at the 80% mark. Only user shots qualify
  (AI shoots instantly). This is a lightweight cousin of the stage-1 tells
  below — the goalie telegraphs readiness, and you react by releasing.
- **Stage 1 — goalie tells**: while you hold the charge, after a short delay the
  goalie **flashes a dive direction** (left/right, colored). A shot into the
  flashed side → much higher save chance; the other side → much lower. Skill =
  release timing: a quick tap-shot leaves *before* the tell appears (50/50 save,
  less power) — you trade power for information.
- **Stage 2 — shot adjust (the treat)**: after you release, the goalie flashes
  their dive within ~150ms; while the puck is still near, you get a brief
  **adjust window** to nudge the shot toward the open side. A true action/reaction
  beat mirroring the parry loop; scales with shot speed (faster shot = less time
  to adjust, so Attack power is a real trade-off).
- Later option: a power/accuracy timing element *on top of* the above — only if
  playtests say shots feel like one button.

### Defense fun pillars (we want defense as good as offense)

1. **Positioning to intercept** passes and box out shots (point-man play).
2. **Closing 1v1**: read the flash → parry (jackpot steal + counter-attack) or
   check (safe, chip HP, force them away from the goal).
3. **Risk/reward on the parry**: a confident whiff gives the carrier open ice —
   so you must *commit* to parries, and check is the retreat.
4. **Switching** (same key as pass) to the right defender is itself a skill —
   mirror the offense's passing game on the back end.

### Offense fun pillars

1. **Reading the defender**: an AI (or player) defender who checks often invites
   a deke; a parry-happy defender gets faked out by mashing tells… *but* wrong
   timing gets *you* stolen on, so feints must be real moves, not button spam
   (cooldown + stamina).
2. **Space creation**: moves create separation → open lane → shoot or pass.
3. **The steal transition**: a defender who parries you goes on an immediate
   counter-attack at burst speed — 2-on-1s happen and they should feel amazing.

---

## Controls (decided — bindings isolated in `config/bindings.ts`)

- **Move**: WASD / arrows
- **`SPACE`** — pass (offense, always passes to best teammate; pass is led
  toward where the receiver is skating) · switch controlled defender (defense)
- **`Enter` or `Shift`** (hold) — charge shot; release to shoot (offense) ·
  **check** (defense, step 2)
- **`J` / `K` / `L`** — Spin / Crossover / Deke (offense) · matching parry
  counters (defense)
- Same keys, both sides; context switches meaning by possession.

Decided in playtest: user preferred SPACE for pass/switch and Enter/Shift as the
hold-to-act button (original proposal had these swapped — X/Space).

---

## Stat mapping (user's proposal — adopting, with derived uses)

Pokémon base stats → in-game:

| Pokémon stat | Role | Drives |
|---|---|---|
| **HP** | health | hits from checks before going **down** (see penalties) |
| **Attack** | shot/pass power | shot speed & shot strength vs. goalie, pass speed |
| **Special Attack** | stick skills | skill-move burst size, move cooldown, (small) tell speed |
| **Defense** | checking power | check damage, pushback, dislodge chance, shot blocking |
| **Special Defense** | puck sense | **parry window width**, pass intercept chance, goalie save chance, AI read quality |
| **Speed** | skates | movement speed (everyone) |

**Implemented (session 5):** every mapping goes through `statNorm` (base stat
40→0, 120→1), so the *real* spread of Pokémon stats uses the whole derived range:
speed 150–290 px/s, shot power ×0.75–1.35, skill (dash) ×0.75–1.35, tell speed
×1.10–0.85 (high SpA = snappier = harder to read), parry window 35–75% of the
tell, puck sense 0.2–1.0, check wall 30–44px. (Previously a 50 and a 100 SpD gave
the *same* Spin/Crossover window.) Spread now depends on roster choice too —
placeholder rosters have a narrow Sp.Atk band.

### Difficulty (`config/difficulty.ts`)

One knob, `level` 0..1 (dev: `?level=0.5`; default 0 = slow tutorial pace). It
interpolates: opponent skating speed 0.55→0.95, AI tell length ×1.7→×1.0,
AI reaction 0.60s→0.17s, timing error 0.20s→0.035s, parry/block rates, read
accuracy 50%→95%, AI-carrier juke rate/range/cooldown (jukes *more* at low
levels so you can practise defending), and key-letter hints off at ≥0.7. The
campaign should map "wins so far" onto this. Measured end-to-end (human Spin vs
one AI defender at 45px): level 0 → 4% neutralised, 0.5 → 23%, 1 → ~50%.

Goalies weight SpD/HP/Defense heavily, field players weight Speed/SpA/SpD. Any
Pokémon can play any slot; the slot just changes which stats matter (same pattern
as pokemon-bowl's deriveStats — implement `deriveStats` in pure `core/` with
unit tests, weights tunable).

### HP / down (decided: no penalties)

- Checks damage the carrier (damage scales with checker's Defense).
- HP ≤ 0 → player is **down on the ice for ~2.5s** (tunable): can't act, sits
  there (a moving obstacle to skate around). No shorthanded states, no penalty
  clock.
- After the down, player gets back up (open: full HP immediately vs. slow regen
  for the rest of the match — full HP is simpler, pick in playtest).
- Roguelike hook: **poach screens show current HP** as condition — you can grab a
  star who's been checked into a shell, at your risk.

---

## Match structure (decided)

- **First to 3 goals wins.** Goal = 1 point. **No match clock, no periods,
  no overtime, no ties** — this simplifies the state machine vs pokemon-bowl
  (no MatchClock needed; match state = score + possession).
- After a goal: **puck drop at center face-off dot** — 1v1 start (no full faceoff
  mechanics; the two nearest players just converge, which is itself fun).
- **No simulated opponent drives**: you defend for real (see core changes #1).

## Campaign / meta (port from pokemon-bowl, adjusted for 4-man teams)

- Same gauntlet: 3 regular teams (player picks order) + 1 champion (always
  available, ⚠ nearly impossible), 4-team roster.
- **Roster = 4 Pokémon**: 3 field + 1 goalie. Poach = **swap** (take 1 from the
  beaten team — field or goalie — drop 1 of yours). Champion: no poach.
- Difficulty ramp: reuse `config/campaign.ts` pattern (+N per win, flat champion
  bonus). What the bonus hits: AI speed, AI parry probability, AI check timing.
- Loss = game over (one-shot run). In-memory persistence for MVP.
- Pokémon types: cosmetic (carrying over that decision).

---

## Rendering / "goofy but readable" (answers open question #2)

**Yes, stick + puck layered over Pokémon sprites is very doable in Phaser** (same
stack as pokemon-bowl). Each player is a Container:

```
shadow (team-colored ellipse)
  → stick (drawn: thin shaft + blade, rotated to facing; animates per state)
  → Pokémon sprite (96×96 PokeAPI classic sprite, horizontally flipped by facing,
    walk-bob as in pokemon-bowl, color flashes for tells)
  → (puck, if carrying — small black ellipse at the blade)
```

- The **stick is the readability layer**: it points where you're moving/aiming,
  extends when carrying, swings on shots, sweeps on checks, raises on parries.
  The Pokémon body is flavor on top — goofy is the point.
- The **puck is its own world object** (free, loose, flying, in-net) that snaps
  to the blade of whoever has it. Carry = puck drawn at blade tip; pass/shoot =
  it launches with 2.5D-ish flight (reuse pokemon-bowl's ground-pos vs drawn-pos
  trick if we want a little hop).
- Tells render on the **stick, not the sprite**: during a juke's tell the stick
  flashes the move color — dim flicker early, **bright flash in the second half**
  (the bright phase always contains the parry window), while the blade
  oscillates with the puck (the feint). The busy 96×96 sprite stays clean; the
  stick is the signal. (Implemented.)
- **Controlled-player indicator (implemented)**: a bobbing **yellow arrow** above
  the head + a yellow ring — readable on both offense and defense (the old white
  circle wasn't enough when defending).
- Sprites: 96×96 PokeAPI mirror PNGs loaded in a Preloader scene (implemented;
  offline → placeholder disc). Team-colored shadow/ring under the sprite.
- Risk noted: 96×96 classic sprites are chunky — at 4 players on screen that's
  actually fine (less clutter than 7v7). Zoom ~1.2 like pokemon-bowl.

---

## Tech stack (same as pokemon-bowl — locked by analogy)

- **TypeScript + Vite + Phaser 3**, no Phaser physics (own movement/collision).
- **`core/` never imports Phaser** — pure + unit-tested: parry windows, resolvers
  (check damage, dislodge, intercept, save), stat derivation, campaign state.
- **`gameplay/`** Phaser-aware: rink, player containers (placeholder body+stick,
  sprites later), puck, possession/phase machine, AI, HUD.
- Isolated key bindings in one config map. All tuning numbers in `config/`.

### Proposed architecture pieces (new vs pokemon-bowl)

- `core/parry.ts` — pure model of tell windows: `canParry(tellStart, pressTime, spd)`,
  `resolveParry(...) → steal | whiff | none`. Unit-tested.
- `core/resolvers/shot.ts` — shot power/speed from Attack; goalie save roll
  (SpD, shot speed, aim centering, stage-1 tell side, stage-2 adjust).
- `core/resolvers/check.ts`, `intercept.ts`, `save.ts` — roll logic with stat inputs.
- `gameplay/entities/HockeyPlayer.ts` — sprite + stick + state anims (carry,
  shoot swing, check swing, parry raise, spin/cross/deke animations, down).
- `gameplay/entities/Puck.ts` — states: loose / carried / flying / scored.
- Possession state machine: `drop → live(off|def) → goal → drop`, with clock,
  penalties (shorthanded flag), periods.

### MVP build order (gameplay first, per user)

1. ✅ Rink + 4v4 movement + carry/pass/switch/shot — "can I play a dumb hockey
   game?"
2. ✅ One skill move + one parry + check (J/Spin) — the core risk/reward loop.
3. ✅ Remaining 2 moves (K/L), whiff/stagger, steals → counter-attack transition,
   perfect shot, Pokémon sprites, parry-aware AI (see above).
4. ⬜ **Next gameplay**: HP/down (5s, full recovery), check damage, stamina,
   intercepts.
5. ⬜ AI: difficulty ramp, more varied defense.
6. **Shooting stage 1** (goalie dive tells) → stage 2 (shot adjust) — the
   perfect shot is the lightweight first step; playtest after each stage.
7. Campaign shell (port scenes from pokemon-bowl, 4-man rosters, HP on poach cards).
8. Polish: sound, more anims, game feel.

---

## Known issues / playtest notes (open)

- **Offense was too hard vs the AI defense** (playtest, after goal-anchored aim
  + fast-puck contest): full-charge shots were mostly stopped on a tight rink.
  Jukes (separation → open lane) + perfect shots (×1.18) are now the intended
  answer — **pending user playtest**. If shots still feel stopped:
  1. **Scale player skill** — widen the derived-stat spread (shotPower, puckSense)
     so a good roster genuinely outruns/outranges the defense.
  2. Raise `FAST_PUCK_SPEED` and/or steepen the grab-roll speed penalty.
  3. Goalie: drop `GOALIE_SAVE_RADIUS` (34) and/or the base save chance (0.25).
  4. AI defenders: slower reaction / less perfect lane coverage.
- **Defense is now implemented** (parry/check/juke) — tuning is open: is the
  parry window (0.16–0.36s) fair? Are AI parry rates (base 12% + 35%×SpD) the
  right pressure? User playtest pending.
- **Sprites load over the network** (PokeAPI GitHub mirror). Offline dev →
  placeholder discs automatically. If we ever ship, bundle the 16 sprites
  locally.

## Questions

### Decided (third pass)

- [x] **Controls**: SPACE = pass/switch; Enter/Shift = shoot/check (see Controls
  section — playtest decision, reversed the original proposal).
- [x] **Shot aim**: goal-anchored (goal-mouth center base, Up/Down = corner within
  `SHOT_SPREAD`).
- [x] **Fast-puck grabs are a stat contest** (formula above), not automatic.

### Decided (moves session)

- [x] **Unparried move = knockback**: defenders near the carrier get pushed
  back, biased behind the carrier (per user: "pushed back (maybe behind you)").
- [x] **Parry cue = the stick**: dim→bright phase of the stick flash marks the
  window (bright phase always contains the success window), not a UI meter.
- [x] **Perfect shot**: charge ≥80% → ×1.18 + "!"; the enemy goalie flashing
  white while you hold in the zone is the shooter's tell.
- [x] **Sprites now**: 96×96 PokeAPI per-Pokémon sprites (offline fallback),
  stick stays the readability layer.

### Decided (this pass)

- [x] **Parry matching**: same-key (J↔J, K↔K, L↔L).
- [x] **No penalties**: HP ≤ 0 → downed on the ice ~2.5s, no shorthanded states.
- [x] **Match = first to 3 goals**; goal = 1; no clock/periods/overtime/ties.
- [x] **Shooting**: react-to-the-goalie design (see "Shooting") — base save roll
  first, goalie tells (stage 1) and shot adjust (stage 2) later.

### Decided (second pass)

- [x] **Name**: **Ice Pokéy** (accent on the first e, no accent at the end — corrected in session 4).
- [x] **MVP move list**: start with **2** skill moves (Spin J, Crossover K);
  Deke (L) added later.
- [x] **Downed**: 5 seconds on the ice (tunable), **instant full recovery** on
  stand-up. Adjust later if needed.
- [x] **Goalie**: always AI. After a goalie save the puck is loose and the user
  controls the nearest player to make the pass away (breakout) — covered by the
  nearest-player control rule.
- [x] **Poach**: 1 per beaten team — take 1 (field or goalie), drop 1 of yours.
  (Field↔field, goalie↔goalie; more poaching depth later.)
- [x] **Sprites**: start with **placeholder bodies** (drawn team-colored shapes);
  the stick + puck layering is the priority. Pokémon sprites swap in later (per-
  team single sprite is an acceptable intermediate step).
- [x] **Reference**: port the arcade-hockey feel by hand; if puck feel is off,
  user will hunt for a reference.
