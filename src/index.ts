#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { createSparseCheckout } from "./utils/sparse-checkout.js"
import { setupInstructionPrompt } from "./prompt/setup-instruction-prompt.js"
import { hierarchyMenu } from "./utils/menu.js"
import z from "zod"

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

async function createServer(args: Record<string, string>) {
  const name = args["name"]
  const repoPath = args["repo-path"]
  const personalToken = args["personal-token"]
  const branch = args["branch"] || "main"
  const cloneLocation = args["clone-location"]
  const server = new McpServer({
    name: "repo-reader-mcp",
    version: "0.1.0",
    description: "Repo Reader MCP",
  })
  if (repoPath) {
    const { projectCloneLocation, config } = await createSparseCheckout({
      name,
      repoPath,
      branch,
      cloneLocation,
      personalToken,
    })
    const toolName = config.name
    server.tool(`${toolName}-menu`, `Get a menu of ${toolName}. Use it to understand the structure of ${toolName}.`, {
      subPath: z.string().optional().describe("Only show the menu of the sub path. Use it when you found the whole menu is too long."),
      depth: z.number().optional().describe("The depth of the menu. Only pass it when you found the whole menu is too long."),
    }, async ({ subPath, depth }) => {
      const tree = await hierarchyMenu({
        projectCloneLocation: projectCloneLocation,
        depth,
        subPath,
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
