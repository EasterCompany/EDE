import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { execSync } from "node:child_process";

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "search",
    label: "Search",
    description:
      "Search file contents using ripgrep. Supports regex patterns, file type filtering, " +
      "path scoping, and configurable context lines. " +
      "Returns structured results with file paths, line numbers, and highlighted matches.",
    promptSnippet: "Search file contents with regex patterns",
    promptGuidelines: [
      "Use search instead of bash+grep when searching file contents — it returns structured results with file paths and line numbers.",
      "For regex patterns, use Rust regex syntax (what ripgrep supports).",
    ],
    parameters: Type.Object({
      pattern: Type.String({
        description: "Search pattern (regex supported, Rust regex syntax via ripgrep).",
      }),
      path: Type.Optional(
        Type.String({
          description: "Directory or file to search in. Defaults to current working directory.",
        })
      ),
      fileType: Type.Optional(
        Type.String({
          description:
            "File type filter (e.g. 'rs' for Rust, 'ts' for TypeScript, 'md' for markdown, 'json', 'toml', 'py', 'js'). " +
            "Uses ripgrep's --type flag. See `rg --type-list` for all options.",
        })
      ),
      contextLines: Type.Optional(
        Type.Number({
          description: "Number of context lines before and after each match (default: 2).",
        })
      ),
      maxResults: Type.Optional(
        Type.Number({
          description: "Maximum number of matches to return (default: 50). Set to 0 for unlimited.",
        })
      ),
      fixedString: Type.Optional(
        Type.Boolean({
          description: "Treat pattern as a fixed string instead of regex (default: false).",
        })
      ),
      glob: Type.Optional(
        Type.String({
          description: "Additional glob filter, e.g. '!*test*' to exclude test files.",
        })
      ),
    }),
    required: ["pattern"],

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const {
        pattern,
        path,
        fileType,
        contextLines = 2,
        maxResults = 50,
        fixedString = false,
        glob,
      } = params as {
        pattern: string;
        path?: string;
        fileType?: string;
        contextLines?: number;
        maxResults?: number;
        fixedString?: boolean;
        glob?: string;
      };

      // Check if ripgrep is available
      try {
        execSync("rg --version", { stdio: "ignore" });
      } catch {
        return {
          content: [
            {
              type: "text",
              text: "❌ `rg` (ripgrep) is not installed. Install it with your package manager.\n\n```bash\n# Debian/Ubuntu\nsudo apt-get install ripgrep\n\n# macOS\nbrew install ripgrep\n\n# Arch\nsudo pacman -S ripgrep\n```",
            },
          ],
          isError: true,
          details: { error: "ripgrep not found" },
        };
      }

      const searchPath = path || ctx.cwd;

      // Build rg arguments
      const args: string[] = ["--json", "--line-number", "--color", "never"];

      if (contextLines > 0) {
        args.push("--context", String(contextLines));
      }

      if (fileType) {
        args.push("--type", fileType);
      }

      if (fixedString) {
        args.push("--fixed-strings");
      }

      if (glob) {
        args.push("--glob", glob);
      }

      if (maxResults > 0) {
        args.push("--max-count", String(maxResults));
      }

      // Add smart filtering — skip common binary/vendor dirs
      args.push("--glob", "!.git");
      args.push("--glob", "!node_modules");
      args.push("--glob", "!target");
      args.push("--glob", "!.next");
      args.push("--glob", "!dist");
      args.push("--glob", "!build");
      args.push("--glob", "!.venv");
      args.push("--glob", "!venv");
      args.push("--glob", "!__pycache__");

      args.push("--", pattern, searchPath);

      try {
        const output = execSync(`rg ${args.map(a => `'${a.replace(/'/g, "'\\''")}'`).join(" ")}`, {
          encoding: "utf8",
          maxBuffer: 1024 * 1024, // 1MB
          cwd: ctx.cwd,
        });

        if (!output.trim()) {
          return {
            content: [{ type: "text", text: `No matches found for \`${pattern}\` in \`${searchPath}\`.${fileType ? ` (filter: ${fileType})` : ""}` }],
            details: { pattern, searchPath, fileType, matches: 0 },
          };
        }

        // Parse JSON output from ripgrep
        const lines = output.trim().split("\n");
        const matches: Array<{
          file: string;
          line: number;
          column: number;
          text: string;
          type: "match" | "context";
        }> = [];

        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);
            if (parsed.type === "match") {
              matches.push({
                file: parsed.data.path.text,
                line: parsed.data.line_number,
                column: parsed.data.absolute_offset || 0,
                text: parsed.data.lines.text,
                type: "match",
              });
            } else if (parsed.type === "context") {
              matches.push({
                file: parsed.data.path?.text || "",
                line: parsed.data.line_number,
                column: 0,
                text: parsed.data.lines.text,
                type: "context",
              });
            }
          } catch {
            // Skip unparseable lines
          }
        }

        // Group by file
        const fileGroups = new Map<
          string,
          { lines: Array<{ line: number; text: string; type: "match" | "context" }> }
        >();

        for (const m of matches) {
          if (!m.file) continue;
          if (!fileGroups.has(m.file)) {
            fileGroups.set(m.file, { lines: [] });
          }
          fileGroups.get(m.file)!.lines.push({
            line: m.line,
            text: m.text.replace(/\n$/, ""),
            type: m.type,
          });
        }

        // Build output
        const fileCount = fileGroups.size;
        const matchCount = matches.filter((m) => m.type === "match").length;

        let output_text = `## Search Results\n\n`;
        output_text += `**Pattern:** \`${pattern}\`\n`;
        output_text += `**Path:** \`${searchPath}\`\n`;
        if (fileType) output_text += `**Type filter:** ${fileType}\n`;
        output_text += `**Files:** ${fileCount}  **Matches:** ${matchCount}\n\n`;

        for (const [file, group] of fileGroups) {
          output_text += `### \`${file}\`\n\n`;
          output_text += "```\n";
          for (const l of group.lines) {
            const prefix = l.type === "context" ? " " : ">";
            output_text += `${prefix} ${l.line.toString().padStart(4, " ")} | ${l.text}\n`;
          }
          output_text += "```\n\n";
        }

        if (output_text.length > 60000) {
          output_text = output_text.slice(0, 60000) + "\n\n... [output truncated at ~60KB]";
        }

        return {
          content: [{ type: "text", text: output_text }],
          details: {
            pattern,
            searchPath,
            fileType,
            matchCount,
            fileCount,
            files: Array.from(fileGroups.keys()),
          },
        };
      } catch (err: any) {
        // rg exits with code 1 when no matches found
        if (err.status === 1) {
          return {
            content: [
              {
                type: "text",
                text: `No matches found for \`${pattern}\` in \`${searchPath}\`.${fileType ? ` (filter: ${fileType})` : ""}`,
              },
            ],
            details: { pattern, searchPath, fileType, matches: 0 },
          };
        }

        // rg exits with code 2 on error
        if (err.status === 2) {
          const stderr = err.stderr?.toString() || "Unknown error";
          return {
            content: [{ type: "text", text: `❌ Search error: ${stderr.trim()}` }],
            isError: true,
            details: { error: stderr.trim(), pattern, searchPath },
          };
        }

        return {
          content: [{ type: "text", text: `❌ Search failed: ${err.message}` }],
          isError: true,
          details: { error: err.message },
        };
      }
    },
  });
}
