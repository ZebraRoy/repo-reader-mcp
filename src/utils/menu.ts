import fs from "fs/promises"
import path from "path"
import { normalizeOsPath } from "./normalize-path.js"

const DEFAULT_IGNORES = new Set([
  ".git",
  "node_modules",
  ".DS_Store",
])

function shouldIgnore(name: string) {
  return DEFAULT_IGNORES.has(name)
}

async function readDirSorted(dir: string) {
  const dirents = await fs.readdir(dir, { withFileTypes: true })
  const folders = dirents
    .filter(d => d.isDirectory() && !shouldIgnore(d.name))
    .map(d => d.name)
  const files = dirents
    .filter(d => d.isFile() && !shouldIgnore(d.name))
    .map(d => d.name)
  folders.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
  files.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
  return { folders, files }
}

async function buildAsciiTree(
  dir: string,
  prefix: string,
  remainingDepth: number | undefined,
): Promise<string[]> {
  const lines: string[] = []

  const { folders, files } = await readDirSorted(dir)
  const entries = [
    ...folders.map(name => ({ name, kind: "dir" as const })),
    ...files.map(name => ({ name, kind: "file" as const })),
  ]

  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index]
    const isLast = index === entries.length - 1
    const pointer = isLast ? "└── " : "├── "
    const line = `${prefix}${pointer}${entry.name}`
    lines.push(line)

    if (entry.kind === "dir") {
      const nextPrefix = prefix + (isLast ? "    " : "│   ")
      if (remainingDepth === undefined || remainingDepth > 1) {
        const nextDepth = remainingDepth === undefined ? undefined : remainingDepth - 1
        try {
          const childLines = await buildAsciiTree(
            path.join(dir, entry.name),
            nextPrefix,
            nextDepth,
          )
          lines.push(...childLines)
        }
        catch {
          // Ignore directories we cannot read
        }
      }
    }
  }

  return lines
}

export async function hierarchyMenu({
  projectCloneLocation,
  depth,
  subPath,
}: {
  projectCloneLocation: string
  depth?: number
  subPath?: string
}) {
  const rootName = path.basename(path.resolve(projectCloneLocation))
  let treeLines: string[] = [rootName]
  try {
    const dir = path.join(projectCloneLocation, normalizeOsPath(subPath))
    const remainingDepth = depth && depth > 0 ? depth : undefined
    const childLines = await buildAsciiTree(dir, "", remainingDepth)
    treeLines = [rootName, ...childLines]
  }
  catch {
    // If reading fails, still return the root
  }
  return treeLines.join("\n")
}

export async function listFiles({
  projectCloneLocation,
  subPath,
}: {
  projectCloneLocation: string
  subPath?: string
}) {
  const results: string[] = []
  const root = path.resolve(projectCloneLocation)
  const startDir = path.join(projectCloneLocation, normalizeOsPath(subPath))

  async function walk(dir: string): Promise<void> {
    let dirents: import("fs").Dirent[]
    try {
      dirents = await fs.readdir(dir, { withFileTypes: true })
    }
    catch {
      return
    }
    for (const dirent of dirents) {
      const name = dirent.name
      if (shouldIgnore(name)) continue
      const abs = path.join(dir, name)
      if (dirent.isDirectory()) {
        await walk(abs)
      }
      else if (dirent.isFile()) {
        const rel = path.relative(root, abs)
        results.push(rel)
      }
    }
  }

  await walk(startDir)
  return results
}
