#!/usr/bin/env node

// Simple tester for search(). Usage:
//   pnpm build && node scripts/test-search.mjs --dir=/path/to/repo --query="Foo AND (Bar OR Baz)"
// Or via package script:
//   pnpm test-search -- --dir=. --query="Foo AND (Bar OR Baz)"

import path from "node:path"
import fs from "node:fs"

function parseArgs() {
  const args = process.argv.slice(2)
  const parsed = {}
  for (const arg of args) {
    if (arg.startsWith("--")) {
      const [key, value] = arg.substring(2).split("=")
      if (key) parsed[key] = value ?? ""
    }
  }
  return parsed
}

async function main() {
  const { dir, query, caseSensitive, wholeWord, regex, include, exclude, page, pageSize, filesOnly } = parseArgs()
  const projectDir = dir ? path.resolve(dir) : process.cwd()

  if (!fs.existsSync(projectDir)) {
    console.error(`Directory not found: ${projectDir}`)
    process.exit(1)
  }
  if (!query || query.trim().length === 0) {
    console.error("Missing --query. Example: --query=\"Foo AND (Bar OR Baz)\"")
    process.exit(1)
  }

  let search
  try {
    ; ({ search } = await import("../dist/utils/search.js"))
  }
  catch (error) {
    console.error("Failed to load built module. Did you run 'pnpm build'?\n", error)
    process.exit(1)
  }

  const output = await search({
    projectCloneLocation: projectDir,
    query,
    caseSensitive: caseSensitive === "true" || caseSensitive === "1",
    wholeWord: wholeWord === "true" || wholeWord === "1",
    regex: regex === "true" || regex === "1",
    includeGlobs: typeof include === "string" && include.length > 0 ? include.split(",").map(s => s.trim()).filter(Boolean) : undefined,
    excludeGlobs: typeof exclude === "string" && exclude.length > 0 ? exclude.split(",").map(s => s.trim()).filter(Boolean) : undefined,
    page: page ? Number(page) : undefined,
    pageSize: pageSize ? Number(pageSize) : undefined,
    filesOnly: filesOnly === "true" || filesOnly === "1",
  })
  console.log(output)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
