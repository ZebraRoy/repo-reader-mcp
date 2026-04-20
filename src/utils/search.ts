import { spawn } from "node:child_process"
import fs from "fs/promises"
import path from "path"
import { listFiles } from "./menu.js"
import { makeTextSearchRegExp, matchesAny, matchesNone } from "./glob.js"

type SearchLine = { path: string, line: number, text: string }
type SearchData = { kind: "files", files: string[] } | { kind: "lines", results: SearchLine[] }

export async function search({
  projectCloneLocation,
  query,
  caseSensitive = false,
  wholeWord = false,
  regex = false,
  baseIncludeGlobs,
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
  baseIncludeGlobs?: string[]
  includeGlobs?: string[]
  excludeGlobs?: string[]
  page?: number
  pageSize?: number
  filesOnly?: boolean
}) {
  const q = query.trim()
  if (q.length === 0) return ""

  const effectivePageSize = typeof pageSize === "number" && pageSize > 0 ? pageSize : undefined
  const effectivePage = typeof page === "number" && page > 0 ? page : 1

  function paginate<T>(items: T[]): T[] {
    if (!effectivePageSize) return items
    const start = (effectivePage - 1) * effectivePageSize
    if (start >= items.length) return []
    return items.slice(start, start + effectivePageSize)
  }

  const { compiled, error } = makeTextSearchRegExp({ query: q, caseSensitive, wholeWord, regex })
  if (error) return error
  if (!compiled) return ""

  const ripgrepData = await tryRipgrepSearch({
    projectCloneLocation,
    query: q,
    caseSensitive,
    wholeWord,
    regex,
    baseIncludeGlobs,
    includeGlobs,
    excludeGlobs,
    filesOnly,
  })
  if (ripgrepData) {
    return formatSearchData({ data: ripgrepData, filesOnly, paginate })
  }

  const fallbackData = await searchByReadingFiles({
    projectCloneLocation,
    compiled,
    baseIncludeGlobs,
    includeGlobs,
    excludeGlobs,
    stopAfterMatchedFiles: effectivePageSize ? effectivePage * effectivePageSize : undefined,
    filesOnly,
  })
  return formatSearchData({ data: fallbackData, filesOnly, paginate })
}

async function tryRipgrepSearch({
  projectCloneLocation,
  query,
  caseSensitive = false,
  wholeWord = false,
  regex = false,
  baseIncludeGlobs,
  includeGlobs,
  excludeGlobs,
  filesOnly,
}: {
  projectCloneLocation: string
  query: string
  caseSensitive?: boolean
  wholeWord?: boolean
  regex?: boolean
  baseIncludeGlobs?: string[]
  includeGlobs?: string[]
  excludeGlobs?: string[]
  filesOnly?: boolean
}): Promise<SearchData | undefined> {
  const args: string[] = [
    "--hidden",
    "--no-ignore",
    "--max-filesize",
    "5M",
  ]

  if (filesOnly) {
    args.push("-l")
  }
  else {
    args.push("-n", "--no-heading", "--color", "never")
  }

  if (!caseSensitive) args.push("-i")
  if (!regex) args.push("-F")
  if (wholeWord) args.push("-w")

  for (const glob of getRipgrepIncludeGlobs(baseIncludeGlobs, includeGlobs)) {
    args.push("-g", glob)
  }
  for (const glob of getRipgrepExcludeGlobs(excludeGlobs)) {
    args.push("-g", `!${glob}`)
  }
  args.push("-e", query, ".")

  let stdout = ""
  let hadStderr = false

  try {
    const exitCode = await new Promise<number>((resolve, reject) => {
      const child = spawn("rg", args, {
        cwd: projectCloneLocation,
        stdio: ["ignore", "pipe", "pipe"],
      })

      child.stdout.setEncoding("utf8")
      child.stderr.setEncoding("utf8")
      child.stdout.on("data", chunk => {
        stdout += chunk
      })
      child.stderr.on("data", () => {
        hadStderr = true
      })
      child.on("error", reject)
      child.on("close", code => resolve(code ?? 1))
    })

    if (exitCode === 1) {
      return filesOnly ? { kind: "files", files: [] } : { kind: "lines", results: [] }
    }
    if (exitCode !== 0) {
      return undefined
    }
  }
  catch {
    return undefined
  }

  if (hadStderr) {
    return undefined
  }

  if (filesOnly) {
    const seen = new Set<string>()
    const files = stdout
      .split(/\r?\n/)
      .map(line => line.trim())
      .map(rel => normalizeSearchPath(rel))
      .filter(Boolean)
      .filter((rel) => {
        if (seen.has(rel)) return false
        if (!isAllowedPath(rel, baseIncludeGlobs, includeGlobs, excludeGlobs)) return false
        seen.add(rel)
        return true
      })
    return { kind: "files", files }
  }

  const results: SearchLine[] = []
  for (const line of stdout.split(/\r?\n/)) {
    if (!line) continue
    const match = /^(.+?):(\d+):(.*)$/.exec(line)
    if (!match) continue
    const rel = normalizeSearchPath(match[1])
    if (!isAllowedPath(rel, baseIncludeGlobs, includeGlobs, excludeGlobs)) continue
    results.push({
      path: rel,
      line: Number(match[2]),
      text: match[3],
    })
  }
  return { kind: "lines", results }
}

