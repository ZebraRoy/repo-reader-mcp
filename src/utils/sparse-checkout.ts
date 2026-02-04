import { simpleGit } from "simple-git"
import os from "os"
import path from "path"
import fs from "fs"
import { resolveRepoReaderConfig } from "./resolve-config.js"

// clone it into user's home directory with project name subfolder
const getCloneDir = (name: string, cloneLocation?: string) => {
  if (cloneLocation) {
    return path.join(cloneLocation, name)
  }
  return path.join(os.homedir(), ".temp-repo", name)
}

// Derive a sensible repository name from a repo URL/path
const deriveRepoName = (input: string): string => {
  if (input.startsWith("git@")) {
    const sshMatch = input.match(/^git@[^:]+:(.+)$/)
    if (sshMatch) {
      const pathPart = sshMatch[1]
      const segments = pathPart.split("/")
      const last = segments[segments.length - 1] || "repo"
      return last.replace(/\.git$/i, "")
    }
  }
  try {
    const url = new URL(input)
    const parts = url.pathname.split("/").filter(Boolean)
    const last = parts[parts.length - 1] || "repo"
    return last.replace(/\.git$/i, "")
  }
  catch {
    const rough = input.split(/[\\/]/).pop() || "repo"
    return rough.replace(/\.git$/i, "")
  }
}

const getAuthenticatedRepoPath = (repoPath: string, personalToken?: string) => {
  let authenticatedRepoPath = repoPath
  if (personalToken) {
    // Handle different git URL formats
    if (repoPath.startsWith("git@")) {
      // SSH URL format: git@hostname:path/repo.git
      // Convert to HTTPS format: https://hostname/path/repo.git
      const sshMatch = repoPath.match(/^git@([^:]+):(.+)$/)
      if (sshMatch) {
        const [, hostname, repoPath] = sshMatch
        // Check if it's a known GitLab instance (including self-hosted)
        if (hostname.includes("gitlab")) {
          authenticatedRepoPath = `https://oauth2:${personalToken}@${hostname}/${repoPath}`
        }
        else if (hostname.includes("github")) {
          authenticatedRepoPath = `https://${personalToken}@${hostname}/${repoPath}`
        }
        else if (hostname.includes("bitbucket")) {
          authenticatedRepoPath = `https://x-token-auth:${personalToken}@${hostname}/${repoPath}`
        }
        else {
          // Generic self-hosted Git server - try GitLab format first (most common for self-hosted)
          authenticatedRepoPath = `https://oauth2:${personalToken}@${hostname}/${repoPath}`
        }
      }
    }
    else if (repoPath.startsWith("https://github.com/")) {
      // GitHub HTTPS URL - insert token
      authenticatedRepoPath = repoPath.replace("https://github.com/", `https://${personalToken}@github.com/`)
    }
    else if (repoPath.startsWith("https://gitlab.com/") || repoPath.includes("gitlab")) {
      // GitLab HTTPS URL (including self-hosted) - insert token
      authenticatedRepoPath = repoPath.replace("https://", `https://oauth2:${personalToken}@`)
    }
    else if (repoPath.startsWith("https://bitbucket.org/")) {
      // Bitbucket HTTPS URL - insert token
      authenticatedRepoPath = repoPath.replace("https://bitbucket.org/", `https://x-token-auth:${personalToken}@bitbucket.org/`)
    }
    else if (repoPath.startsWith("https://")) {
      // Generic HTTPS URL - try GitLab OAuth2 format for self-hosted instances
      authenticatedRepoPath = repoPath.replace("https://", `https://oauth2:${personalToken}@`)
    }
  }
  return authenticatedRepoPath
}

