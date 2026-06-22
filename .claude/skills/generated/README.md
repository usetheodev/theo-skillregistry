# `generated/` — staging area, **not a shipped skill**

This directory is the **output target** for skill candidates produced by
[`/skill-writer`](../skill-writer/SKILL.md). It is intentionally empty in the
repository (only a `.gitkeep`); it does **not** contain a `SKILL.md` and is not
itself a skill slice.

## Lifecycle

```
/skill-writer  ──▶  skills/generated/{candidate-name}/   (staging)
                         │
                         ▼
/skill-validator  ──▶  PASS / NEEDS_REVIEW / REJECT
                         │ (PASS)
                         ▼
/skill-register   ──▶  skills/{candidate-name}/           (promoted, shipped)
```

- A candidate skill **must** live at `generated/{candidate-name}/` before it can
  be promoted. `skill-register` refuses to promote from anywhere else
  (see [`skill-register/SKILL.md`](../skill-register/SKILL.md)).
- Promotion is a directory move: `generated/{name}/` → `skills/{name}/`.
- Rollback is the reverse move.

## Why this README exists

Without it, an empty peer directory next to 31 real skill slices reads as a dead
or misplaced folder. It is neither — it is the deliberate, fixed staging path of
the skill-distillation tail of the discover cycle.
