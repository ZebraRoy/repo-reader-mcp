function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

export function globToRegExp(glob: string): RegExp {
  // Normalize path separators to '/'
  const normalized = glob.replace(/\\\\/g, "/")
  // Escape regex special chars, then restore globs
  let pattern = escapeRegExp(normalized)
  // '**' matches across directories
  pattern = pattern.replace(/\\\*\\\*/g, ".*")
  // '*' matches within a single path segment
  pattern = pattern.replace(/\\\*/g, "[^/]*")
  // '?' matches a single character within a segment
  pattern = pattern.replace(/\\\?/g, "[^/]")
  // Anchor to full string
  return new RegExp(`^${pattern}$`)
}

export function matchesAny(filePath: string, patterns?: string[]): boolean {
  if (!patterns || patterns.length === 0) return true
  const posixPath = filePath.replace(/\\\\/g, "/")
  const regs = patterns.map(globToRegExp)
  return regs.some(r => r.test(posixPath))
}

export function matchesNone(filePath: string, patterns?: string[]): boolean {
  if (!patterns || patterns.length === 0) return true
  const posixPath = filePath.replace(/\\\\/g, "/")
  const regs = patterns.map(globToRegExp)
  return regs.every(r => !r.test(posixPath))
}

export function makeTextSearchRegExp({
  query,
  caseSensitive = false,
  wholeWord = false,
  regex = false,
}: {
  query: string
  caseSensitive?: boolean
  wholeWord?: boolean
  regex?: boolean
}): { compiled?: RegExp, error?: string } {
  const q = query.trim()
  if (q.length === 0) return { compiled: undefined }

  let pattern = q
  let flags = "g"
  if (!caseSensitive) flags += "i"
  if (!regex) pattern = escapeRegExp(pattern)
  if (wholeWord) pattern = `\\b(?:${pattern})\\b`

  try {
    return { compiled: new RegExp(pattern, flags) }
  }
  catch (error) {
    return { error: `Invalid regular expression: ${(error as Error).message}` }
  }
}
