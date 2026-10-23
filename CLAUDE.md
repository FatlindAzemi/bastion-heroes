# Bastion Heroes — Agent Instructions

**`docs/spec.md` is the single source of truth for this repository.** Read it before starting any
task and re-read the sections that the current issue names. If this file and `docs/spec.md` ever
disagree, `docs/spec.md` wins. The complete game and build spec is in [`docs/spec.md`](docs/spec.md).

## Rules for the AI agent (spec section 1.1)

1. Read the whole spec once before your first task. Before each later task, re-read the sections
   that task names.
2. Do exactly one milestone task at a time. Never start the next task before the current one meets
   its acceptance criteria.
3. If the spec gives a number, use that number. Do not invent your own values for costs, health,
   damage, speed or timings.
4. If the spec does not answer a question, do NOT guess. Write the question as a comment on the
   GitHub issue, add the label `needs:decision`, and stop work on that part.
5. Never add features that are not in the spec. Extra ideas go into a new GitHub issue labeled
   `idea`.
6. Never change files outside the folder the current task names, unless the task says so.
7. All game numbers live in `src/data/`. Never write a balance number directly into logic code.
8. After every change: run `npm run typecheck`, `npm run lint` and `npm test`. All three must pass
   with zero errors before you commit.
9. For every visual change: start the game in a browser, take a screenshot, look at it, and attach
   it to the pull request.
10. Write all code, comments, commits, issues and docs in English.
11. Keep functions short (under 40 lines). One file = one responsibility. Name things in full words
    (`essenceCost`, not `ec`).
12. If a command fails, read the full error message, fix the cause, and run it again. Do not delete
    tests to make them pass.

## Priority order when rules conflict (spec section 1.2)

1. Safety and not breaking the build
2. `docs/spec.md`
3. The GitHub issue text
4. Your own judgment

## Workflow

Every change goes through the issue → branch → pull request → squash-merge loop of spec section
13.3. Never commit directly to `main`. Work only on the issue you were assigned.
