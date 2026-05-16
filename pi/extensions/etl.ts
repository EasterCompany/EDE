import type { ExtensionAPI, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

// ─────────────────────────────────────────────────────────────────
// ETL — Easter Task Lifecycle
// Darwin-IDE Integration
//
// Instead of forking isolated agent sessions (as the web UI does),
// Darwin-IDE tools inject prompts into the active AI chat session
// via pi.sendUserMessage(). This means:
//
//   "Start Agentic Workflow" → I get prompted: "Work on task X..."
//   "Resolve Issue"          → I get prompted: "Help with issue in task X..."
//
// Seamless integration with the existing workflow. No fork.
// ─────────────────────────────────────────────────────────────────

const ETL_BASE = "http://localhost:8081/dashboard/etl/api";

function headers(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

function readDarwinToken(): string | null {
  // 1. Environment variable
  const envToken = process.env.DARWIN_TOKEN;
  if (envToken) return envToken;

  // 2. Read from models.json (created by darwin-auth.sh)
  try {
    const fs = require("fs");
    const modelsPath = `${process.env.HOME || "/root"}/.pi/agent/models.json`;
    if (fs.existsSync(modelsPath)) {
      const models = JSON.parse(fs.readFileSync(modelsPath, "utf8"));
      const key = models?.providers?.["easter-company"]?.apiKey;
      if (key && typeof key === "string") return key;
    }
  } catch { /* best-effort */ }

  return null;
}

async function fetchWithAuth<T>(
  url: string,
  options: RequestInit = {},
): Promise<{ success: true; data: T } | { success: false; error: string }> {
  const token = readDarwinToken();
  if (!token) return { success: false, error: "No DARWIN_TOKEN available. Run darwin-auth to authenticate." };

  try {
    const resp = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });
    const json = (await resp.json()) as any;
    return json.success
      ? { success: true as const, data: json.data as T }
      : { success: false as const, error: json.error || "Unknown error" };
  } catch (e: any) {
    return { success: false as const, error: e.message };
  }
}

// ── ETL Todo Item type (from models.rs) ──────────────────────

interface TodoItem {
  id: string;
  user_id: string;
  title: string;
  details?: string | null;
  completed: boolean;
  ready: boolean;
  has_issue: boolean;
  date_to_start?: string | null;
  time_estimation_days?: number | null;
  token_estimation_millions?: number | null;
  assigned_to?: string | null;
  required_task_id?: string | null;
  created_at: string;
  updated_at: string;
}

// ── Task State Classification ─────────────────────────────────

type TaskState = "issue" | "ready" | "blocked" | "draft" | "done";

function classifyTask(task: TodoItem, allItems: TodoItem[]): TaskState {
  if (task.completed) return "done";
  if (task.has_issue) return "issue";
  if (!task.ready) return "draft";
  if (
    task.required_task_id &&
    allItems.some((other) => other.id === task.required_task_id && !other.completed)
  ) {
    return "blocked";
  }
  return "ready";
}

function formatTaskLine(task: TodoItem, state: TaskState, isAssignedToMe: boolean): string {
  const statusIcon =
    state === "done"
      ? "[x]"
      : state === "issue"
        ? "[!]"
        : state === "blocked"
          ? "[~]"
          : state === "draft"
            ? "[ ]"
            : "[•]";
  const issueBadge = task.has_issue ? " ⚠" : "";
  const agentTag = task.assigned_to ? ` @${task.assigned_to}` : "";
  const meTag = isAssignedToMe ? " ← YOU" : "";
  return `- ${statusIcon}${issueBadge} ${task.title} (${task.id.slice(0, 8)})${agentTag}${meTag}${task.details ? `: ${task.details.slice(0, 120)}` : ""}`;
}

