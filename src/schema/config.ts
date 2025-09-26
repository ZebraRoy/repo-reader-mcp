import { z } from "zod"

// Project config read from repo (can be partial); defaults are applied elsewhere
export const RepoReaderConfigSchema = z.object({
  name: z.string().min(1).optional(),
  files: z.array(z.string().min(1)).min(1).optional(),
  depth: z.number().optional(),
})
