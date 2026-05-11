import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  const ETL_API_URL = "http://localhost:8081/dashboard/etl/api/todos";

  async function fetchTodos() {
    const token = process.env.DARWIN_TOKEN;
    if (!token) return null;

    try {
      const resp = await fetch(ETL_API_URL, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!resp.ok) return null;
      const json = await resp.json() as any;
      return json.success ? json.data : null;
    } catch (e) {
      return null;
    }
  }

  pi.on("before_agent_start", async (event, ctx) => {
    const todos = await fetchTodos();
    if (!todos) return;

    const todoListStr = todos
      .map((t: any) => `- [${t.completed ? "x" : " "}] ${t.title} (ID: ${t.id})${t.details ? `: ${t.details}` : ""}`)
      .join("\n");

    return {
      systemPrompt: event.systemPrompt + `\n\n---
# ETL Todo List
You have access to the user's ETL todo list. The current state is:
${todoListStr || "No tasks found."}

Use the etl_* tools to interact with this list.
---`
    };
  });

  pi.registerTool({
    name: "etl_list_tasks",
    description: "Get the current list of ETL todo tasks.",
    parameters: {
      type: "object",
      properties: {},
    },
    async execute() {
      const todos = await fetchTodos();
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
        title: { type: "string", description: "The title of the task." },
        details: { type: "string", description: "Optional detailed description." },
      },
      required: ["title"],
    },
    async execute({ title, details }) {
      const token = process.env.DARWIN_TOKEN;
      if (!token) return { error: "No DARWIN_TOKEN available" };

      try {
        const resp = await fetch(ETL_API_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ title, details }),
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
      },
      required: ["task_id"],
    },
    async execute({ task_id }) {
      const token = process.env.DARWIN_TOKEN;
      if (!token) return { error: "No DARWIN_TOKEN available" };

      try {
        const resp = await fetch(`${ETL_API_URL}/${task_id}/toggle`, {
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
    name: "etl_delete_task",
    description: "Delete a task from the ETL todo list.",
    parameters: {
      type: "object",
      properties: {
        task_id: { type: "string", description: "The UUID of the task to delete." },
      },
      required: ["task_id"],
    },
    async execute({ task_id }) {
      const token = process.env.DARWIN_TOKEN;
      if (!token) return { error: "No DARWIN_TOKEN available" };

      try {
        const resp = await fetch(`${ETL_API_URL}/${task_id}`, {
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
        task_id: { type: "string", description: "The UUID of the task to update." },
        title: { type: "string", description: "The new title." },
        details: { type: "string", description: "The new details." },
        ready: { type: "boolean", description: "Whether the task is ready to start." },
      },
      required: ["task_id"],
    },
    async execute({ task_id, title, details, ready }) {
      const token = process.env.DARWIN_TOKEN;
      if (!token) return { error: "No DARWIN_TOKEN available" };

      try {
        const resp = await fetch(`${ETL_API_URL}/${task_id}`, {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ title, details, ready }),
        });
        const json = await resp.json() as any;
        return json.success ? { message: `Task ${task_id} updated.`, task: json.data } : { error: json.error };
      } catch (e: any) {
        return { error: e.message };
      }
    }
  });
}
