export const setupInstructionPrompt = `
Goal: Help other projects consume this repo. Focus on public API, install, and examples — not full code browsing.

Create repo-reader.config.json at repository root with:
- name: Repository name (used by the tool)
- files: Glob patterns that surface consumer-facing docs and public exports

Recommended minimal config
\`\`\`json
{
  "name": "my-repo",
  "files": [
    "README.md",
    "docs/**/*.md",
    "docs/**/*.mdx",
    "src/**/*.ts",
    "src/**/*.tsx",
    "src/**/*.js",
    "src/**/*.jsx"
  ]
}
\`\`\`

What to include (prioritize consumer value)
- Getting started and install: README.md, docs/getting-started.md, docs/installation.md
- Usage and examples: docs/usage/**/*, examples/**/*, docs/**/*.{md,mdx}
 - Usage and examples: docs/usage/**/*, examples/**/*, docs/**/*.md, docs/**/*.mdx
- Public API surface: src/index.* (or main entry file), src/**/index.*, files exporting functions/classes/constants, types
- Integration references: configuration snippets (if part of public usage)

What to avoid
- Internal implementation details that don’t affect how consumers use the API
- Generated or build outputs: node_modules/**, dist/**, build/**, .next/**, out/**, coverage/**, vendor/**
- Large media or datasets

Tips
- Keep globs focused on entry points and docs that teach how to import, call, and configure.
- If your public API is re-exported from a few files (e.g., src/index.ts and src/runtime.ts), list those files explicitly.
- Patterns are matched via git sparse-checkout (non-cone mode). Use forward slashes. Globs like ** and *.ext are supported. Brace expansion (e.g., {md,mdx}) is not supported — list each pattern on its own line.
`
