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

### Skill routing (skills are in `.claude/skills`)

Do not skip skill selection for major frontend or visual work.
- Always use `frontend-skill`
- `images-taste-skill` for high-end visual direction or image-first workflows
- `redesign-skill` for improving existing UI
- `taste-skill` or `gpt-tasteskill` for premium implementation
- `output-skill` when completeness matters
<!-- END owner-instructions -->
