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
    "repo-reader-mcp": {
      "command": "cmd",
      "args": [
        "/c",
        "npx",
        "-y",
        "repo-reader-mcp",
        "--repo-path=https://github.com/user/repo"
      ]
    }
  }
}
```

To access private repository, you either have access to the repository or you have a token.
If you have a token, you can use argument `--personal-token` or you add the token to the repo path (e.g. `https://<token>@github.com/user/repo`).

```json
{
  "mcpServers": {
    "repo-reader-mcp": {
      "command": "npx",
      "args": [
        "-y",
        "repo-reader-mcp",
        "--repo-path=https://github.com/user/repo",
        "--personal-token=your-token"
      ]
    }
  }
}
```

Other arguments:

- `--branch`: The branch to read from. Default is `main`.
- `--clone-location`: The location to clone the repository. Default is os.homedir() + ".temp-repo". This MCP will clone the repository to `/${cloneLocation}/name`.