async function searchByReadingFiles({
  projectCloneLocation,
  compiled,
  baseIncludeGlobs,
  includeGlobs,
  excludeGlobs,
  stopAfterMatchedFiles,
  filesOnly,
}: {
  projectCloneLocation: string
  compiled: RegExp
  baseIncludeGlobs?: string[]
  includeGlobs?: string[]
  excludeGlobs?: string[]
  stopAfterMatchedFiles?: number
  filesOnly?: boolean
}): Promise<SearchData> {
  const files = await listFiles({ projectCloneLocation, includeGlobs: baseIncludeGlobs })
  files.sort((a, b) => a.localeCompare(b))

  const matchedFiles: string[] = []
  const results: SearchLine[] = []

  for (const rel of files) {
    if (!isAllowedPath(rel, baseIncludeGlobs, includeGlobs, excludeGlobs)) continue

    const abs = path.join(projectCloneLocation, rel)
    let content: string
    try {
      const stat = await fs.stat(abs)
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
        matchedLines.add(i + 1)
      }
    }
    if (matchedLines.size === 0) continue

    matchedFiles.push(rel)

    if (!filesOnly) {
      for (const line of Array.from(matchedLines).sort((a, b) => a - b)) {
        const text = lines[line - 1] ?? ""
        results.push({ path: rel, line, text })
      }
    }

    if (stopAfterMatchedFiles && matchedFiles.length >= stopAfterMatchedFiles) {
      break
    }
  }

  if (filesOnly) {
    return { kind: "files", files: matchedFiles }
  }
  return { kind: "lines", results }
}

function formatSearchData({
  data,
  filesOnly,
  paginate,
}: {
  data: SearchData
  filesOnly?: boolean
  paginate: <T>(items: T[]) => T[]
}) {
  if (filesOnly) {
    const files = data.kind === "files" ? data.files : Array.from(new Set(data.results.map(result => result.path)))
    const pagedFiles = paginate(files.sort((a, b) => a.localeCompare(b)))
    if (pagedFiles.length === 0) return "No results found."
    return pagedFiles.join("\n")
  }

  const results = data.kind === "lines" ? data.results : []
  if (results.length === 0) return "No results found."

  results.sort((a, b) => (a.path === b.path ? a.line - b.line : a.path.localeCompare(b.path)))
  const byPath = new Map<string, Array<{ line: number, text: string }>>()
  for (const result of results) {
    const existing = byPath.get(result.path) ?? []
    existing.push({ line: result.line, text: result.text })
    byPath.set(result.path, existing)
  }

  const sortedEntries: Array<[string, Array<{ line: number, text: string }>]> = Array
    .from(byPath.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
  const pagedEntries = paginate(sortedEntries)
  if (pagedEntries.length === 0) return "No results found."

  const sections: string[] = []
  for (const [filePath, lines] of pagedEntries) {
    lines.sort((a, b) => a.line - b.line)
    const body = lines.map(line => `  ${line.line}:${line.text}`).join("\n")
    sections.push(`${filePath}\n${body}`)
  }
  return sections.join("\n\n")
}

function isAllowedPath(
  rel: string,
  baseIncludeGlobs?: string[],
  includeGlobs?: string[],
  excludeGlobs?: string[],
) {
  return matchesAny(rel, baseIncludeGlobs)
    && matchesAny(rel, includeGlobs)
    && matchesNone(rel, excludeGlobs)
}

function getRipgrepIncludeGlobs(baseIncludeGlobs?: string[], includeGlobs?: string[]) {
  return Array.from(new Set([
    ...(baseIncludeGlobs ?? []),
    ...(includeGlobs ?? []),
  ]))
}

function getRipgrepExcludeGlobs(excludeGlobs?: string[]) {
  return Array.from(new Set([
    ".git/**",
    "**/.git/**",
    "node_modules/**",
    "**/node_modules/**",
    ".DS_Store",
    "**/.DS_Store",
    ...(excludeGlobs ?? []),
  ]))
}

function normalizeSearchPath(rel: string) {
  return rel.replace(/\\/g, "/").replace(/^\.\//, "")
}
