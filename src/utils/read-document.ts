import path from "path"
import fs from "fs/promises"
import { normalizeOsPath } from "./normalize-path.js"
import { listFiles } from "./menu.js"
import { matchesAny, matchesNone } from "./glob.js"

export async function readDocument({
  projectCloneLocation,
  filePath,
  line,
  range,
  includeGlobs,
  excludeGlobs,
}: {
  projectCloneLocation: string
  filePath: string
  line?: number
  range?: number
  includeGlobs?: string[]
  excludeGlobs?: string[]
}) {
  const normalizedInput = normalizeOsPath(filePath)
  const directPath = path.join(projectCloneLocation, normalizedInput)

  // 1) Try direct read first if it exists and is a file
  try {
    const stat = await fs.stat(directPath)
    if (stat.isFile()) {
      const rel = path.relative(projectCloneLocation, directPath)
      if (!matchesAny(rel, includeGlobs) || !matchesNone(rel, excludeGlobs)) {
        throw new Error(`File not allowed by configured globs: ${filePath}`)
      }
      const content = await fs.readFile(directPath, "utf-8")
      return maybeSlice(content, line, range)
    }
  }
  catch {
    // fall through to search by filename
  }

  // 2) Search for a unique match by filename (optionally without extension) using menu's file listing
  function stripExtension(p: string) {
    const parsed = path.parse(p)
    return path.join(parsed.dir, parsed.name)
  }

  const inputHasPath = normalizedInput.includes(path.sep)
  const inputBase = path.basename(normalizedInput)
  const inputBaseNoExt = path.parse(inputBase).name
  const inputPathNoExt = stripExtension(normalizedInput)

  const files = await listFiles({ projectCloneLocation, includeGlobs, excludeGlobs })
  const candidates = new Set<string>()

  for (const rel of files) {
    const relNoExt = stripExtension(rel)
    const name = path.basename(rel)
    if (inputHasPath) {
      if (rel === normalizedInput || relNoExt === inputPathNoExt) {
        candidates.add(path.join(projectCloneLocation, rel))
      }
    }
    else {
      if (name === inputBase || path.parse(name).name === inputBaseNoExt) {
        candidates.add(path.join(projectCloneLocation, rel))
      }
    }
  }

  if (candidates.size === 0) {
    throw new Error(`File not found: ${filePath}`)
  }
  if (candidates.size > 1) {
    const list = Array.from(candidates)
      .map(p => path.relative(projectCloneLocation, p))
      .sort()
      .slice(0, 10)
      .join("\n - ")
    throw new Error(
      `Ambiguous file reference: ${filePath}. Found ${candidates.size} matches. Examples:\n - ${list}`,
    )
  }

  const [only] = Array.from(candidates)
  const content = await fs.readFile(only, "utf-8")
  return maybeSlice(content, line, range)
}

function maybeSlice(content: string, line?: number, range?: number) {
  if (!line) return content
  const lines = content.split(/\r?\n/)
  const target = Math.max(1, Math.min(lines.length, Math.floor(line)))
  const r = Math.max(0, Number.isFinite(range as number) ? Math.floor(range as number) : 3)
  const start = Math.max(1, target - r)
  const end = Math.min(lines.length, target + r)
  const slice = lines.slice(start - 1, end).join("\n")
  const header = `Lines ${start}-${end} of ${lines.length} (target ${target}, range ${r})\n`
  return header + slice
}
