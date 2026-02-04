import { RepoReaderConfigSchema } from "../schema/config.js"

export const DEFAULT_CONFIG = {
  name: "repo",
  files: [
    "**/*",
  ],
  depth: -1 as number | undefined,
}

export type ResolvedRepoReaderConfig = {
  name: string
  files: string[]
  depth?: number
}

function cleanGlobPatterns(patterns: string[]): string[] {
  return Array.from(new Set(
    patterns
      .map(p => (typeof p === "string" ? p.trim() : ""))
      .filter(Boolean)
      // normalize to forward slashes because config/docs use them
      .map(p => p.replace(/\\/g, "/")),
  ))
}

export function resolveRepoReaderConfig({
  defaultName,
  configJson,
  filesOverride,
}: {
  defaultName: string
  configJson: unknown | null
  filesOverride?: string[]
}): ResolvedRepoReaderConfig {
  let effective: ResolvedRepoReaderConfig = {
    ...DEFAULT_CONFIG,
    name: defaultName,
  }

  if (configJson) {
    const parsed = RepoReaderConfigSchema.safeParse(configJson)
    if (parsed.success) {
      effective = {
        name: parsed.data.name ?? defaultName,
        files: cleanGlobPatterns((parsed.data.files ?? DEFAULT_CONFIG.files) as string[]),
        depth: parsed.data.depth ?? DEFAULT_CONFIG.depth,
      }
    }
  }

  if (Array.isArray(filesOverride) && filesOverride.length > 0) {
    const cleaned = cleanGlobPatterns(filesOverride)
    if (cleaned.length > 0) {
      effective.files = cleaned
    }
  }

  return effective
}

