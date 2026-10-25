# Agent instructions

Coding conventions live in `.agents/AGENTS.md`. Read the topic file under `.agents/docs/` before changing that area. Do not guess the rules.

## Memory

`.agents/memory.md` is the log of non-obvious issues and the fix that worked.

- Read it before changing the toolchain, build, TypeScript config, Prisma generate path, or test runner.
- After you fix something that would bite the next session, append one short entry. Symptom, cause, fix. Do not rewrite older entries.
- Skip routine edits, style nits, and anything already written down.
- If an entry is stale because the code changed, add a new entry that says so. Do not delete history.
