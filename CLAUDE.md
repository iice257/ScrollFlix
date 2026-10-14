@AGENTS.md

<!-- BEGIN owner-instructions (managed; edit in iice257/claude-config) -->
## Owner instructions for Claude Code

These apply in every session in this repo, including cloud sessions.

- **AGENTS.md:** if this repo has an `AGENTS.md`, follow it as you would this file.
- **Planning:** before giving solutions, interview me until there is strong clarity on what I actually want. Use AI-led questioning to reduce vague goals and failed projects.
- **Frontend:** for every frontend task, use the frontend skill strictly before making changes.
- **Quality bar:** deliver polished, production-grade UI. Prioritize spacing, hierarchy, alignment, typography, balance, responsiveness, and component cohesion. Avoid generic, clunky, boxy, crowded, inconsistent, or outdated UI. No "developer-looking" output.
- **Execution:** first analyze the existing UI, design system, spacing, typography, colors, and components. Preserve structure and product direction unless explicitly told otherwise. Improve layout, spacing, typography, alignment, proportions, and consistency without unnecessary redesigns. Reuse components where possible, refine when needed.
- **Design standards:** use a consistent spacing rhythm, a strong typography scale, fewer but better elements, clean composition, proper whitespace, and aligned layouts. Both mobile and desktop should feel intentional.
- **References:** treat screenshots and mocks as the source of truth. Match spacing, alignment, sizing, typography, density, and composition closely.
- **Self-review:** before finalizing, make sure the UI is modern, balanced, consistent, and production-ready. If anything feels awkward, dense, plain, or dated, refine it.
- **Housekeeping:** work cleanly and leave no litter. If you create a branch, delete it (local and remote) once it is merged. Remove worktree folders when you are done with them (`git worktree remove`, then `git worktree prune`). No duplicate copies, scratch clones or stray folders left lying around.
- **Instruction-file sync:** when a local `CLAUDE.md` or `AGENTS.md` changes, carry the change to every repo that has the file both locally and on GitHub. Don't spend tokens doing it by hand: edit the source (`home/CLAUDE.md` / `repo-sync/claude-block.md` in the `claude-config` repo, plus the live global files), then run `python repo-sync/push_all.py` once. It batch-pushes straight to each repo's default branch (no PR, single-file change) and fast-forwards clean local checkouts.

### Skill routing (skills are in `.claude/skills`)

Do not skip skill selection for major frontend or visual work.
- Always use `frontend-skill`
- `images-taste-skill` for high-end visual direction or image-first workflows
- `redesign-skill` for improving existing UI
- `taste-skill` or `gpt-tasteskill` for premium implementation
- `output-skill` when completeness matters
<!-- END owner-instructions -->
