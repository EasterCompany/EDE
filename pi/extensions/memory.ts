import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";

// ═════════════════════════════════════════════════════════════════
// SQLite-backed Memory Store with FTS5
// ═════════════════════════════════════════════════════════════════

const MEMORY_DIR = join(process.env.HOME || "/root", ".pi/agent/memory");
const DB_PATH = join(MEMORY_DIR, "memory.db");
const JSONL_PATH = join(MEMORY_DIR, "memory.jsonl");
const GIT_REMOTE = "git@github.com:EasterCompany/EAD.git";

// ── Schema ──────────────────────────────────────────────────────
// Uses standalone FTS5 (not content-sync) for reliability.
// FTS5 indexed columns: key, content, tag_string

const SCHEMA = `
-- Core facts (key-value with metadata)
CREATE TABLE IF NOT EXISTS facts (
    id TEXT PRIMARY KEY,
    key TEXT NOT NULL,
    content TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'user',
    importance REAL NOT NULL DEFAULT 5.0 CHECK(importance >= 0 AND importance <= 10),
    created_at TEXT NOT NULL,
    updated_at TEXT,
    accessed_at TEXT,
    access_count INTEGER NOT NULL DEFAULT 0,
    ttl_seconds INTEGER,
    superseded_by TEXT REFERENCES facts(id)
);

-- Tags (normalized, many-to-many)
CREATE TABLE IF NOT EXISTS tags (
    fact_id TEXT NOT NULL REFERENCES facts(id) ON DELETE CASCADE,
    tag TEXT NOT NULL,
    PRIMARY KEY (fact_id, tag)
);
CREATE INDEX IF NOT EXISTS idx_tags_tag ON tags(tag);

-- Auto-logged episodes (action history)
CREATE TABLE IF NOT EXISTS episodes (
    id TEXT PRIMARY KEY,
    session_id TEXT,
    summary TEXT NOT NULL,
    tool_name TEXT,
    file_path TEXT,
    created_at TEXT NOT NULL
);

-- Internal key-value store (schema version, settings)
CREATE TABLE IF NOT EXISTS kv_store (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- FTS5 full-text search (manually synced with facts)
CREATE VIRTUAL TABLE IF NOT EXISTS facts_fts USING fts5(
    key, content, tag_string,
    tokenize='porter unicode61'
);
`.trim();

// ── Connection & State ─────────────────────────────────────────

let db: DatabaseSync;
let dirty = false;

function ensureDir(): void {
  if (!existsSync(MEMORY_DIR)) mkdirSync(MEMORY_DIR, { recursive: true });
}

function openDb(): void {
  ensureDir();
  db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA journal_mode=WAL");
  db.exec("PRAGMA foreign_keys=ON");

  for (const stmt of SCHEMA.split(";")) {
    const trimmed = stmt.trim();
    if (trimmed.length > 0) db.exec(trimmed + ";");
  }
}

// ── ID Generation ─────────────────────────────────────────────

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

// ── FTS5 Sync Helpers ─────────────────────────────────────────
// We manually sync the FTS5 table alongside facts operations.
// Standalone FTS5 (not content-sync) is more reliable.

function syncFtsInsert(factId: string): void {
  const row = db.prepare("SELECT rowid, key, content FROM facts WHERE id = ?").get(factId) as
    { rowid: number; key: string; content: string } | undefined;
  if (!row) return;
  const tagRows = db.prepare("SELECT tag FROM tags WHERE fact_id = ?").all(factId) as Array<{ tag: string }>;
  const tagString = tagRows.map((t) => t.tag).join(" ");
  db.prepare("INSERT OR REPLACE INTO facts_fts (rowid, key, content, tag_string) VALUES (?, ?, ?, ?)")
    .run(row.rowid, row.key, row.content, tagString);
}

function syncFtsDelete(factId: string): void {
  const row = db.prepare("SELECT rowid FROM facts WHERE id = ?").get(factId) as { rowid: number } | undefined;
  if (row) {
    db.prepare("DELETE FROM facts_fts WHERE rowid = ?").run(row.rowid);
  }
}

// ── Migration from JSONL ──────────────────────────────────────

