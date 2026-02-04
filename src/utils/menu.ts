import fs from "fs/promises"
import path from "path"
import { normalizeOsPath } from "./normalize-path.js"
import { matchesAny, matchesNone } from "./glob.js"

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
      if (remainingDepth === undefined || remainingDepth === -1 || remainingDepth > 1) {
        const nextDepth = remainingDepth === undefined || remainingDepth === -1
          ? remainingDepth
          : remainingDepth - 1
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
  includeGlobs,
  excludeGlobs,
}: {
  projectCloneLocation: string
  depth?: number
  subPath?: string
  includeGlobs?: string[]
  excludeGlobs?: string[]
}) {
  const rootName = path.basename(path.resolve(projectCloneLocation))
  let treeLines: string[] = [rootName]
  try {
    const normalizedSubPath = normalizeOsPath(subPath)
    const useFilters = (Array.isArray(includeGlobs) && includeGlobs.length > 0)
      || (Array.isArray(excludeGlobs) && excludeGlobs.length > 0)

    // Interpret depth:
    // - undefined: unlimited
    // - -1: unlimited
    // - n > 0: limit to n levels (1 shows only immediate children)
    // - other values: treat as unlimited
    let remainingDepth: number | undefined = undefined
    if (typeof depth === "number") {
      if (depth === -1) remainingDepth = -1
      else if (depth > 0) remainingDepth = depth
      else remainingDepth = undefined
    }

    if (!useFilters) {
      const dir = path.join(projectCloneLocation, normalizedSubPath)
      const childLines = await buildAsciiTree(dir, "", remainingDepth)
      treeLines = [rootName, ...childLines]
    }
    else {
      const allFiles = await listFiles({
        projectCloneLocation,
        subPath: normalizedSubPath,
        includeGlobs,
        excludeGlobs,
      })
      const filesForTree = normalizedSubPath
        ? allFiles.map(f => path.relative(normalizedSubPath, f))
        : allFiles
      const childLines = buildAsciiTreeFromFileList(filesForTree, remainingDepth)
      treeLines = [rootName, ...childLines]
    }
  }
  catch {
    // If reading fails, still return the root
  }
  return treeLines.join("\n")
}

export async function listFiles({
  projectCloneLocation,
  subPath,
  includeGlobs,
  excludeGlobs,
}: {
  projectCloneLocation: string
  subPath?: string
  includeGlobs?: string[]
  excludeGlobs?: string[]
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
        if (!matchesAny(rel, includeGlobs)) continue
        if (!matchesNone(rel, excludeGlobs)) continue
        results.push(rel)
      }
    }
  }

  await walk(startDir)
  return results
}

function buildAsciiTreeFromFileList(files: string[], remainingDepth: number | undefined): string[] {
  // Convert to POSIX for stable tree building, but output only names
  const toPosix = (p: string) => p.replace(/\\/g, "/").replace(/^\/+/, "")

  type Node = { kind: "dir", children: Map<string, Node> } | { kind: "file" }
  const root: Node = { kind: "dir", children: new Map() }

  for (const file of files) {
    const rel = toPosix(file)
    if (!rel) continue
    const parts = rel.split("/").filter(Boolean)
    let current = root as Extract<Node, { kind: "dir" }>
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      const isLeaf = i === parts.length - 1
      const existing = current.children.get(part)
      if (isLeaf) {
        current.children.set(part, { kind: "file" })
      }
      else if (existing && existing.kind === "dir") {
        current = existing
      }
      else {
        const next: Extract<Node, { kind: "dir" }> = { kind: "dir", children: new Map() }
        current.children.set(part, next)
        current = next
      }
    }
  }

  const lines: string[] = []
  function renderDir(node: Extract<Node, { kind: "dir" }>, prefix: string, depthLeft: number | undefined) {
    const entries = Array.from(node.children.entries())
      .map(([name, child]) => ({ name, child }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))

    for (let idx = 0; idx < entries.length; idx++) {
      const { name, child } = entries[idx]
      const isLast = idx === entries.length - 1
      const pointer = isLast ? "└── " : "├── "
      lines.push(`${prefix}${pointer}${name}`)

      if (child.kind === "dir") {
        const nextPrefix = prefix + (isLast ? "    " : "│   ")
        if (depthLeft === undefined || depthLeft === -1 || depthLeft > 1) {
          const nextDepth = depthLeft === undefined || depthLeft === -1 ? depthLeft : depthLeft - 1
          renderDir(child, nextPrefix, nextDepth)
        }
      }
    }
  }

  renderDir(root as any, "", remainingDepth)
  return lines
}
