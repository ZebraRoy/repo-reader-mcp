import fs from "fs/promises"
import path from "path"
import { resolveRepoReaderConfig } from "./resolve-config.js"

export async function createLocalReference({
  name,
  localPath,
  filesOverride,
}: {
  name?: string
  localPath: string
  filesOverride?: string[]
}) {
  const projectCloneLocation = path.resolve(localPath)

  let stat: import("fs").Stats
  try {
    stat = await fs.stat(projectCloneLocation)
  }
  catch {
    throw new Error(`Local path not found: ${localPath}`)
  }
  if (!stat.isDirectory()) {
    throw new Error(`Local path is not a directory: ${localPath}`)
  }

  const defaultName = name || path.basename(projectCloneLocation)

  let configJson: unknown | null = null
  const configPath = path.join(projectCloneLocation, "repo-reader.config.json")
  try {
    const raw = await fs.readFile(configPath, "utf-8")
    configJson = JSON.parse(raw)
  }
  catch {
    configJson = null
  }

  const config = resolveRepoReaderConfig({
    defaultName,
    configJson,
    filesOverride,
  })

  return {
    projectCloneLocation,
    config,
  }
}