function migrateFromJsonl(): void {
  if (!existsSync(JSONL_PATH)) return;
  const version = db.prepare("SELECT value FROM kv_store WHERE key = 'schema_version'").get() as
    { value: string } | undefined;
  if (version) return;

  const lines = readFileSync(JSONL_PATH, "utf8").trim().split("\n").filter(Boolean);
  let migrated = 0;

  const STATS_FTS = db.prepare("INSERT INTO facts_fts (rowid, key, content, tag_string) VALUES (?, ?, ?, ?)");
  const insertFact = db.prepare(
    "INSERT OR IGNORE INTO facts (id, key, content, source, importance, created_at, updated_at, accessed_at, access_count, ttl_seconds) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  );
  const insertTag = db.prepare("INSERT OR IGNORE INTO tags (fact_id, tag) VALUES (?, ?)");
  const insertEpisode = db.prepare(
    "INSERT OR IGNORE INTO episodes (id, session_id, summary, tool_name, file_path, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  );

  db.exec("BEGIN");
  try {
    for (const line of lines) {
      try {
        const entry = JSON.parse(line) as Record<string, unknown>;
        if (entry.type === "fact") {
          insertFact.run(
            entry.id,
            (entry.key as string) || entry.id,
            entry.content as string,
            entry.source === "user" ? "user" : "auto",
            (entry.weight as number) ?? 5,
            (entry.created as string) || new Date().toISOString(),
            (entry.updated as string) || null,
            null,
            0,
            null,
          );
          const tags = (entry.tags as string[]) || [];
          for (const tag of tags) {
            if (tag !== "fact") insertTag.run(entry.id as string, tag);
          }
          // Sync FTS
          const rowId = (
            db.prepare("SELECT rowid FROM facts WHERE id = ?").get(entry.id as string) as { rowid: number }
          ).rowid;
          STATS_FTS.run(
            rowId,
            (entry.key as string) || "",
            entry.content as string,
            tags.filter((t) => t !== "fact").join(" "),
          );
          migrated++;
        } else if (entry.type === "episode") {
          insertEpisode.run(
            entry.id as string,
            (entry.session_id as string) || null,
            entry.content as string,
            null,
            null,
            (entry.created as string) || new Date().toISOString(),
          );
        }
      } catch {
        // Skip corrupted entries
      }
    }
    db.prepare("INSERT INTO kv_store (key, value) VALUES ('schema_version', '2')").run();
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  console.log(`[memory] Migrated ${migrated} facts from JSONL`);

  // Backup old JSONL
  try {
    const bak = JSONL_PATH + ".bak";
    if (!existsSync(bak)) writeFileSync(bak, readFileSync(JSONL_PATH));
  } catch { /* best-effort */ }
}

// ── JSONL Export (for EAD.git backup) ─────────────────────────

function exportToJsonl(): void {
  ensureDir();
  const lines: string[] = [];

  const facts = db
    .prepare("SELECT * FROM facts ORDER BY created_at ASC")
    .all() as Array<{
    id: string; key: string; content: string; source: string;
    importance: number; created_at: string; updated_at: string | null;
    accessed_at: string | null; access_count: number; ttl_seconds: number | null;
    superseded_by: string | null;
  }>;

  for (const f of facts) {
    const tagRows = db.prepare("SELECT tag FROM tags WHERE fact_id = ?").all(f.id) as Array<{ tag: string }>;
    lines.push(
      JSON.stringify({
        id: f.id,
        type: "fact",
        key: f.key,
        tags: ["fact", ...tagRows.map((r) => r.tag)],
        content: f.content,
        source: f.source,
        created: f.created_at,
        updated: f.updated_at,
        weight: f.importance,
      }),
    );
  }

  const episodes = db
    .prepare("SELECT * FROM episodes ORDER BY created_at ASC")
    .all() as Array<{
    id: string; session_id: string | null; summary: string;
    tool_name: string | null; file_path: string | null; created_at: string;
  }>;

  for (const e of episodes) {
    lines.push(
      JSON.stringify({
        id: e.id,
        type: "episode",
        tags: ["auto"],
        content: e.summary,
        source: "auto",
        created: e.created_at,
        weight: 1,
        session_id: e.session_id,
        tool_name: e.tool_name,
        file_path: e.file_path,
      }),
    );
  }

  writeFileSync(JSONL_PATH, lines.join("\n") + "\n");
}

// ── Git Operations (best-effort) ──────────────────────────────

let gitAvailable: boolean | null = null;

function checkGit(): boolean {
  if (gitAvailable !== null) return gitAvailable;
  try { execSync("git --version", { stdio: "ignore" }); gitAvailable = true; }
  catch { gitAvailable = false; }
  return gitAvailable;
}

function hasGitRepo(): boolean {
  if (!checkGit()) return false;
  try { execSync("git rev-parse --git-dir", { cwd: MEMORY_DIR, stdio: "ignore" }); return true; }
  catch { return false; }
}

function initGitRepo(): void {
  if (!checkGit() || hasGitRepo()) return;
  try {
    execSync("git init", { cwd: MEMORY_DIR, stdio: "ignore" });
    execSync("git add -A", { cwd: MEMORY_DIR, stdio: "ignore" });
    execSync('git commit -m "init: memory store"', { cwd: MEMORY_DIR, stdio: "ignore" });
    try { execSync(`git remote add origin ${GIT_REMOTE}`, { cwd: MEMORY_DIR, stdio: "ignore" }); }
    catch { /* remote may exist */ }
  } catch { /* best-effort */ }
}

function gitPush(): void {
  if (!hasGitRepo()) return;
  try {
    execSync("git add -A", { cwd: MEMORY_DIR, stdio: "ignore" });
    execSync('git commit -m "sync: memory ' + new Date().toISOString().slice(0, 10) + '"', {
      cwd: MEMORY_DIR, stdio: "ignore",
    });
    execSync("git push origin main", { cwd: MEMORY_DIR, stdio: "ignore", timeout: 10000 });
  } catch { /* best-effort */ }
}

// ── TTL Sweep ─────────────────────────────────────────────────

function sweepExpiredFacts(): number {
  const expired = db
    .prepare(
      "SELECT id FROM facts WHERE ttl_seconds IS NOT NULL AND datetime(created_at, '+' || ttl_seconds || ' seconds') < datetime('now')",
    )
    .all() as Array<{ id: string }>;

  if (expired.length === 0) return 0;

  const del = db.prepare("DELETE FROM facts WHERE id = ?");
  db.exec("BEGIN");
  try {
    for (const e of expired) del.run(e.id);
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  return expired.length;
}

// ── Query Functions ───────────────────────────────────────────

function getFactsByKey(key: string): Array<Record<string, unknown>> {
  return db
    .prepare("SELECT * FROM facts WHERE key = ? ORDER BY updated_at DESC, created_at DESC")
    .all(key) as Array<Record<string, unknown>>;
}

interface SearchOptions {
  types?: string[];
  tags?: string[];
  limit?: number;
}

function searchMemory(query: string, opt?: SearchOptions): Array<Record<string, unknown>> {
  const limit = opt?.limit || 50;
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (query) {
    // FTS5 full-text search via subquery
    const sanitized = query.replace(/['"]/g, "").replace(/[^\w\s\-*()]/g, " ").trim();
    if (sanitized) {
      conditions.push("facts.rowid IN (SELECT rowid FROM facts_fts WHERE facts_fts MATCH ?)");
      params.push(sanitized);
    }
  }

  if (opt?.tags?.length) {
    const tagConditions = opt.tags.map(() => "facts.id IN (SELECT fact_id FROM tags WHERE tag = ?)");
    conditions.push("(" + tagConditions.join(" OR ") + ")");
    for (const t of opt.tags) params.push(t);
  }

  let sql = "SELECT facts.* FROM facts";
  if (conditions.length > 0) sql += " WHERE " + conditions.join(" AND ");
  sql += " ORDER BY facts.importance DESC, facts.accessed_at DESC NULLS LAST LIMIT ?";
  params.push(limit);

  return db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
}

function getTagsForFact(factId: string): string[] {
  const rows = db.prepare("SELECT tag FROM tags WHERE fact_id = ?").all(factId) as Array<{ tag: string }>;
  return rows.map((r) => r.tag);
}

function recordAccess(factId: string): void {
  db.prepare("UPDATE facts SET accessed_at = datetime('now'), access_count = access_count + 1 WHERE id = ?").run(
    factId,
  );
}

// ── Stats ─────────────────────────────────────────────────────

interface MemoryStats {
  facts: number;
  episodes: number;
  total: number;
  expired: number;
  dbSize: number;
  topTags: Array<{ tag: string; count: number }>;
  gitEnabled: boolean;
}

function getMemoryStats(): MemoryStats {
  const factCount = (db.prepare("SELECT COUNT(*) as c FROM facts").get() as { c: number }).c;
  const episodeCount = (db.prepare("SELECT COUNT(*) as c FROM episodes").get() as { c: number }).c;
  const expiredCount = (
    db.prepare(
      "SELECT COUNT(*) as c FROM facts WHERE ttl_seconds IS NOT NULL AND datetime(created_at, '+' || ttl_seconds || ' seconds') < datetime('now')",
    ).get() as { c: number }
  ).c;
  const topTags = db
    .prepare("SELECT tag, COUNT(*) as c FROM tags GROUP BY tag ORDER BY c DESC LIMIT 15")
    .all() as Array<{ tag: string; c: number }>;
  const dbSize = existsSync(DB_PATH) ? readFileSync(DB_PATH).length : 0;

  return {
    facts: factCount,
    episodes: episodeCount,
    total: factCount + episodeCount,
    expired: expiredCount,
    dbSize,
    topTags: topTags.map((t) => ({ tag: t.tag, count: t.c })),
    gitEnabled: hasGitRepo(),
  };
}

// ── Formatting ────────────────────────────────────────────────

function formatFactsForPrompt(facts: Array<Record<string, unknown>>): string {
  if (facts.length === 0) return "";
  const byTag = new Map<string, Array<{ key: string; content: string; importance: number }>>();
  for (const f of facts) {
    const tags = getTagsForFact(f.id as string);
    const primaryTag = tags[0] || "general";
    if (!byTag.has(primaryTag)) byTag.set(primaryTag, []);
    byTag.get(primaryTag)!.push({
      key: f.key as string,
      content: f.content as string,
      importance: f.importance as number,
    });
  }
  let output = "";
  for (const [tag, entries] of byTag) {
    output += "### " + tag + "\n";
    for (const e of entries) {
      output += "- " + (e.key ? "**" + e.key + "**: " : "") + e.content;
      if (e.importance > 7) output += " ⭐";
      output += "\n";
    }
    output += "\n";
  }
  return output;
}

function formatRecallResults(results: Array<Record<string, unknown>>, verbose: boolean): string {
  if (results.length === 0) return "No memories found.";
  let output = "## 🧠 Recall Results (" + results.length + ")\n\n";
  for (let i = 0; i < results.length; i++) {
    const f = results[i];
    const tags = getTagsForFact(f.id as string);
    const tagStr = tags.length ? " [" + tags.join(", ") + "]" : "";
    const imp = f.importance as number;
    const stars = imp >= 9 ? " ⭐⭐⭐" : imp >= 7 ? " ⭐⭐" : imp >= 5 ? " ⭐" : "";
    const content = (f.content as string).slice(0, verbose ? undefined : 300);
    const suffix = !verbose && (f.content as string).length > 300 ? "…" : "";
    output +=
      "### " +
      (i + 1) +
      '. `' +
      f.key +
      '`' +
      tagStr +
      stars +
      "\n> " +
      content +
      suffix +
      "\n> *importance: " +
      imp +
      "/10 · " +
      (f.created_at as string).slice(0, 10) +
      "*\n\n";
  }
  return output;
}

// ═════════════════════════════════════════════════════════════════
// Extension Entry Point
// ═════════════════════════════════════════════════════════════════

export default function (pi: ExtensionAPI) {
  openDb();
  migrateFromJsonl();
  const swept = sweepExpiredFacts();
  if (swept > 0) console.log("[memory] Swept " + swept + " expired facts");

  initGitRepo();
  exportToJsonl();

  // ── Session tracking ──────────────────────────────────────
  const sessionId = "sess_" + Date.now().toString(36);
  let episodeBuffer: string[] = [];
  let actionCount = 0;

  const logEpisode = db.prepare(
    "INSERT INTO episodes (id, session_id, summary, tool_name, file_path, created_at) VALUES (?, ?, ?, ?, ?, datetime('now'))",
  );

  // ── System prompt injection ───────────────────────────────
  pi.on("before_agent_start", async (event, ctx) => {
    const relevant = searchMemory(ctx.cwd, { limit: 20 });
    let memoryBlock = "";
    if (relevant.length > 0) {
      memoryBlock =
        "\n\n## 🧠 Knowledge Base — Relevant Facts\n" +
        "The following facts are relevant to your current context. Use `remember`, `recall`, `forget`, and `memorize` to manage this knowledge.\n\n" +
        formatFactsForPrompt(relevant) +
        "---\n";
    }
    return { systemPrompt: event.systemPrompt + memoryBlock };
  });

  // ── Auto-logging ──────────────────────────────────────────
  pi.on("tool_result", async (event) => {
    actionCount++;
    const input = event.input as Record<string, unknown> | undefined;

    if (event.toolName === "edit" || event.toolName === "write") {
      const path = (input?.path as string) || "unknown";
      logEpisode.run(generateId(), sessionId, "Modified " + path, event.toolName, path);
      dirty = true;
    } else if (event.toolName === "bash" && typeof input?.command === "string" && input.command.length > 30) {
      episodeBuffer.push(input.command.slice(0, 120));
    }

    if (episodeBuffer.length >= 5) {
      logEpisode.run(generateId(), sessionId, "Commands: " + episodeBuffer.join("; "), "bash", null);
      episodeBuffer = [];
      dirty = true;
    }

    if (actionCount >= 10) {
      exportToJsonl();
      if (dirty) gitPush();
      actionCount = 0;
      dirty = false;
    }
  });

  pi.on("session_shutdown", async () => {
    if (episodeBuffer.length > 0) {
      logEpisode.run(generateId(), sessionId, "Commands: " + episodeBuffer.join("; "), "bash", null);
    }
    logEpisode.run(generateId(), sessionId, "Session ended", null, null);
    exportToJsonl();
    if (dirty) gitPush();
    dirty = false;
  });

  setInterval(() => {
    if (dirty) { exportToJsonl(); dirty = false; }
  }, 120000);

  // ── /memory command ───────────────────────────────────────
  pi.registerCommand("memory", {
    description: "Memory: stats, search, or dump",
    handler: async (args, ctx) => {
      const parts = args.trim().split(/\s+/);
      const sub = parts[0]?.toLowerCase();

      if (sub === "stats" || sub === "status") {
        const stats = getMemoryStats();
        ctx.ui.notify("🧠 " + stats.total + " memories (" + stats.facts + " facts, " + stats.episodes + " episodes)", "info");
      } else if (sub === "search" || (parts.length > 0 && sub !== "dump")) {
        const q = parts.slice(sub === "search" ? 1 : 0).join(" ");
        if (!q) { ctx.ui.notify("Usage: /memory search <query>", "info"); return; }
        const results = searchMemory(q, { limit: 10 });
        ctx.ui.notify('🔍 "' + q + '": ' + results.length + " results", "info");
        if (results.length > 0) {
          const lines = results.map((r, i) => "  " + (i + 1) + ". " + r.key + ": " + (r.content as string).slice(0, 80));
          ctx.ui.setWidget("memory", lines, { placement: "belowEditor" });
        }
      } else if (sub === "dump") {
        ctx.ui.notify("📄 DB: " + DB_PATH + " (" + (existsSync(DB_PATH) ? readFileSync(DB_PATH).length + " bytes" : "empty") + ")", "info");
      } else {
        ctx.ui.notify("Usage: /memory [stats|search|dump]", "info");
      }
    },
  });

  // ══════════════════════════════════════════════════════════════
  // Tool: remember
  // ══════════════════════════════════════════════════════════════
  pi.registerTool({
    name: "remember",
    label: "Remember",
    description:
      "Store a fact or piece of knowledge permanently. " +
      "Facts persist across sessions and are injected into the system prompt when relevant. " +
      "Use this to teach Darwin about project architecture, conventions, credentials, or anything " +
      "it should remember long-term.",
    promptSnippet: "Remember a fact or piece of project knowledge",
    promptGuidelines: [
      "Use remember to store project architecture, conventions, and important facts permanently.",
      "Each fact needs a unique key and descriptive content. Add tags for categorization.",
    ],
    parameters: Type.Object({
      key: Type.String({ description: "Unique lookup key (e.g. 'ecg-port', 'deploy-hosts')." }),
      content: Type.String({ description: "The fact or knowledge to remember." }),
      tags: Type.Optional(
        Type.Array(Type.String(), { description: "Tags for categorization, e.g. ['deploy', 'infra', 'eid']" }),
      ),
      weight: Type.Optional(
        Type.Number({ description: "Relevance weight 0-10 (default: 5). Higher = shown more prominently." }),
      ),
      overwrite: Type.Optional(
        Type.Boolean({ description: "If true, overwrite existing fact with same key." }),
      ),
    }),
    required: ["key", "content"],

    async execute(_toolId, params, _signal, _onUpdate, _ctx) {
      const { key, content, tags: inputTags = [], weight = 5, overwrite = false } = params as {
        key: string; content: string; tags?: string[]; weight?: number; overwrite?: boolean;
      };

      db.exec("BEGIN");
      try {
        if (overwrite) {
          const existing = db.prepare("SELECT id FROM facts WHERE key = ? ORDER BY updated_at DESC").all(key) as Array<{ id: string }>;
          for (const e of existing) {
            syncFtsDelete(e.id);
            db.prepare("UPDATE facts SET superseded_by = 'overwritten' WHERE id = ?").run(e.id);
          }
        }

        const id = generateId();
        const now = new Date().toISOString();
        db.prepare(
          "INSERT INTO facts (id, key, content, source, importance, created_at, updated_at) VALUES (?, ?, ?, 'user', ?, ?, ?)",
        ).run(id, key, content, Math.max(0, Math.min(10, weight)), now, overwrite ? now : null);

        const insertTag = db.prepare("INSERT OR IGNORE INTO tags (fact_id, tag) VALUES (?, ?)");
        for (const tag of inputTags) insertTag.run(id, tag);

        syncFtsInsert(id);
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
      dirty = true;

      return {
        content: [{ type: "text", text: "✅ Remembered: `" + key + "`" }],
        details: { action: overwrite ? "updated" : "created", key },
      };
    },
  });

  // ══════════════════════════════════════════════════════════════
  // Tool: recall
  // ══════════════════════════════════════════════════════════════
  pi.registerTool({
    name: "recall",
    label: "Recall",
    description:
      "Retrieve stored facts or memories by key, search query, or tag filter. " +
      "Searches the local memory store. Returns matching entries sorted by relevance.",
    promptSnippet: "Retrieve stored knowledge by key or search",
    promptGuidelines: [
      "Use recall to retrieve facts before asking the user for information you may have already stored.",
      "Search by key for exact match, or by content for fuzzy search.",
    ],
    parameters: Type.Object({
      key: Type.Optional(Type.String({ description: "Exact fact key to look up (e.g. 'ecg-port')." })),
      query: Type.Optional(Type.String({ description: "Search query for fuzzy matching across all memory fields." })),
      tags: Type.Optional(Type.Array(Type.String(), { description: "Filter by tags (e.g. ['deploy', 'infra'])." })),
      types: Type.Optional(Type.Array(Type.String(), { description: "Filter by type: 'fact', 'episode'." })),
      limit: Type.Optional(Type.Number({ description: "Max results (default: 20)." })),
      verbose: Type.Optional(Type.Boolean({ description: "Show full content instead of truncated." })),
    }),

    async execute(_toolId, params, _signal, _onUpdate, _ctx) {
      const { key, query, tags, types, limit = 20, verbose = false } = params as {
        key?: string; query?: string; tags?: string[]; types?: string[]; limit?: number; verbose?: boolean;
      };

      let results: Array<Record<string, unknown>> = [];

      if (key) {
        results = getFactsByKey(key);
        for (const r of results) recordAccess(r.id as string);
      } else if (query || (tags && tags.length > 0)) {
        results = searchMemory(query || "", { tags, limit });
        for (const r of results) recordAccess(r.id as string);
      } else if (types?.includes("episode")) {
        const episodes = db.prepare("SELECT * FROM episodes ORDER BY created_at DESC LIMIT ?").all(limit) as Array<Record<string, unknown>>;
        if (episodes.length === 0) return { content: [{ type: "text", text: "No episodes recorded yet." }], details: { count: 0 } };
        let output = "## 📋 Recent Episodes (" + episodes.length + ")\n\n";
        for (const e of episodes) {
          output += "- **" + (e.created_at as string).slice(0, 19) + "**: " + (e.summary as string).slice(0, 150) + "\n";
        }
        return { content: [{ type: "text", text: output }], details: { count: episodes.length, type: "episodes" } };
      } else {
        results = db.prepare("SELECT * FROM facts ORDER BY importance DESC, accessed_at DESC NULLS LAST LIMIT ?").all(limit) as Array<Record<string, unknown>>;
      }

      if (results.length === 0) {
        const hint = key ? " for `" + key + "`" : query ? ' for "' + query + '"' : "";
        return {
          content: [{ type: "text", text: "No memories found" + hint + ". Use `remember` to store a fact." }],
          details: { count: 0 },
        };
      }

      return {
        content: [{ type: "text", text: formatRecallResults(results, verbose) }],
        details: { count: results.length, keys: results.map((r) => r.key) },
      };
    },
  });

  // ══════════════════════════════════════════════════════════════
  // Tool: forget
  // ══════════════════════════════════════════════════════════════
  pi.registerTool({
    name: "forget",
    label: "Forget",
    description: "Delete a stored fact or memory by key or ID. Use this to remove outdated or incorrect information.",
    promptSnippet: "Delete a stored fact",
    promptGuidelines: ["Use forget to remove outdated or incorrect information from memory."],
    parameters: Type.Object({
      key: Type.Optional(Type.String({ description: "Key of the fact to forget (deletes ALL entries with this key)." })),
      id: Type.Optional(Type.String({ description: "Specific entry ID to forget (from recall results)." })),
      query: Type.Optional(Type.String({ description: "Search query to find memories to forget. Shows matching entries for confirmation." })),
      yes: Type.Optional(Type.Boolean({ description: "Must be true to confirm deletion when using query-based removal." })),
    }),

    async execute(_toolId, params, _signal, _onUpdate, _ctx) {
      const { key, id, query, yes } = params as { key?: string; id?: string; query?: string; yes?: boolean };

      if (id) {
        const existing = db.prepare("SELECT id FROM facts WHERE id = ?").get(id);
        if (!existing) return { content: [{ type: "text", text: "❌ Entry `" + id + "` not found." }], isError: true, details: { error: "not found" } };
        syncFtsDelete(id);
        db.prepare("DELETE FROM facts WHERE id = ?").run(id);
        dirty = true;
        return { content: [{ type: "text", text: "🗑️ Forgotten entry `" + id + "`" }], details: { action: "deleted", id } };
      }

      if (key) {
        const existing = db.prepare("SELECT COUNT(*) as c FROM facts WHERE key = ?").get(key) as { c: number };
        if (existing.c === 0) return { content: [{ type: "text", text: "No facts found with key `" + key + "`." }], details: { deleted: 0 } };
        const ids = db.prepare("SELECT id FROM facts WHERE key = ?").all(key) as Array<{ id: string }>;
        db.exec("BEGIN");
        try {
          for (const row of ids) { syncFtsDelete(row.id); db.prepare("DELETE FROM facts WHERE id = ?").run(row.id); }
          db.exec("COMMIT");
        } catch (e) {
          db.exec("ROLLBACK");
          throw e;
        }
        dirty = true;
        return { content: [{ type: "text", text: "🗑️ Forgotten `" + key + "` (" + existing.c + " entries deleted)" }], details: { action: "deleted", key, count: existing.c } };
      }

      if (query) {
        if (!yes) {
          const results = searchMemory(query, { limit: 20 });
          if (results.length === 0) return { content: [{ type: "text", text: 'No memories found matching "' + query + '".' }], details: { count: 0 } };
          let output = 'Found ' + results.length + ' memories matching "' + query + '". Set `yes: true` to confirm deletion:\n\n';
          results.forEach((e, i) => { output += (i + 1) + '. `' + e.key + '`: ' + (e.content as string).slice(0, 100) + "\n"; });
          return { content: [{ type: "text", text: output }], details: { pending: results.length, query } };
        }
        const results = searchMemory(query);
        let deleted = 0;
        db.exec("BEGIN");
        try {
          for (const e of results) { syncFtsDelete(e.id as string); db.prepare("DELETE FROM facts WHERE id = ?").run(e.id as string); deleted++; }
          db.exec("COMMIT");
        } catch (e) {
          db.exec("ROLLBACK");
          throw e;
        }
        dirty = true;
        return { content: [{ type: "text", text: '🗑️ Forgotten ' + deleted + ' memories matching "' + query + '".' }], details: { action: "deleted", query, count: deleted } };
      }

      return { content: [{ type: "text", text: "Provide a `key`, `id`, or `query` to forget." }], isError: true, details: { error: "no target" } };
    },
  });

  // ══════════════════════════════════════════════════════════════
  // Tool: memorize
  // ══════════════════════════════════════════════════════════════
  pi.registerTool({
    name: "memorize",
    label: "Memorize",
    description:
      "Store multiple facts at once from structured text. " +
      "Each line starting with '- key: content' becomes a fact. " +
      "Use this when learning a new codebase or documenting a system.",
    promptSnippet: "Store multiple facts at once",
    parameters: Type.Object({
      notes: Type.String({
        description:
          "Structured notes. Format:\n" +
          "- key: content text here\n" +
          "- another-key: more content\n\n" +
          "Optional: prefix with [tag1, tag2] for categorization.",
      }),
      tags: Type.Optional(Type.Array(Type.String(), { description: "Default tags for all entries." })),
    }),
    required: ["notes"],

    async execute(_toolId, params, _signal, _onUpdate, _ctx) {
      const { notes, tags: defaultTags = [] } = params as { notes: string; tags?: string[] };

      const lines = notes.split("\n").filter((l) => l.trim().startsWith("- "));
      if (lines.length === 0) {
        return { content: [{ type: "text", text: "No lines found in `- key: value` format." }], isError: true, details: { error: "invalid format" } };
      }

      const insertFact = db.prepare(
        "INSERT INTO facts (id, key, content, source, importance, created_at) VALUES (?, ?, ?, 'user', 5, datetime('now'))",
      );
      const insertTag = db.prepare("INSERT OR IGNORE INTO tags (fact_id, tag) VALUES (?, ?)");

      let stored = 0;
      const ids: string[] = [];

      db.exec("BEGIN");
      try {
        for (const line of lines) {
          let trimmed = line.trim().slice(2);
          let inlineTags: string[] = [];
          const tagMatch = trimmed.match(/^\[([^\]]+)\]\s*/);
          if (tagMatch) {
            inlineTags = tagMatch[1].split(",").map((t) => t.trim());
            trimmed = trimmed.slice(tagMatch[0].length);
          }
          const colonIdx = trimmed.indexOf(": ");
          if (colonIdx === -1) continue;
          const key = trimmed.slice(0, colonIdx).trim();
          const value = trimmed.slice(colonIdx + 2).trim();
          if (!key || !value) continue;

          const id = generateId();
          ids.push(id);
          insertFact.run(id, key, value);
          for (const tag of [...new Set([...defaultTags, ...inlineTags])]) insertTag.run(id, tag);
          syncFtsInsert(id);
          stored++;
        }
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
      dirty = true;
      return { content: [{ type: "text", text: "✅ Memorized " + stored + " fact" + (stored === 1 ? "" : "s") }], details: { stored, ids } };
    },
  });

  // ══════════════════════════════════════════════════════════════
  // Tool: memory_stats
  // ══════════════════════════════════════════════════════════════
  pi.registerTool({
    name: "memory_stats",
    label: "Memory Stats",
    description: "Show statistics about the memory store: total entries, breakdown by type, recent activity.",
    promptSnippet: "Show memory store statistics",
    parameters: Type.Object({}),

    async execute() {
      const stats = getMemoryStats();
      let output =
        "## 🧠 Memory Store\n\n" +
        "**Total entries:** " + stats.total + "\n" +
        "**Database:** " + (stats.dbSize / 1024).toFixed(1) + " KB on disk\n" +
        "**Location:** `" + DB_PATH + "`\n" +
        "**Git backup (EAD):** " + (stats.gitEnabled ? "✅ configured" : "❌ not configured") + "\n\n" +
        "### Breakdown\n\n" +
        "| Type | Count |\n|------|------|\n" +
        "| Facts | " + stats.facts + " |\n" +
        "| Episodes | " + stats.episodes + " |\n" +
        (stats.expired > 0 ? "| Expired (pending sweep) | " + stats.expired + " |\n" : "") +
        "\n";

      if (stats.topTags.length > 0) {
        output += "### Top Tags\n\n";
        for (const t of stats.topTags) output += "- `" + t.tag + "`: " + t.count + "\n";
      }

      return { content: [{ type: "text", text: output }], details: stats };
    },
  });

  // ── Log memory system initialized ─────────────────────────
  logEpisode.run(generateId(), sessionId, "Memory system initialized (SQLite+FTS5)", null, null);
  dirty = true;
}
