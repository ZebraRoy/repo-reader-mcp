#!/usr/bin/env node

// Simple tester for hierarchyMenu. Usage:
//   node scripts/print-tree.mjs --dir=/path/to/repo [--depth=2]

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
  const { dir, depth } = parseArgs()
  const projectDir = dir ? path.resolve(dir) : process.cwd()

  if (!fs.existsSync(projectDir)) {
    console.error(`Directory not found: ${projectDir}`)
    process.exit(1)
  }

  let hierarchyMenu
  try {
    ; ({ hierarchyMenu } = await import("../dist/utils/menu.js"))
  }
  catch (error) {
    console.error("Failed to load built module. Did you run 'pnpm build'?\n", error)
    process.exit(1)
  }

  const depthNum = typeof depth === "string" && depth.length > 0 ? Number.parseInt(depth, 10) : undefined
  const tree = await hierarchyMenu({ projectCloneLocation: projectDir, depth: Number.isNaN(depthNum) ? undefined : depthNum })
  console.log(tree)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})


