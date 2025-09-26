import path from "path"
import fs from "fs/promises"
import { normalizeOsPath } from "./normalize-path.js"
import { listFiles } from "./menu.js"

export async function readDocument({
  projectCloneLocation,
  filePath,
}: {
  projectCloneLocation: string
  filePath: string
}) {
  const normalizedInput = normalizeOsPath(filePath)
  const directPath = path.join(projectCloneLocation, normalizedInput)

  // 1) Try direct read first if it exists and is a file
  try {
    const stat = await fs.stat(directPath)
    if (stat.isFile()) {
      return await fs.readFile(directPath, "utf-8")
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

  const files = await listFiles({ projectCloneLocation })
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
  return await fs.readFile(only, "utf-8")
}
