# Repo Reader MCP

When Large Language Models (LLMs) work with code, they typically have access to the current working repository but lack direct access to external dependencies, such as third-party or internal libraries. This limitation can hinder their ability to understand and utilize code effectively.
Tools like Context7 attempt to address this by providing library content, but they are primarily designed for well-known libraries and may not work efficiently for internal or less common repositories. Additionally, Context7 fetches the entire library content, which can overwhelm an LLM's context window, leading to inefficiencies, increased costs, and potential performance issues.
Repo Reader MCP (Model Context Protocol) is a lightweight solution designed to enable LLMs and agents to access specific, relevant parts of a repository efficiently. By focusing on targeted content delivery, it avoids overloading the context window and supports both public and internal libraries. The protocol consists of two main components:

Repository Configuration (Source Repo):
In the repository you want to make accessible, add a configuration file and optional documentation. This config specifies key entry points, code summaries, or specific chunks of the repo that are most relevant for external agents. You can include API overviews, usage examples, or other descriptive metadata to provide context without exposing the entire repository.
Agent Integration (Consuming Agent):
In the LLM or agent that needs to access the repo, integrate an MCP server by providing the repository's link (e.g., a GitHub URL). The server fetches only the configured, bite-sized content as needed, ensuring efficient use of the context window.

Once configured, the agent can dynamically query and read the repository, enabling seamless interaction with the codebase.

## Repository Configuration

Cursor Mac/Linux:

```json
{
  "mcpServers": {
    "repo-reader-mcp": {
      "command": "npx",
      "args": ["-y", "repo-reader-mcp"]
    }
  }
}
```

Cursor Windows:

```json
{
  "mcpServers": {
    "repo-reader-mcp": {
      "command": "cmd",
      "args": ["/c", "npx", "-y", "repo-reader-mcp"]
    }
  }
}
```

Told LLM to use repo-reader-setup for repository configuration, LLM if ask necessary info to setup.

## Reading Repository

Cursor Mac/Linux:

```json
{
  "mcpServers": {
    "repo-reader-mcp-{name}": {
      "command": "npx",
      "args": [
        "-y",
        "repo-reader-mcp",
        "--name={name}",
        "--repo-path=https://github.com/user/repo"
      ]
    }
  }
}
```

Cursor Windows:

```json
{
  "mcpServers": {
    "repo-reader-mcp-{name}": {
      "command": "cmd",
      "args": [
        "/c",
        "npx",
        "-y",
        "repo-reader-mcp",
        "--name={name}",
        "--repo-path=https://github.com/user/repo"
      ]
    }
  }
}
```

Notes:

- The server dynamically exposes tools using the configured name from `repo-reader.config.json` or the `--name` CLI flag. If neither is set, the tool name defaults to the repository name derived from the URL.
- When no `--repo-path` is provided, only a single tool `repo-reader-setup` is exposed to guide setup.

To access private repositories, you either need direct access or a token.
If you have a token, you can use `--personal-token` or embed the token in the repo URL.

```json
{
  "mcpServers": {
    "repo-reader-mcp-{name}": {
      "command": "npx",
      "args": [
        "-y",
        "repo-reader-mcp",
        "--name={name}",
        "--repo-path=https://github.com/user/repo",
        "--personal-token=your-token"
      ]
    }
  }
}
```

Authentication behavior:

- GitHub HTTPS: inserts token as `https://{token}@github.com/...`
- GitLab HTTPS (including self-hosted): inserts token as `https://oauth2:{token}@...`
- Bitbucket HTTPS: inserts token as `https://x-token-auth:{token}@bitbucket.org/...`
- SSH form `git@host:user/repo.git` is converted to HTTPS and token applied similarly based on host (GitHub/GitLab/Bitbucket or generic self-hosted).

Other arguments:

- `--branch`: Branch to read from. Default: `main`.
- `--clone-location`: Directory to clone into. Default: `${os.homedir()}/.temp-repo`. The full clone path is `${cloneLocation}/{name}`.
- `--files`: Comma-separated glob patterns to override repo config `files` for sparse checkout (e.g., `src/**,README.md,.github/**`).
- `--name`: Override the tool/server name. If omitted, the name derives from repo URL or config.

### Tools exposed when configured

If `--repo-path` is provided (and clone succeeds), the server exposes three tools using the resolved `name`:

- `{name}-menu`: Get a menu of `{name}`. Optional params: `subPath?: string`, `depth?: number` (use `-1` or omit for full depth; default mirrors repo config `depth` or `-1`).
- `{name}-read-file`: Read a file. Params: `filePath: string`, `line?: number`, `range?: number`.
- `{name}-search-file`: Search text across files. Params: `query: string`, `caseSensitive?: boolean`, `wholeWord?: boolean`, `regex?: boolean`.

### Default configuration (no repo-reader.config.json)

If the target repo cannot be modified to add `repo-reader.config.json`, the MCP falls back to a sane default config:

```json
{
  "name": "<derived from repo URL>",
  "files": ["**/*"],
  "depth": -1
}
```

- The MCP attempts to read `repo-reader.config.json` from the target branch; if missing or invalid, defaults are used.
- Default `name` is derived from the repository URL or SSH path (e.g., `git@host:user/repo.git` → `repo`).
- If the file exists but is partial, missing fields are filled with defaults.