function buildTaskTable(tasks: TodoItem[], assignedAgent: string): string {
  if (tasks.length === 0) return "No tasks found.";

  const classified = tasks.map((t) => ({
    item: t,
    state: classifyTask(t, tasks),
    isMe: t.assigned_to?.toLowerCase() === assignedAgent.toLowerCase(),
  }));

  // Priority sort: issue → ready → blocked → draft → done
  const priority: Record<TaskState, number> = {
    issue: 0,
    ready: 1,
    blocked: 2,
    draft: 3,
    done: 4,
  };
  classified.sort((a, b) => {
    const pa = priority[a.state];
    const pb = priority[b.state];
    if (pa !== pb) return pa - pb;
    return a.isMe ? -1 : b.isMe ? 1 : 0;
  });

  const sections: Record<TaskState, string[]> = {
    issue: [],
    ready: [],
    blocked: [],
    draft: [],
    done: [],
  };

  for (const c of classified) {
    sections[c.state].push(formatTaskLine(c.item, c.state, c.isMe));
  }

  const labels: Record<TaskState, string> = {
    issue: "🚨 Issues (blocked, need attention)",
    ready: "▶ Ready (actionable)",
    blocked: "⏳ Blocked (waiting on dependency)",
    draft: "📝 Draft (not ready)",
    done: "✅ Completed",
  };

  let output = "";
  for (const state of ["issue", "ready", "blocked", "draft", "done"] as TaskState[]) {
    if (sections[state].length > 0) {
      output += `\n### ${labels[state]}\n`;
      output += sections[state].join("\n") + "\n";
    }
  }

  return output;
}

// ── System prompt injection ───────────────────────────────────

async function buildSystemPromptBlock(): Promise<string> {
  const result = await fetchWithAuth<TodoItem[]>(`${ETL_BASE}/todos?list_type=public`);
  if (!result.success || !result.data) return "";

  const assignedAgent = process.env.DARWIN_USER || "darwin";
  const table = buildTaskTable(result.data, assignedAgent);

  return (
    `
---
# 📋 ETL Task Board
You have access to the Easter Task Lifecycle (ETL) system. Current task state:

${table}

### Darwin-IDE ETL Tools
Use these tools to interact with the task board:

| Tool | Purpose |
|------|---------|
| \`etl_list_tasks\` | View tasks (public or private) |
| \`etl_add_task\` | Create a new task |
| \`etl_update_task\` | Edit task fields |
| \`etl_mark_done\` | Toggle completion |
| \`etl_mark_issue\` | Toggle issue flag |
| \`etl_delete_task\` | Remove a task |
| \`etl_agentic_cycle\` | Start working through tasks in sequence |
| \`etl_resolve_issue\` | Inject user intervention into an issue task |
| \`etl_sprint_refresh\` | Topological sort + priority reorder |

### Agentic Workflow (Darwin-IDE native)
- **\`etl_agentic_cycle\`** finds the next ready task assigned to you, marks it in ETL, and prompts you via the active chat to work on it
- When you finish, call \`etl_mark_done\` + \`etl_agentic_cycle\` to move to the next task
- For issues that need user input, use \`etl_resolve_issue\` with instructions
- This keeps everything in YOUR active session — no forking off to separate agents

### Task States
- **Draft** (\`ready: false\`) — Not yet actionable
- **Ready** (\`ready: true\`, no issue, no blocker) — Can be worked on
- **Blocked** (depends on an incomplete task) — Waiting on dependency
- **Issue** (\`has_issue: true\`) — Has a blocking problem
- **Completed** (\`completed: true\`) — Done

All tools accept \`list_type\`: "public" (shared) or "private" (personal).
---
`.trim() + "\n"
  );
}

// ── Extension entry point ─────────────────────────────────────

