import path from "path"

export function normalizeOsPath(filePath?: string) {
  if (!filePath) return ""
  let s = filePath.trim()
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
