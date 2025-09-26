import { z } from "zod"

export const RepoReaderConfigSchema = z.object({
  name: z.string().min(1),
  files: z.array(z.string().min(1)).min(1),
})