export async function createSparseCheckout({
  name, repoPath, branch, cloneLocation, personalToken, filesOverride,
}: {
  name?: string
  repoPath: string
  branch: string
  cloneLocation?: string
  personalToken?: string
  filesOverride?: string[]
}) {
  // Use project-specific clone location if not explicitly provided
  const effectiveNameForClone = name || deriveRepoName(repoPath)
  const projectCloneLocation = getCloneDir(effectiveNameForClone, cloneLocation)
  const authenticatedRepoPath = getAuthenticatedRepoPath(repoPath, personalToken)

  // Ensure clone directory exists
  if (!fs.existsSync(projectCloneLocation)) {
    fs.mkdirSync(projectCloneLocation, { recursive: true })
  }

  // Initialize git
  const git = simpleGit(projectCloneLocation)

  // Check if repo is already cloned
  const isRepo = await git.checkIsRepo()

  if (!isRepo) {
    // Initialize empty repo
    await git.init()

    // Add remote
    await git.addRemote("origin", authenticatedRepoPath)
  }
  else if (personalToken) {
    const remotes = await git.getRemotes(true)
    const originRemote = remotes.find(remote => remote.name === "origin")
    if (originRemote && originRemote.refs.fetch !== authenticatedRepoPath) {
      await git.removeRemote("origin")
      await git.addRemote("origin", authenticatedRepoPath)
    }
  }

  // Always fetch the target branch shallowly to read config from it
  // If a stale git lock (e.g., shallow.lock) is present from a prior crash,
  // clean it up and retry once.
  try {
    await git.fetch(["--depth", "1", "origin", branch])
  }
  catch (error) {
    const message = (typeof error === "object" && error && "message" in error)
      ? String((error as { message?: unknown }).message)
      : String(error)
    if (message.includes("shallow.lock") || message.includes("File exists")) {
      const shallowLock = path.join(projectCloneLocation, ".git", "shallow.lock")
      try {
        if (fs.existsSync(shallowLock)) {
          fs.rmSync(shallowLock)
        }
      }
      catch {
        // ignore cleanup failure; we'll retry fetch regardless
      }
      // Retry once after cleanup
      await git.fetch(["--depth", "1", "origin", branch])
    }
    else {
      throw error
    }
  }

  // Step 1: try to read repo-reader.config.json from the repo of the branch; fall back to default
  let configRaw: string | null = null
  const defaultName = name || deriveRepoName(repoPath)
  {
    try {
      // Prefer FETCH_HEAD which points to the just-fetched branch tip
      configRaw = await git.raw(["show", `FETCH_HEAD:repo-reader.config.json`])
    }
    catch (_) {
      // Fallback to remote ref notation
      try {
        configRaw = await git.raw(["show", `origin/${branch}:repo-reader.config.json`])
      }
      catch (_error) {
        configRaw = null
      }
    }

    // if configRaw is null, resolveRepoReaderConfig will fall back to defaults
  }

  let configJson: unknown | null = null
  if (configRaw) {
    try {
      configJson = JSON.parse(configRaw)
    }
    catch {
      configJson = null
    }
  }

  const effectiveConfig = resolveRepoReaderConfig({
    defaultName,
    configJson,
    filesOverride,
  })

  const sparsePaths = Array.from(new Set(effectiveConfig.files
    .map(p => (typeof p === "string" ? p.replace(/\\/g, "/") : p))
    .filter(p => typeof p === "string" && p.length > 0))) as string[]

  // Step 2: setup sparse-checkout list based on json
  // Use non-cone mode to allow file-level patterns as well as directories
  await git.raw(["sparse-checkout", "init", "--no-cone"])
  await git.raw(["sparse-checkout", "set", ...sparsePaths])

  // Step 3: checkout the branch and pull latest
  const allBranches = await git.branch()
  const hasLocalBranch = allBranches.all.includes(branch)

  if (!hasLocalBranch) {
    // Create local tracking branch for the remote branch
    await git.checkout(["-b", branch, "--track", `origin/${branch}`])
  }
  else {
    await git.checkout(branch)
  }

  // Ensure local branch exactly matches remote tip (avoids non-FF failures)
  await git.fetch(["--depth", "1", "origin", branch])
  await git.reset(["--hard", `origin/${branch}`])

  return {
    projectCloneLocation,
    config: effectiveConfig,
  }
}
