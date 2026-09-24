# No frontmatter

This SKILL.md file deliberately has no YAML frontmatter block at all — it should make
`loadSkill`/`listSkills` throw instead of silently treating the whole file as a body.