export default function (pi: ExtensionAPI) {
  // ── System prompt injection ───────────────────────────────
  pi.on("before_agent_start", async (event) => {
    const block = await buildSystemPromptBlock();
    if (!block) return;
    return { systemPrompt: event.systemPrompt + "\n" + block };
  });

  // ── Agentic cycle tracker ─────────────────────────────────
  let cycleActive = false;
  let cycleListType = "public";

  // ───────────────────────────────────────────────────────────
  // Tool: etl_list_tasks
  // ───────────────────────────────────────────────────────────
  pi.registerTool({
    name: "etl_list_tasks",
    label: "ETL List Tasks",
    description: "Get the current list of ETL todo tasks.",
    promptSnippet: "View the ETL task board",
    parameters: Type.Object({
      list_type: Type.Optional(
        Type.String({ description: "Task list: 'public' or 'private' (default: public)." }),
      ),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const { list_type = "public" } = params as { list_type?: string };
      const result = await fetchWithAuth<TodoItem[]>(
        `${ETL_BASE}/todos?list_type=${list_type}`,
      );
      if (!result.success) return { content: [{ type: "text", text: `❌ ${result.error}` }], isError: true, details: result };

      const assignedAgent = process.env.DARWIN_USER || "darwin";
      const table = buildTaskTable(result.data, assignedAgent);
      return {
        content: [{ type: "text", text: `## 📋 ETL Task Board (${list_type})\n${table}` }],
        details: { count: result.data.length, list_type },
      };
    },
  });

  // ───────────────────────────────────────────────────────────
  // Tool: etl_add_task
  // ───────────────────────────────────────────────────────────
  pi.registerTool({
    name: "etl_add_task",
    label: "ETL Add Task",
    description:
      "Add a new task to the ETL todo list. Supports optional fields: details, assigned_to, " +
      "time estimation, token estimation, dependencies, and issue flags.",
    promptSnippet: "Create a new ETL task",
    parameters: Type.Object({
      list_type: Type.Optional(
        Type.String({ description: "Task list: 'public' or 'private' (default: public)." }),
      ),
      title: Type.String({ description: "The title of the task." }),
      details: Type.Optional(Type.String({ description: "Optional detailed description." })),
      ready: Type.Optional(
        Type.Boolean({ description: "Whether the task is ready to start (default: true)." }),
      ),
      has_issue: Type.Optional(
        Type.Boolean({ description: "Whether the task starts with an issue (default: false)." }),
      ),
      assigned_to: Type.Optional(
        Type.String({ description: "Assign to a user/agent (e.g. 'darwin', 'dexter')." }),
      ),
    }),
    required: ["title"],

    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const {
        list_type = "public",
        title,
        details,
        ready = true,
        has_issue = false,
        assigned_to,
      } = params as {
        list_type?: string;
        title: string;
        details?: string;
        ready?: boolean;
        has_issue?: boolean;
        assigned_to?: string;
      };

      const result = await fetchWithAuth<TodoItem>(
        `${ETL_BASE}/todos?list_type=${list_type}`,
        {
          method: "POST",
          body: JSON.stringify({ title, details, ready, has_issue, assigned_to }),
        },
      );

      if (!result.success)
        return { content: [{ type: "text", text: `❌ ${result.error}` }], isError: true, details: result };

      const task = result.data;
      return {
        content: [
          {
            type: "text",
            text: `✅ Task created: **${task.title}** (${task.id.slice(0, 8)})${
              task.assigned_to ? ` assigned to @${task.assigned_to}` : ""
            }${task.has_issue ? " ⚠ has issue" : ""}${!task.ready ? " 📝 draft" : ""}`,
          },
        ],
        details: { task },
      };
    },
  });

  // ───────────────────────────────────────────────────────────
  // Tool: etl_mark_done
  // ───────────────────────────────────────────────────────────
  pi.registerTool({
    name: "etl_mark_done",
    label: "ETL Mark Done",
    description: "Toggle completion status of an ETL todo task.",
    promptSnippet: "Toggle task completion",
    parameters: Type.Object({
      task_id: Type.String({ description: "The UUID of the task." }),
      list_type: Type.Optional(
        Type.String({ description: "Task list: 'public' or 'private' (default: public)." }),
      ),
    }),
    required: ["task_id"],

    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const { task_id, list_type = "public" } = params as { task_id: string; list_type?: string };
      const result = await fetchWithAuth<TodoItem>(
        `${ETL_BASE}/todos/${task_id}/toggle?list_type=${list_type}`,
        { method: "POST" },
      );

      if (!result.success)
        return { content: [{ type: "text", text: `❌ ${result.error}` }], isError: true, details: result };

      const task = result.data;
      const verb = task.completed ? "completed" : "reopened";
      return {
        content: [{ type: "text", text: `✅ Task ${verb}: **${task.title}**` }],
        details: { task, verb },
      };
    },
  });

  // ───────────────────────────────────────────────────────────
  // Tool: etl_mark_issue
  // ───────────────────────────────────────────────────────────
  pi.registerTool({
    name: "etl_mark_issue",
    label: "ETL Mark Issue",
    description:
      "Toggle the issue flag on an ETL todo task. Use this to mark a task as having a blocking " +
      "problem that needs resolution before work can continue.",
    promptSnippet: "Toggle issue flag on a task",
    parameters: Type.Object({
      task_id: Type.String({ description: "The UUID of the task." }),
      list_type: Type.Optional(
        Type.String({ description: "Task list: 'public' or 'private' (default: public)." }),
      ),
    }),
    required: ["task_id"],

    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const { task_id, list_type = "public" } = params as { task_id: string; list_type?: string };
      const result = await fetchWithAuth<TodoItem>(
        `${ETL_BASE}/todos/${task_id}/issue?list_type=${list_type}`,
        { method: "POST" },
      );

      if (!result.success)
        return { content: [{ type: "text", text: `❌ ${result.error}` }], isError: true, details: result };

      const task = result.data;
      const verb = task.has_issue ? "Flagged with issue" : "Issue cleared";
      return {
        content: [{ type: "text", text: `⚠️ ${verb}: **${task.title}**` }],
        details: { task, has_issue: task.has_issue },
      };
    },
  });

  // ───────────────────────────────────────────────────────────
  // Tool: etl_delete_task
  // ───────────────────────────────────────────────────────────
  pi.registerTool({
    name: "etl_delete_task",
    label: "ETL Delete Task",
    description: "Delete a task from the ETL todo list.",
    promptSnippet: "Remove a task",
    parameters: Type.Object({
      task_id: Type.String({ description: "The UUID of the task to delete." }),
      list_type: Type.Optional(
        Type.String({ description: "Task list: 'public' or 'private' (default: public)." }),
      ),
    }),
    required: ["task_id"],

    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const { task_id, list_type = "public" } = params as { task_id: string; list_type?: string };
      const result = await fetchWithAuth<boolean>(
        `${ETL_BASE}/todos/${task_id}?list_type=${list_type}`,
        { method: "DELETE" },
      );

      if (!result.success)
        return { content: [{ type: "text", text: `❌ ${result.error}` }], isError: true, details: result };

      return {
        content: [{ type: "text", text: `🗑️ Task deleted: \`${task_id}\`` }],
        details: { task_id },
      };
    },
  });

  // ───────────────────────────────────────────────────────────
  // Tool: etl_update_task
  // ───────────────────────────────────────────────────────────
  pi.registerTool({
    name: "etl_update_task",
    label: "ETL Update Task",
    description: "Update details of an existing ETL todo task.",
    promptSnippet: "Edit task properties",
    parameters: Type.Object({
      task_id: Type.String({ description: "The UUID of the task." }),
      list_type: Type.Optional(
        Type.String({ description: "Task list: 'public' or 'private' (default: public)." }),
      ),
      title: Type.Optional(Type.String({ description: "The new title." })),
      details: Type.Optional(Type.String({ description: "The new details." })),
      ready: Type.Optional(Type.Boolean({ description: "Whether the task is ready to start." })),
      has_issue: Type.Optional(
        Type.Boolean({ description: "Whether the task has a blocking issue." }),
      ),
      assigned_to: Type.Optional(
        Type.String({ description: "Assign to a user/agent." }),
      ),
    }),
    required: ["task_id"],

    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const {
        task_id,
        list_type = "public",
        title,
        details,
        ready,
        has_issue,
        assigned_to,
      } = params as {
        task_id: string;
        list_type?: string;
        title?: string;
        details?: string;
        ready?: boolean;
        has_issue?: boolean;
        assigned_to?: string;
      };

      const body: Record<string, unknown> = {};
      if (title !== undefined) body.title = title;
      if (details !== undefined) body.details = details;
      if (ready !== undefined) body.ready = ready;
      if (has_issue !== undefined) body.has_issue = has_issue;
      if (assigned_to !== undefined) body.assigned_to = assigned_to;

      const result = await fetchWithAuth<TodoItem>(
        `${ETL_BASE}/todos/${task_id}?list_type=${list_type}`,
        {
          method: "PUT",
          body: JSON.stringify(body),
        },
      );

      if (!result.success)
        return { content: [{ type: "text", text: `❌ ${result.error}` }], isError: true, details: result };

      return {
        content: [{ type: "text", text: `✅ Task updated: **${result.data.title}**` }],
        details: { task: result.data },
      };
    },
  });

  // ── Agent model routing ──────────────────────────────────
  // Maps agent names to EMS models. All tasks are processed
  // from THIS chat — results appear here regardless of model.

  const EMS_BASE = "http://localhost:8080/api/ems/v1";
  const EMS_REMOTE = "https://easter.company/api/ems/v1";

  const AGENT_MODELS: Record<string, string> = {
    opengo: "deepseek-v4-flash-free",   // handled directly
    darwin: "darwin-cloud-auto",
    gemini: "gemini-cloud-auto",
    dexter: "gemma-4-e2b",
    diana: "gemini-3.1-flash-lite-preview",
  };

  function detectMyIdentity(modelId?: string): string {
    if (!modelId) return process.env.DARWIN_USER || "opengo";
    const id = modelId.toLowerCase();
    if (id.includes("deepseek") || id.includes("minimax")) return "opengo";
    if (id.includes("darwin")) return "darwin";
    if (id.includes("gemini")) return "gemini";
    if (id.includes("gemma")) return "dexter";
    return process.env.DARWIN_USER || "opengo";
  }

  // ── EMS API helper ───────────────────────────────────────
  async function callEmsApi(
    model: string,
    prompt: string,
  ): Promise<{ success: boolean; content?: string; error?: string }> {
    const token = readDarwinToken();
    if (!token) return { success: false, error: "No auth token available" };

    const payload = {
      model,
      messages: [{ role: "user" as const, content: prompt }],
      stream: false,
    };

    // Try local first, then remote
    for (const base of [EMS_BASE, EMS_REMOTE]) {
      try {
        const resp = await fetch(`${base}/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(30000),
        });

        if (resp.status === 429) continue; // rate limited, try next
        if (!resp.ok) {
          const err = await resp.text().catch(() => "unknown");
          if (resp.status === 404) continue; // not found on this host
          return { success: false, error: `${base} error (${resp.status}): ${err.slice(0, 200)}` };
        }

        const json = (await resp.json()) as any;
        const content = json?.choices?.[0]?.message?.content;
        return content
          ? { success: true, content }
          : { success: false, error: "No content in response" };
      } catch (e: any) {
        if (e.name === "AbortError") {
          if (base === EMS_REMOTE) return { success: false, error: "Request timed out" };
          continue; // try next endpoint
        }
        if (base === EMS_REMOTE) return { success: false, error: e.message };
      }
    }

    return { success: false, error: "All EMS endpoints failed" };
  }



  // ───────────────────────────────────────────────────────────
  // Tool: etl_agentic_cycle
  //
  // Routes tasks to the correct agent:
  //   darwin  → inject into active chat (pi.sendUserMessage)
  //   gemini/dexter/diana → EMS API
  //   opengo/deepseek     → OpenCode API

  // ───────────────────────────────────────────────────────────
  // Tool: etl_agentic_cycle
  //
  // Finds the next ready task from the ETL board and dispatches
  // it to the appropriate agent:
  //   - opengo → handled directly in THIS chat via sendUserMessage
  //   - darwin/gemini/dexter/diana → called via EMS API, results HERE
  //
  // All output appears in one continuous chat so the user sees
  // every agent's progress live. Auto-cycle processes all ready
  // tasks in sequence.
  // ───────────────────────────────────────────────────────────
  pi.registerTool({
    name: "etl_agentic_cycle",
    label: "ETL Agentic Cycle",
    description:
      "Start an agentic work cycle. Finds the next ready task (regardless of assigned agent) " +
      "and processes it: opengo tasks are handled directly in this chat, other agents are " +
      "called via EMS API with results shown here. " +
      "Auto-cycle processes all ready tasks in sequence.",
    promptSnippet: "Start working through ETL tasks in sequence",
    promptGuidelines: [
      "Use etl_agentic_cycle to start working through ETL tasks in sequence. It detects your agent identity from the current model and finds tasks assigned to you.",
      "After completing a task, call etl_mark_done then etl_agentic_cycle again to move to the next task.",
      "If a task has an issue, use etl_resolve_issue to get user guidance.",
    ],
    parameters: Type.Object({
      list_type: Type.Optional(
        Type.String({ description: "Task list: 'public' or 'private' (default: public)." }),
      ),
      agent: Type.Optional(
        Type.String({
          description:
            "Agent to find tasks for. Detected automatically from model if not specified.",
        }),
      ),
      auto_cycle: Type.Optional(
        Type.Boolean({
          description:
            "If true, automatically continue to next task after completing the current one. Default: false.",
        }),
      ),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const { list_type = "public", agent, auto_cycle = false } = params as {
        list_type?: string;
        agent?: string;
        auto_cycle?: boolean;
      };

      const myIdentity = agent?.toLowerCase() || detectMyIdentity(ctx.model?.id);

      // Fetch tasks
      const result = await fetchWithAuth<TodoItem[]>(
        `${ETL_BASE}/todos?list_type=${list_type}`,
      );
      if (!result.success)
        return { content: [{ type: "text", text: `❌ Could not fetch tasks: ${result.error}` }], isError: true };

      const tasks = result.data;

      // Find the next ready task regardless of assignment
      // Priority: issues first, then ready tasks in list order
      const nextTask = tasks.find((t) => {
        if (t.completed) return false;
        if (t.has_issue) return false;
        if (!t.ready) return false;
        if (
          t.required_task_id &&
          tasks.some((other) => other.id === t.required_task_id && !other.completed)
        ) {
          return false;
        }
        return true;
      });

      if (!nextTask) {
        const issues = tasks.filter((t) => t.has_issue && !t.completed);
        if (issues.length > 0) {
          return {
            content: [
              {
                type: "text",
                text:
                  `✅ No ready tasks. ${issues.length} task(s) have issues — use \`etl_resolve_issue\` to address them.`,
              },
            ],
            details: { status: "no_tasks", issue_count: issues.length },
          };
        }
        return {
          content: [{ type: "text", text: `✅ All tasks completed in ${list_type} list.` }],
          details: { status: "complete" },
        };
      }

      // Determine which agent handles this task
      const taskAgent = nextTask.assigned_to?.toLowerCase() || myIdentity;
      const isMe = taskAgent === "opengo" || taskAgent === myIdentity;

      // Ensure marked ready
      if (!nextTask.ready) {
        await fetchWithAuth<TodoItem>(
          `${ETL_BASE}/todos/${nextTask.id}?list_type=${list_type}`,
          { method: "PUT", body: JSON.stringify({ ready: true }) },
        );
      }

      cycleActive = true;
      cycleListType = list_type;

      const taskPrompt =
        `## 📋 Agentic Cycle: Next Task\n\n**${nextTask.title}**\n${nextTask.details ? `> ${nextTask.details}\n` : ""}\n**Task ID:** \`${nextTask.id}\`\n**Assigned to:** @${taskAgent}\n\nPlease execute this task. If you encounter a critical issue, describe it clearly.`;

      if (isMe) {
        // ── It's me (opengo) — inject into this chat ────────
        pi.sendUserMessage(taskPrompt, { deliverAs: "steer" });

        return {
          content: [
            {
              type: "text",
              text:
                `▶️ Started: **${nextTask.title}** (@${taskAgent}) — working in this chat. (This chat remains on deepseek/opencode.)`,
            },
          ],
          details: { status: "started", agent: taskAgent, task: nextTask, auto_cycle },
        };
      } else {
        // ── Other agent — call EMS API, show result here ────
        const model = AGENT_MODELS[taskAgent];
        if (!model) {
          return {
            content: [{ type: "text", text: `❌ No model configured for agent "${taskAgent}".` }],
            isError: true,
            details: { error: "unknown_agent" },
          };
        }

        const emsResult = await callEmsApi(model, taskPrompt);

        if (!emsResult.success) {
          // Mark task with issue on failure
          await fetchWithAuth<TodoItem>(
            `${ETL_BASE}/todos/${nextTask.id}?list_type=${list_type}`,
            {
              method: "PUT",
              body: JSON.stringify({
                has_issue: true,
                details: `${model} Error: ${emsResult.error}\n\nOriginal: ${nextTask.details || ""}`,
              }),
            },
          );

          return {
            content: [
              {
                type: "text",
                text:
                  `❌ **${nextTask.title}** (@${taskAgent}) failed:\n\n\`\`\`\n${emsResult.error}\n\`\`\`\n\nTask has been marked with an issue.`,
              },
            ],
            isError: true,
            details: { status: "error", agent: taskAgent, error: emsResult.error },
          };
        }

        // Mark task completed
        await fetchWithAuth<TodoItem>(
          `${ETL_BASE}/todos/${nextTask.id}/toggle?list_type=${list_type}`,
          { method: "POST" },
        );

        // Check if there are more tasks to process (for auto-cycle message)
        const updatedTasks = await fetchWithAuth<TodoItem[]>(
          `${ETL_BASE}/todos?list_type=${list_type}`,
        );
        const moreReady = updatedTasks.success
          ? updatedTasks.data.some((t) => {
              if (t.completed || t.has_issue || !t.ready) return false;
              if (
                t.required_task_id &&
                updatedTasks.data.some(
                  (other) => other.id === t.required_task_id && !other.completed,
                )
              )
                return false;
              return true;
            })
          : false;

        let output = `✅ **${nextTask.title}** (@${taskAgent}) completed via **${model}**\n\nResponse:\n\`\`\`\n${emsResult.content}\n\`\`\``;

        if (auto_cycle && moreReady) {
          output += `\n\n🔄 More tasks ready — continuing cycle...`;
          // Queue the next cycle as a follow-up message
          pi.sendUserMessage(
            `The previous task completed. Please run \`etl_agentic_cycle\` again with the same settings (list_type: ${list_type}, auto_cycle: true) to continue the workflow.`,
            { deliverAs: "followUp" },
          );
        } else if (auto_cycle && !moreReady) {
          output += `\n\n✅ **Agentic cycle complete** — all tasks processed. This chat remains on deepseek/opencode.`;
        }

        return {
          content: [{ type: "text", text: output }],
          details: { status: "completed", agent: taskAgent, task: nextTask, model, more_ready: moreReady },
        };
      }
    },
  });

  // ───────────────────────────────────────────────────────────
  // Tool: etl_resolve_issue
  //
  // Routes issue resolution to the correct agent and shows the
  // result in THIS chat. Handles resolution via:
  //   - opengo → injected into active chat (I handle it)
  //   - other agents → EMS API call
  // ───────────────────────────────────────────────────────────
  pi.registerTool({
    name: "etl_resolve_issue",
    label: "ETL Resolve Issue",
    description:
      "Resolve an issue on a task. Routes the user's intervention to the task's assigned agent " +
      "and shows the result in this chat. On success, clears the issue flag and saves the " +
      "resolution to task details.",
    promptSnippet: "Help resolve an issue on a task",
    promptGuidelines: [
      "Use etl_resolve_issue when a task has an issue that needs user guidance to resolve.",
      "The resolution is routed to the task's assigned agent and shown in this chat.",
    ],
    parameters: Type.Object({
      task_id: Type.String({ description: "The UUID of the task with an issue." }),
      resolution: Type.String({
        description: "Your guidance on how to resolve this issue. What should the agent do?",
      }),
      list_type: Type.Optional(
        Type.String({ description: "Task list: 'public' or 'private' (default: public)." }),
      ),
    }),
    required: ["task_id", "resolution"],

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const { task_id, resolution, list_type = "public" } = params as {
        task_id: string;
        resolution: string;
        list_type?: string;
      };

      // Fetch the task
      const listResult = await fetchWithAuth<TodoItem[]>(
        `${ETL_BASE}/todos?list_type=${list_type}`,
      );
      if (!listResult.success)
        return { content: [{ type: "text", text: `❌ ${listResult.error}` }], isError: true };

      const task = listResult.data.find((t) => t.id === task_id);
      if (!task) {
        return {
          content: [{ type: "text", text: `❌ Task \`${task_id}\` not found.` }],
          isError: true,
          details: { error: "not_found" },
        };
      }

      const taskAgent = task.assigned_to?.toLowerCase() || "opengo";
      const isMe = taskAgent === "opengo" || taskAgent === detectMyIdentity(ctx.model?.id);
      const detailsText = task.details || "No details provided";

      const resolvePrompt =
        `The user is intervening to resolve an issue with a task.\n\nTask: ${task.title}\n\nCurrent Issue State: ${detailsText}\n\nUser Message: ${resolution}\n\nPlease provide a resolution or concise update based on this interaction.`;

      let agentResponse: string | undefined;

      if (isMe) {
        // ── I handle it directly ───────────────────────────
        pi.sendUserMessage(
          `## 🔧 Issue Resolution Needed\n\n**Task:** ${task.title}\n**Issue:** ${detailsText}\n\n**User guidance:** ${resolution}\n\nPlease resolve this issue.`,
          { deliverAs: "steer" },
        );
        agentResponse = "(resolving in active chat)";
      } else {
        // ── Route to assigned agent via EMS ────────────────
        const model = AGENT_MODELS[taskAgent];
        if (!model) {
          return {
            content: [{ type: "text", text: `❌ No model for agent "${taskAgent}".` }],
            isError: true,
            details: { error: "unknown_agent" },
          };
        }

        const emsResult = await callEmsApi(model, resolvePrompt);
        if (!emsResult.success) {
          return {
            content: [{ type: "text", text: `❌ Resolution failed via ${taskAgent} (${model}): ${emsResult.error}` }],
            isError: true,
          };
        }
        agentResponse = emsResult.content;
      }

      // ── Update task: clear issue, save resolution ────────
      const updatedDetails = agentResponse
        ? `Resolution: ${agentResponse}\n\nPrevious details: ${detailsText}`
        : detailsText;

      await fetchWithAuth<TodoItem>(
        `${ETL_BASE}/todos/${task_id}?list_type=${list_type}`,
        {
          method: "PUT",
          body: JSON.stringify({ details: updatedDetails, has_issue: false, ready: true }),
        },
      );

      const summary = agentResponse
        ? agentResponse.slice(0, 300) + (agentResponse.length > 300 ? "…" : "")
        : "No response";

      return {
        content: [
          {
            type: "text",
            text:
              `✅ Issue resolved: **${task.title}** (via @${taskAgent})\n\n**Resolution:** ${summary}`,
          },
        ],
        details: { agent: taskAgent, issue_cleared: true },
      };
    },
  });

  // ───────────────────────────────────────────────────────────
  // Tool: etl_sprint_refresh
  //
  // Triggers a topological sort of tasks (dependencies first,
  // priority ordered) and reorders them. Mirrors the web UI's
  // "Refresh" / sprint_refresh feature.
  // ───────────────────────────────────────────────────────────
  pi.registerTool({
    name: "etl_sprint_refresh",
    label: "ETL Sprint Refresh",
    description:
      "Trigger a sprint refresh on the ETL list. This performs a topological sort based on task " +
      "dependencies and priority (issues first, then ready, then blocked, then draft), " +
      "removes completed tasks, and reorders the list. Mirrors the web UI's Refresh button.",
    promptSnippet: "Reorder and clean up the task list",
    parameters: Type.Object({
      list_type: Type.Optional(
        Type.String({ description: "Task list: 'public' or 'private' (default: public)." }),
      ),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const { list_type = "public" } = params as { list_type?: string };
      const token = readDarwinToken();
      if (!token) return { content: [{ type: "text", text: "❌ No authentication token available. Run darwin-auth to authenticate." }], isError: true };

      try {
        const resp = await fetch(
          `${ETL_BASE}/todos/sprint_refresh?list_type=${list_type}`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        );
        const json = (await resp.json()) as any;

        if (json.success) {
          // Fetch the refreshed list
          const refreshed = await fetchWithAuth<TodoItem[]>(
            `${ETL_BASE}/todos?list_type=${list_type}`,
          );
          const count = refreshed.success ? refreshed.data.length : 0;
          return {
            content: [{ type: "text", text: `🔄 Sprint refreshed: ${count} tasks remain in the ${list_type} list.` }],
            details: { refreshed: true, count },
          };
        }
        return {
          content: [{ type: "text", text: `❌ Sprint refresh failed: ${json.error}` }],
          isError: true,
        };
      } catch (e: any) {
        return { content: [{ type: "text", text: `❌ ${e.message}` }], isError: true };
      }
    },
  });

  // ───────────────────────────────────────────────────────────
  // Command: /etl — interactive ETL dashboard
  // ───────────────────────────────────────────────────────────
  pi.registerCommand("etl", {
    description: "ETL dashboard: list, add, or cycle",
    handler: async (args, ctx) => {
      const parts = args.trim().split(/\s+/);
      const sub = parts[0]?.toLowerCase();

      if (sub === "list" || !sub) {
        const result = await fetchWithAuth<TodoItem[]>(`${ETL_BASE}/todos?list_type=public`);
        if (!result.success) {
          ctx.ui.notify("❌ Could not fetch tasks", "error");
          return;
        }
        const table = buildTaskTable(result.data, process.env.DARWIN_USER || "darwin");
        ctx.ui.setWidget("etl", table.split("\n"), { placement: "belowEditor" });
        ctx.ui.notify(`📋 ${result.data.length} tasks loaded`, "info");
      } else if (sub === "cycle") {
        const lt = parts[1] || "public";
        const result = await fetchWithAuth<TodoItem[]>(`${ETL_BASE}/todos?list_type=${lt}`);
        if (!result.success) {
          ctx.ui.notify("❌ Could not fetch tasks", "error");
          return;
        }
        const nextTask = result.data.find(
          (t) =>
            !t.completed &&
            !t.has_issue &&
            t.ready &&
            t.assigned_to?.toLowerCase() === (process.env.DARWIN_USER || "darwin"),
        );
        if (nextTask) {
          ctx.ui.notify(`▶️ Next task: ${nextTask.title}`, "info");
        } else {
          ctx.ui.notify("✅ No ready tasks for darwin", "info");
        }
      } else {
        ctx.ui.notify("Usage: /etl [list|cycle <list_type>]", "info");
      }
    },
  });
}
