import fs from "fs/promises"
import path from "path"

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

function normalizeSubPath(subPath?: string) {
  if (!subPath) return ""
  let s = subPath.trim()
  // Convert Windows backslashes to POSIX-style slashes
  s = s.replace(/\\/g, "/")
  // Strip Windows drive letters like C:
  s = s.replace(/^[A-Za-z]:/, "")
  // Remove leading and trailing slashes to avoid absolute paths
  s = s.replace(/^\/+/g, "")
  s = s.replace(/\/+$/g, "")
  if (s.length === 0) return ""
  // Remove empty, current dir, and parent dir segments for safety
  const parts = s.split("/")
    .filter(Boolean)
    .filter(seg => seg !== "." && seg !== "..")
  return parts.join(path.sep)
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
    const dir = path.join(projectCloneLocation, normalizeSubPath(subPath))
    const remainingDepth = depth && depth > 0 ? depth : undefined
    const childLines = await buildAsciiTree(dir, "", remainingDepth)
    treeLines = [rootName, ...childLines]
  }
  catch {
    // If reading fails, still return the root
  }
  return treeLines.join("\n")
}
