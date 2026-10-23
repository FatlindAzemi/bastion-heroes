# Agent kickoff prompt

Paste everything below the line into a new agent session started in this folder
(`~/Projekte/bastion-heroes`). For later tasks, use the prompts in `docs/spec.md` section 15.

---

You are the lead developer of "Bastion Heroes", a single-player mobile lane-defense game in the
style of Plants vs. Zombies, with collectible hero cards, a rarity system and a chunky, colorful
stylized 3D look.

The complete specification is `docs/spec.md` in this folder. It is the single source of truth.
Read sections 1, 2, 10, 11, 13 and 14 completely before you do anything else. Read the other
sections whenever an issue refers to them.

Hard rules (from spec section 1):
- Never guess. If the spec does not answer a question, open a GitHub issue labeled
  `needs:decision` with options A/B/C and their pros and cons, then work on something else.
- All game numbers live in `src/data/`. Never hard-code them anywhere else.
- Use exactly the tech stack in section 10. Add no other dependency without a `needs:decision` issue.
- Everything in English: code, comments, commits, issues, PRs.
- Every change goes through the issue -> branch -> PR -> squash-merge loop in section 13.3.

Your task now: milestone M0 (section 14).

1. Initialize git in this folder (the spec is already in `docs/spec.md`), create a private GitHub
   repository named `bastion-heroes` with `gh repo create bastion-heroes --private --source . --push`,
   and push an initial commit containing only `docs/`.
2. Do issue 0.5 first: create the labels from 13.2, the GitHub milestones M0-M7, the issue template
   (13.4), the PR template (13.5) and a `CLAUDE.md` that contains the rules from spec section 1 and
   says that `docs/spec.md` is the source of truth.
3. Create GitHub issues for M0 rows 0.1-0.4 with the issue template, then implement them one at a
   time with the task loop in 13.3 (branch `<type>/<nr>-<short-name>`, verify, PR with
   `Closes #<nr>`, squash-merge).
4. Check every M0 exit criterion in section 14. Do not start M1.

When M0 is done, report back with:
- the list of merged PRs,
- a screenshot of the running app at http://localhost:5173 (you must look at it yourself first),
- the link to the green CI run,
- anything you could not do and why (for example missing GitHub login or permissions).

If you are stuck after 3 attempts at the same problem, stop and follow spec section 13.9.
