import fs from "fs/promises"
import path from "path"
import { listFiles } from "./menu.js"

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
export async function search({
  projectCloneLocation,
  query,
  caseSensitive = false,
  wholeWord = false,
  regex = false,
}: {
  projectCloneLocation: string
  query: string
  caseSensitive?: boolean
  wholeWord?: boolean
  regex?: boolean
}) {
  const q = query.trim()
  if (q.length === 0) return ""

  // Build matcher
  let pattern = q
  let flags = "g"
  if (!caseSensitive) flags += "i"
  if (!regex) {
    pattern = escapeRegExp(pattern)
  }
  if (wholeWord) {
    pattern = `\\b(?:${pattern})\\b`
  }
  let compiled: RegExp
  try {
    compiled = new RegExp(pattern, flags)
  }
  catch (error) {
    return `Invalid regular expression: ${(error as Error).message}`
  }

  const files = await listFiles({ projectCloneLocation })
  const results: Array<{ path: string, line: number, text: string }> = []

  for (const rel of files) {
    const abs = path.join(projectCloneLocation, rel)
    let content: string
    try {
      const stat = await fs.stat(abs)
      // Skip very large files (> 5 MB)
      if (stat.size > 5 * 1024 * 1024) continue
      content = await fs.readFile(abs, "utf-8")
    }
    catch {
      continue
    }

    const lines = content.split(/\r?\n/)
    const matchedLines = new Set<number>()

    for (let i = 0; i < lines.length; i++) {
      const lineText = lines[i]
      compiled.lastIndex = 0
      if (compiled.test(lineText)) {
        matchedLines.add(i + 1) // 1-based
      }
    }
    if (matchedLines.size === 0) continue

    for (const line of Array.from(matchedLines).sort((a, b) => a - b)) {
      const text = lines[line - 1] ?? ""
      results.push({ path: rel, line, text })
    }
  }

  if (results.length === 0) return "No results found."

  results.sort((a, b) => (a.path === b.path ? a.line - b.line : a.path.localeCompare(b.path)))
  const byPath = new Map<string, Array<{ line: number, text: string }>>()
  for (const r of results) {
    const arr = byPath.get(r.path) ?? []
    arr.push({ line: r.line, text: r.text })
    byPath.set(r.path, arr)
  }
  const sections: string[] = []
  for (const [p, lines] of Array.from(byPath.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
    lines.sort((a, b) => a.line - b.line)
    const body = lines.map(l => `  ${l.line}:${l.text}`).join("\n")
    sections.push(`${p}\n${body}`)
  }
  return sections.join("\n\n")
}
