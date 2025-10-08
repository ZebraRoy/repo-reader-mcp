import fs from "fs/promises"
import path from "path"
import { listFiles } from "./menu.js"

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
function globToRegExp(glob: string): RegExp {
  // Normalize path separators to '/'
  const normalized = glob.replace(/\\\\/g, "/")
  // Escape regex special chars, then restore globs
  let pattern = normalized.replace(/[.+^${}()|[\]\\]/g, "\\$&")
  // '**' matches across directories
  pattern = pattern.replace(/\\\*\\\*/g, ".*")
  // '*' matches within a single path segment
  pattern = pattern.replace(/\\\*/g, "[^/]*")
  // '?' matches a single character within a segment
  pattern = pattern.replace(/\\\?/g, "[^/]")
  // Anchor to full string
  return new RegExp(`^${pattern}$`)
}
function matchesAny(filePath: string, patterns?: string[]): boolean {
  if (!patterns || patterns.length === 0) return true
  const posixPath = filePath.replace(/\\\\/g, "/")
  const regs = patterns.map(globToRegExp)
  return regs.some(r => r.test(posixPath))
}
function matchesNone(filePath: string, patterns?: string[]): boolean {
  if (!patterns || patterns.length === 0) return true
  const posixPath = filePath.replace(/\\\\/g, "/")
  const regs = patterns.map(globToRegExp)
  return regs.every(r => !r.test(posixPath))
}
export async function search({
  projectCloneLocation,
  query,
  caseSensitive = false,
  wholeWord = false,
  regex = false,
  includeGlobs,
  excludeGlobs,
  page,
  pageSize,
  filesOnly,
}: {
  projectCloneLocation: string
  query: string
  caseSensitive?: boolean
  wholeWord?: boolean
  regex?: boolean
  includeGlobs?: string[]
  excludeGlobs?: string[]
  page?: number
  pageSize?: number
  filesOnly?: boolean
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
    // Apply include/exclude filters
    if (!matchesAny(rel, includeGlobs)) continue
    if (!matchesNone(rel, excludeGlobs)) continue
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

  // Sort paths for stable output
  const sortedEntries: Array<[string, Array<{ line: number, text: string }>]>
    = Array.from(byPath.entries()).sort((a, b) => a[0].localeCompare(b[0]))

  // Paging defaults
  const effectivePageSize = typeof pageSize === "number" && pageSize > 0 ? pageSize : undefined
  const effectivePage = typeof page === "number" && page > 0 ? page : 1
  function paginate<T>(items: T[]): T[] {
    if (!effectivePageSize) return items
    const start = (effectivePage - 1) * effectivePageSize
    if (start >= items.length) return []
    return items.slice(start, start + effectivePageSize)
  }

  if (filesOnly) {
    const allFiles: string[] = sortedEntries.map(([p]) => p)
    const pagedFiles = paginate(allFiles)
    if (pagedFiles.length === 0) return "No results found."
    return pagedFiles.join("\n")
  }

  const pagedEntries = paginate(sortedEntries)
  if (pagedEntries.length === 0) return "No results found."
  const sections: string[] = []
  for (const [p, lines] of pagedEntries) {
    lines.sort((a, b) => a.line - b.line)
    const body = lines.map(l => `  ${l.line}:${l.text}`).join("\n")
    sections.push(`${p}\n${body}`)
  }
  return sections.join("\n\n")
}
