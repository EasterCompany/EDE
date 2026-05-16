import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  const ETL_BASE = "http://localhost:8081/dashboard/etl/api";

  function headers(token: string) {
    return {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };
  }

  async function fetchTodos(listType = "public") {
    const token = process.env.DARWIN_TOKEN;
    if (!token) return null;

    try {
      const resp = await fetch(`${ETL_BASE}/todos?list_type=${listType}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) return null;
      const json = await resp.json() as any;
      return json.success ? json.data : null;
    } catch { return null; }
  }

  pi.on("before_agent_start", async (event, ctx) => {
    const todos = await fetchTodos("public");
    if (!todos) return;

    const todoListStr = (todos as any[])
      .map((t: any) =>
        `- [${t.completed ? "x" : " "}]${t.has_issue ? " ⚠" : ""} ${t.title} (ID: ${t.id})${t.details ? `: ${t.details}` : ""}${t.assigned_to ? ` [${t.assigned_to}]` : ""}`
      )
      .join("\n");

    return {
      systemPrompt: event.systemPrompt + `\n\n---
# ETL Todo List
You have access to the user's ETL todo list. The current state is:
${todoListStr || "No tasks found."}

Use the etl_* tools to interact with this list. Tasks can be in states:
- **Draft** (`ready: false`, not completed, no issue)
- **Ready** (`ready: true`, not completed, no issue, not blocked)
- **Blocked** (depends on an incomplete required task)
- **Issue** (`has_issue: true` — blocking problem)
- **Completed** (`completed: true`)

All tools accept an optional `list_type` parameter ("public" or "private").
---`
    };
  });

  pi.registerTool({
    name: "etl_list_tasks",
    description: "Get the current list of ETL todo tasks.",
    parameters: {
      type: "object",
      properties: {
        list_type: { type: "string", description: "Task list: 'public' or 'private' (default: public)." },
      },
    },
    async execute({ list_type }) {
      const todos = await fetchTodos(list_type || "public");
      if (!todos) return { error: "Could not fetch todos. Ensure you are authenticated." };
      return { todos };
    }
  });

  pi.registerTool({
    name: "etl_add_task",
    description: "Add a new task to the ETL todo list.",
    parameters: {
      type: "object",
      properties: {
        list_type: { type: "string", description: "Task list: 'public' or 'private' (default: public)." },
        title: { type: "string", description: "The title of the task." },
        details: { type: "string", description: "Optional detailed description." },
        ready: { type: "boolean", description: "Whether the task is ready to start (default: true)." },
        has_issue: { type: "boolean", description: "Whether the task has a blocking issue (default: false)." },
      },
      required: ["title"],
    },
    async execute({ list_type, title, details, ready, has_issue }) {
      const token = process.env.DARWIN_TOKEN;
      if (!token) return { error: "No DARWIN_TOKEN available" };

      try {
        const resp = await fetch(`${ETL_BASE}/todos?list_type=${list_type || "public"}`, {
          method: "POST",
          headers: headers(token),
          body: JSON.stringify({ title, details, ready, has_issue }),
        });
        const json = await resp.json() as any;
        return json.success ? { message: "Task added.", task: json.data } : { error: json.error };
      } catch (e: any) {
        return { error: e.message };
      }
    }
  });

  pi.registerTool({
    name: "etl_mark_done",
    description: "Toggle completion status of an ETL todo task.",
    parameters: {
      type: "object",
      properties: {
        task_id: { type: "string", description: "The UUID of the task." },
        list_type: { type: "string", description: "Task list: 'public' or 'private' (default: public)." },
      },
      required: ["task_id"],
    },
    async execute({ task_id, list_type }) {
      const token = process.env.DARWIN_TOKEN;
      if (!token) return { error: "No DARWIN_TOKEN available" };

      try {
        const resp = await fetch(`${ETL_BASE}/todos/${task_id}/toggle?list_type=${list_type || "public"}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await resp.json() as any;
        return json.success ? { message: `Task ${task_id} toggled.`, task: json.data } : { error: json.error };
      } catch (e: any) {
        return { error: e.message };
      }
    }
  });

  pi.registerTool({
    name: "etl_mark_issue",
    description: "Toggle the issue flag on an ETL todo task. Use this to mark a task as having a blocking problem.",
    parameters: {
      type: "object",
      properties: {
        task_id: { type: "string", description: "The UUID of the task." },
        list_type: { type: "string", description: "Task list: 'public' or 'private' (default: public)." },
      },
      required: ["task_id"],
    },
    async execute({ task_id, list_type }) {
      const token = process.env.DARWIN_TOKEN;
      if (!token) return { error: "No DARWIN_TOKEN available" };

      try {
        const resp = await fetch(`${ETL_BASE}/todos/${task_id}/issue?list_type=${list_type || "public"}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await resp.json() as any;
        return json.success ? { message: `Task ${task_id} issue flag toggled.`, task: json.data } : { error: json.error };
      } catch (e: any) {
        return { error: e.message };
      }
    }
  });

  pi.registerTool({
    name: "etl_delete_task",
    description: "Delete a task from the ETL todo list.",
    parameters: {
      type: "object",
      properties: {
        task_id: { type: "string", description: "The UUID of the task to delete." },
        list_type: { type: "string", description: "Task list: 'public' or 'private' (default: public)." },
      },
      required: ["task_id"],
    },
    async execute({ task_id, list_type }) {
      const token = process.env.DARWIN_TOKEN;
      if (!token) return { error: "No DARWIN_TOKEN available" };

      try {
        const resp = await fetch(`${ETL_BASE}/todos/${task_id}?list_type=${list_type || "public"}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await resp.json() as any;
        return json.success ? { message: `Task ${task_id} deleted.` } : { error: json.error };
      } catch (e: any) {
        return { error: e.message };
      }
    }
  });

  pi.registerTool({
    name: "etl_update_task",
    description: "Update details of an existing ETL todo task.",
    parameters: {
      type: "object",
      properties: {
        task_id: { type: "string", description: "The UUID of the task." },
        list_type: { type: "string", description: "Task list: 'public' or 'private' (default: public)." },
        title: { type: "string", description: "The new title." },
        details: { type: "string", description: "The new details." },
        ready: { type: "boolean", description: "Whether the task is ready to start." },
        has_issue: { type: "boolean", description: "Whether the task has a blocking issue." },
      },
      required: ["task_id"],
    },
    async execute({ task_id, list_type, title, details, ready, has_issue }) {
      const token = process.env.DARWIN_TOKEN;
      if (!token) return { error: "No DARWIN_TOKEN available" };

      try {
        const resp = await fetch(`${ETL_BASE}/todos/${task_id}?list_type=${list_type || "public"}`, {
          method: "PUT",
          headers: headers(token),
          body: JSON.stringify({ title, details, ready, has_issue }),
        });
        const json = await resp.json() as any;
        return json.success ? { message: `Task ${task_id} updated.`, task: json.data } : { error: json.error };
      } catch (e: any) {
        return { error: e.message };
      }
    }
  });
}
