#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { createSparseCheckout } from "./utils/sparse-checkout.js"
import { setupInstructionPrompt } from "./prompt/setup-instruction-prompt.js"
import { hierarchyMenu } from "./utils/menu.js"
import z from "zod"
import { readDocument } from "./utils/read-document.js"
import { search } from "./utils/search.js"
import { createLocalReference } from "./utils/local-reference.js"

// Parse command-line arguments
function parseArgs() {
  const args = process.argv.slice(2)
  const parsedArgs: Record<string, string> = {}

  args.forEach((arg) => {
    if (arg.startsWith("--")) {
      const [key, value] = arg.substring(2).split("=")
      if (key && value) {
        parsedArgs[key] = value
      }
    }
  })

  return parsedArgs
}

function getDefaultDepth(config: { depth?: number }) {
  return config.depth ?? -1
}

async function createServer(args: Record<string, string>) {
  const name = args["name"]
  const repoPath = args["repo-path"]
  const localPath = args["local-path"]
  const personalToken = args["personal-token"]
  const branch = args["branch"] || "main"
  const cloneLocation = args["clone-location"]
  const filesArg = args["files"]
  const filesOverride = filesArg ? filesArg.split(",").map(s => s.trim()).filter(Boolean) : undefined
  const server = new McpServer({
    name: "repo-reader-mcp",
    version: "0.1.0",
    description: "Repo Reader MCP",
  })
  if (repoPath && localPath) {
    throw new Error("Provide only one of --repo-path or --local-path.")
  }

  if (repoPath || localPath) {
    const resolved = repoPath
      ? await createSparseCheckout({
          name,
          repoPath,
          branch,
          cloneLocation,
          personalToken,
          filesOverride,
        })
      : await createLocalReference({
          name,
          localPath: localPath!,
          filesOverride,
        })
    const { projectCloneLocation, config } = resolved
    const toolName = config.name
    server.tool(`${toolName}-menu`, `Get a menu of ${toolName}. Use it to understand the structure of ${toolName}.`, {
      subPath: z.string().optional().describe("Only show the menu of the sub path. Use it when you found the whole menu is too long."),
      depth: z.number().optional().describe(`Menu depth. Use -1 or omit for full depth (all). Defaults is ${getDefaultDepth(config)}.`),
    }, async ({ subPath, depth }) => {
      const effectiveDepth = depth ?? config.depth
      const tree = await hierarchyMenu({
        projectCloneLocation: projectCloneLocation,
        subPath,
        depth: effectiveDepth,
        includeGlobs: config.files,
      })
      return {
        content: [
          {
            type: "text",
            text: tree,
          },
        ],
      }
    })
    server.tool(`${toolName}-read-file`, `Read a file of ${toolName}`, {
      filePath: z.string().describe("The path of the file to read. You can use the menu to get the path. If the filename is unique, you can use the filename instead of the path."),
      line: z.number().optional().describe("Specific line number to retrieve (1-indexed). Only pass this parameter if you only need to see a few lines of the file, often used when you want to find all files that contain a specific keyword."),
      range: z.number().optional().describe("Number of lines before and after the target line to include (default: 3). Increase this number if you want to see more context."),
    }, async ({ filePath, line, range = 3 }) => {
      const file = await readDocument({
        projectCloneLocation: projectCloneLocation,
        filePath,
        line,
        range,
        includeGlobs: config.files,
      })
      return {
        content: [
          { type: "text", text: file },
        ],
      }
    })
    server.tool(`${toolName}-search-file`, `Search text across files in ${toolName}`, {
      query: z.string().describe("Search query. Supports plain text or regex if regex=true."),
      caseSensitive: z.boolean().optional().describe("Whether the search is case sensitive. Default false."),
      wholeWord: z.boolean().optional().describe("Match whole word only. Default false."),
      regex: z.boolean().optional().describe("Treat query as regular expression. Default false."),
      includeGlobs: z.array(z.string()).optional().describe("Only include files matching these glob patterns (e.g., ['src/**','README.md'])."),
      excludeGlobs: z.array(z.string()).optional().describe("Exclude files matching these glob patterns (e.g., ['**/*.min.js','dist/**'])."),
      page: z.number().optional().describe("1-based page number when paging results or files list."),
      pageSize: z.number().optional().describe("Items per page when paging results (paths if filesOnly=true)."),
      filesOnly: z.boolean().optional().describe("Show only the file paths that have matches, one per line."),
    }, async ({ query, caseSensitive, wholeWord, regex, includeGlobs, excludeGlobs, page, pageSize, filesOnly }) => {
      const searchResult = await search({
        projectCloneLocation: projectCloneLocation,
        query,
        caseSensitive,
        wholeWord,
        regex,
        baseIncludeGlobs: config.files,
        includeGlobs,
        excludeGlobs,
        page,
        pageSize,
        filesOnly,
      })
      return {
        content: [
          { type: "text", text: searchResult },
        ],
      }
    })
  }
  else {
    server.tool("repo-reader-setup", "Setup the repo reader", async () => {
      return {
        content: [
          {
            type: "text",
            text: setupInstructionPrompt,
          },
        ],
      }
    })
  }

  return server
}

async function main() {
  const args = parseArgs()
  const transport = new StdioServerTransport()
  const server = await createServer(args)
  await server?.connect(transport)
}

main()
  .catch((error) => {
    console.error("Fatal error in main():", error)
    process.exit(1)
  })
