import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

// ─── DuckDuckGo Web Search (no API key needed) ───────────────────────────────

const DDG_URL = "https://lite.duckduckgo.com/lite/";

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

async function searchDuckDuckGo(query: string, maxResults: number): Promise<SearchResult[]> {
  const params = new URLSearchParams({ q: query });
  const resp = await fetch(`${DDG_URL}?${params}`, {
    headers: { "User-Agent": "Darwin/Search (+https://easter.company)" },
    signal: AbortSignal.timeout(10_000),
  });

  if (!resp.ok) throw new Error(`DuckDuckGo returned ${resp.status}`);

  const html = await resp.text();
  const results: SearchResult[] = [];

  // Parse DDG Lite HTML: links are in <a rel="nofollow" href="URL">Title</a>
  // followed by <span class="snippet">Snippet</span>
  const linkRe = /<a[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/g;
  const snippetRe = /<td[^>]*class=['"]result-snippet['"][^>]*>(.*?)<\/td>/gs;

  // Collect link matches
  const links: Array<{ url: string; title: string }> = [];
  let m;
  while ((m = linkRe.exec(html)) !== null) {
    let url = m[1];
    // Skip internal DDG navigation links (but keep /l/?uddg= redirect links)
    if (url.startsWith("/") && !url.startsWith("//duckduckgo.com/l/?")) continue;
    if (url.startsWith("?") || url === "//duckduckgo.com/" || url.startsWith("//duckduckgo.com/?")) continue;
    // DDG lite wraps external URLs in redirect links — extract real URL
    if (url.startsWith("//duckduckgo.com/l/?")) {
      const params = new URLSearchParams(url.split("?")[1]);
      const real = params.get("uddg");
      if (real) url = decodeURIComponent(real);
    }
    links.push({ url, title: unescapeHTML(m[2]) });
    if (links.length >= maxResults * 2) break;
  }

  // Collect snippets
  const snippets: string[] = [];
  let s;
  while ((s = snippetRe.exec(html)) !== null) {
    snippets.push(cleanSnippet(s[1]));
    if (snippets.length >= maxResults * 2) break;
  }

  // Pair links with snippets
  for (let i = 0; i < Math.min(links.length, snippets.length); i++) {
    results.push({
      title: links[i].title,
      url: links[i].url,
      snippet: snippets[i],
    });
    if (results.length >= maxResults) break;
  }

  return results;
}

function unescapeHTML(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)));
}

function cleanSnippet(s: string): string {
  return unescapeHTML(s.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim());
}

// ─── Stack Overflow Search (free, no API key needed) ─────────────────────────

const SO_API = "https://api.stackexchange.com/2.3";

interface SOResult {
  title: string;
  link: string;
  score: number;
  answerCount: number;
  tags: string[];
}

async function searchStackOverflow(query: string, maxResults: number): Promise<SOResult[]> {
  const params = new URLSearchParams({
    order: "desc",
    sort: "relevance",
    intitle: query,
    site: "stackoverflow",
    pagesize: String(maxResults),
  });

  const resp = await fetch(`${SO_API}/search?${params}`, {
    headers: {
      "User-Agent": "Darwin/StackOverflow (+https://easter.company)",
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (!resp.ok) throw new Error(`StackExchange returned ${resp.status}`);

  const data = await resp.json();
  return (data.items || []).map((item: any) => ({
    title: item.title,
    link: item.link,
    score: item.score,
    answerCount: item.answer_count,
    tags: item.tags,
  }));
}

// ─── GitHub Search (no API key needed, rate-limited to 60/hr) ─────────────────

const GH_API = "https://api.github.com";

interface GHRepoResult {
  fullName: string;
  url: string;
  description: string;
  stars: number;
  language: string | null;
}

async function searchGitHubRepos(query: string, maxResults: number): Promise<GHRepoResult[]> {
  const params = new URLSearchParams({
    q: query,
    per_page: String(maxResults),
    sort: "stars",
    order: "desc",
  });

  const resp = await fetch(`${GH_API}/search/repositories?${params}`, {
    headers: {
      "User-Agent": "Darwin/GitHub (+https://easter.company)",
      Accept: "application/vnd.github.v3+json",
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (!resp.ok) throw new Error(`GitHub returned ${resp.status}`);

  const data = await resp.json();
  return (data.items || []).map((item: any) => ({
    fullName: item.full_name,
    url: item.html_url,
    description: item.description || "(no description)",
    stars: item.stargazers_count,
    language: item.language,
  }));
}

// ─── Register tools ──────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  // ── 1. General web search (DuckDuckGo) ──

  pi.registerTool({
    name: "web_search",
    label: "Web Search",
    description:
      "Search the web using DuckDuckGo. Returns structured results with title, URL, and snippet. " +
      "Use this for researching information, checking facts, finding documentation, " +
      "or when you need information beyond your training data. " +
      "No API key required.",
    promptSnippet: "Search the web (DuckDuckGo) for information",
    promptGuidelines: [
      "Use web_search for any information that might be outside your training data or that you're uncertain about.",
      "Use web_search to find current documentation, version-specific information, or recently released libraries.",
      "Always cite the URL when using information from web search results.",
    ],
    parameters: Type.Object({
      query: Type.String({ description: "Search query. Be specific and include relevant keywords." }),
      maxResults: Type.Optional(
        Type.Number({ description: "Maximum number of results to return (default: 5, max: 10)." })
      ),
    }),
    required: ["query"],

    async execute(_toolCallId, params) {
      try {
        const { query, maxResults = 5 } = params as { query: string; maxResults?: number };
        const limit = Math.min(maxResults, 10);

        const results = await searchDuckDuckGo(query, limit);

        if (results.length === 0) {
          return {
            content: [{ type: "text", text: `No search results found for "${query}". Try different keywords.` }],
            details: { query, results: 0 },
          };
        }

        const md = [
          `## Web Search: "${query}"`,
          "",
          ...results.map((r, i) => [
            `### ${i + 1}. [${r.title}](${r.url})`,
            r.snippet,
            "",
          ].join("\n")),
        ].join("\n");

        return { content: [{ type: "text", text: md }], details: { query, results } };
      } catch (err: any) {
        return {
          content: [{ type: "text", text: `Web search failed: ${err.message}` }],
          isError: true,
          details: { error: err.message },
        };
      }
    },
  });

  // ── 2. Stack Overflow search ──

  pi.registerTool({
    name: "stackoverflow_search",
    label: "Stack Overflow Search",
    description:
      "Search Stack Overflow for programming questions and answers. " +
      "Returns results with title, link, score, answer count, and tags. " +
      "Use this for debugging errors, learning about APIs, or finding solutions to coding problems. " +
      "Rate limited to ~300 requests/day without an API key.",
    promptSnippet: "Search Stack Overflow for programming Q&A",
    promptGuidelines: [
      "Use stackoverflow_search when debugging errors, looking for code examples, or researching API usage.",
      "Prefer results with higher scores and accepted answers (answer count > 0).",
      "Include tags in your query for more targeted results (e.g., 'javascript fetch cors error').",
    ],
    parameters: Type.Object({
      query: Type.String({
        description: "Search query. Include the programming language/library as keywords for best results. Keep queries focused — use 1-3 key terms for best results.",
      }),
      maxResults: Type.Optional(
        Type.Number({ description: "Maximum results (default: 5, max: 10)." })
      ),
    }),
    required: ["query"],

    async execute(_toolCallId, params) {
      try {
        const { query, maxResults = 5 } = params as { query: string; maxResults?: number };
        const limit = Math.min(maxResults, 10);

        const results = await searchStackOverflow(query, limit);

        if (results.length === 0) {
          return {
            content: [{ type: "text", text: `No Stack Overflow results for "${query}".` }],
            details: { query, results: 0 },
          };
        }

        const md = [
          `## Stack Overflow: "${query}"`,
          "",
          ...results.map((r, i) => [
            `### ${i + 1}. [${r.title}](${r.link})`,
            `**Score:** ${r.score} | **Answers:** ${r.answerCount} | **Tags:** ${r.tags.join(", ")}`,
          ].join("\n") + "\n"),
        ].join("\n");

        return { content: [{ type: "text", text: md }], details: { query, results } };
      } catch (err: any) {
        return {
          content: [{ type: "text", text: `Stack Overflow search failed: ${err.message}` }],
          isError: true,
          details: { error: err.message },
        };
      }
    },
  });

  // ── 3. GitHub repository search ──

  pi.registerTool({
    name: "github_search",
    label: "GitHub Search",
    description:
      "Search GitHub for repositories, sorted by stars. " +
      "Returns results with repo name, description, stars, and language. " +
      "Use this to find libraries, tools, or reference implementations. " +
      "Rate limited to ~60 requests/hour without authentication.",
    promptSnippet: "Search GitHub repositories",
    promptGuidelines: [
      "Use github_search to find open-source libraries, tools, or reference implementations.",
      "Include the programming language or framework in your query for best results.",
      "Consider star count as a rough quality signal.",
    ],
    parameters: Type.Object({
      query: Type.String({
        description: "Search query. Include language, framework, or topic keywords.",
      }),
      maxResults: Type.Optional(
        Type.Number({ description: "Maximum results (default: 5, max: 10)." })
      ),
    }),
    required: ["query"],

    async execute(_toolCallId, params) {
      try {
        const { query, maxResults = 5 } = params as { query: string; maxResults?: number };
        const limit = Math.min(maxResults, 10);

        const results = await searchGitHubRepos(query, limit);

        if (results.length === 0) {
          return {
            content: [{ type: "text", text: `No GitHub repositories found for "${query}".` }],
            details: { query, results: 0 },
          };
        }

        const md = [
          `## GitHub: "${query}"`,
          "",
          ...results.map((r, i) => {
            const lang = r.language ? ` | **Lang:** ${r.language}` : "";
            return [
              `### ${i + 1}. [${r.fullName}](${r.url})`,
              `⭐ ${r.stars.toLocaleString()}${lang}`,
              r.description,
              "",
            ].join("\n");
          }),
        ].join("\n");

        return { content: [{ type: "text", text: md }], details: { query, results } };
      } catch (err: any) {
        return {
          content: [{ type: "text", text: `GitHub search failed: ${err.message}` }],
          isError: true,
          details: { error: err.message },
        };
      }
    },
  });

  // ── 4. Documentation site search ──

  const DOC_SITES: Record<string, { name: string; site: string }> = {
    mdn: { name: "MDN Web Docs", site: "developer.mozilla.org" },
    rust: { name: "Rust stdlib / docs.rs", site: "docs.rs" },
    python: { name: "Python docs", site: "docs.python.org" },
    node: { name: "Node.js docs", site: "nodejs.org/docs" },
    npm: { name: "npm docs", site: "docs.npmjs.com" },
    go: { name: "Go pkg docs", site: "pkg.go.dev" },
    arch: { name: "Arch Wiki", site: "wiki.archlinux.org" },
    nix: { name: "nixOS docs", site: "nixos.org" },
    react: { name: "React docs", site: "react.dev" },
    tailwind: { name: "Tailwind CSS docs", site: "tailwindcss.com/docs" },
  };

  pi.registerTool({
    name: "docs_search",
    label: "Documentation Search",
    description:
      "Search within a specific documentation site. " +
      "Pass a site key (mdn, rust, python, node, npm, go, arch, nix, react, tailwind) " +
      "or a custom domain (e.g., 'docs.example.com'). " +
      "Use this to find API references, language docs, or framework guides. " +
      `Known sites: ${Object.entries(DOC_SITES).map(([k, v]) => `${k}=${v.name}`).join(", ")}`,
    promptSnippet: "Search within a specific documentation site (MDN, Rust, Python, etc.)",
    promptGuidelines: [
      "Use docs_search for API references, language documentation, or framework-specific guides.",
      "Prefer docs_search over web_search when looking up known documentation (MDN, Rust stdlib, Python docs).",
      `Known site keys: ${Object.keys(DOC_SITES).join(", ")}. You can also pass any domain.`,
    ],
    parameters: Type.Object({
      query: Type.String({ description: "What to search for within the documentation." }),
      site: Type.String({
        description:
          `Documentation site key or domain. Known keys: ${Object.keys(DOC_SITES).join(", ")}. ` +
          "Or pass any domain like 'docs.example.com'.",
      }),
      maxResults: Type.Optional(
        Type.Number({ description: "Maximum results (default: 5, max: 10)." })
      ),
    }),
    required: ["query", "site"],

    async execute(_toolCallId, params) {
      try {
        const { query, site: siteKey, maxResults = 5 } = params as {
          query: string;
          site: string;
          maxResults?: number;
        };
        const limit = Math.min(maxResults, 10);

        // Resolve site key to domain, or use as-is
        const resolved = DOC_SITES[siteKey.toLowerCase()];
        const domain = resolved ? resolved.site : siteKey;
        const siteName = resolved ? resolved.name : domain;

        const ddgQuery = `site:${domain} ${query}`;
        const results = await searchDuckDuckGo(ddgQuery, limit);

        if (results.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `No results for "${query}" on **${siteName}** (${domain}). Try different keywords.`,
              },
            ],
            details: { query, site: domain, results: 0 },
          };
        }

        const md = [
          `## Docs: "${query}" on ${siteName}`,
          "",
          ...results.map((r, i) => [
            `### ${i + 1}. [${r.title}](${r.url})`,
            r.snippet,
            "",
          ].join("\n")),
        ].join("\n");

        return { content: [{ type: "text", text: md }], details: { query, site: domain, results } };
      } catch (err: any) {
        return {
          content: [{ type: "text", text: `Docs search failed: ${err.message}` }],
          isError: true,
          details: { error: err.message },
        };
      }
    },
  });

  // ── 5. Package registry search ──

  interface PkgResult {
    name: string;
    url: string;
    description: string;
    version?: string;
    downloads?: number;
  }

  async function searchNpm(query: string, limit: number): Promise<PkgResult[]> {
    const resp = await fetch(`https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(query)}&size=${limit}`);
    if (!resp.ok) throw new Error(`npm returned ${resp.status}`);
    const data = await resp.json();
    return (data.objects || []).map((o: any) => ({
      name: o.package?.name,
      url: `https://www.npmjs.com/package/${o.package?.name}`,
      description: o.package?.description || "(no description)",
      version: o.package?.version,
      downloads: o.downloads?.weekly,
    }));
  }

  async function searchCrates(query: string, limit: number): Promise<PkgResult[]> {
    const resp = await fetch(`https://crates.io/api/v1/crates?q=${encodeURIComponent(query)}&per_page=${limit}`,
      { headers: { "User-Agent": "Darwin/Cargo (+https://easter.company)" } }
    );
    if (!resp.ok) throw new Error(`crates.io returned ${resp.status}`);
    const data = await resp.json();
    return (data.crates || []).map((c: any) => ({
      name: c.name,
      url: `https://crates.io/crates/${c.name}`,
      description: c.description || "(no description)",
      version: c.max_stable_version || c.max_version,
      downloads: c.recent_downloads,
    }));
  }

  async function searchPypi(query: string, limit: number): Promise<PkgResult[]> {
    const resp = await fetch(`https://pypi.org/pypi?%3Aaction=search&term=${encodeURIComponent(query)}&submit=`,
      { headers: { Accept: "application/json" } }
    );
    if (!resp.ok) throw new Error(`PyPI returned ${resp.status}`);
    const data = await resp.json();
    return (data.results || []).slice(0, limit).map((r: any) => ({
      name: r.name,
      url: `https://pypi.org/project/${r.name}/`,
      description: r.summary || "(no description)",
      version: r.version,
    }));
  }

  pi.registerTool({
    name: "package_search",
    label: "Package Search",
    description:
      "Search for packages in npm (JavaScript/TypeScript), crates.io (Rust), or PyPI (Python). " +
      "Returns package name, description, version, download count, and link. " +
      "Use this to find libraries, check if a package exists, or discover alternatives.",
    promptSnippet: "Search for packages on npm, crates.io, or PyPI",
    promptGuidelines: [
      "Use package_search to find JavaScript/TypeScript packages (npm), Rust crates (crates.io), or Python packages (PyPI).",
      "Always check the download count and last update as rough quality signals.",
      "Specify the registry matching the project context (npm for JS/TS, crates for Rust, pypi for Python).",
    ],
    parameters: Type.Object({
      query: Type.String({ description: "Package name or keywords to search for." }),
      registry: Type.String({
        description: "Package registry: 'npm', 'crates', or 'pypi'.",
      }),
      maxResults: Type.Optional(
        Type.Number({ description: "Maximum results (default: 5, max: 10)." })
      ),
    }),
    required: ["query", "registry"],

    async execute(_toolCallId, params) {
      try {
        const { query, registry, maxResults = 5 } = params as {
          query: string;
          registry: string;
          maxResults?: number;
        };
        const limit = Math.min(maxResults, 10);

        let results: PkgResult[];
        const reg = registry.toLowerCase();
        if (reg === "npm" || reg === "javascript" || reg === "js" || reg === "ts") {
          results = await searchNpm(query, limit);
        } else if (reg === "crates" || reg === "crate" || reg === "crates.io" || reg === "cargo") {
          results = await searchCrates(query, limit);
        } else if (reg === "pypi" || reg === "python" || reg === "pip") {
          results = await searchPypi(query, limit);
        } else {
          return {
            content: [{ type: "text", text: `Unknown registry "${registry}". Use 'npm', 'crates', or 'pypi'.` }],
            isError: true,
            details: { error: `Unknown registry: ${registry}` },
          };
        }

        if (results.length === 0) {
          return {
            content: [{ type: "text", text: `No packages found for "${query}" on ${registry}.` }],
            details: { query, registry, results: 0 },
          };
        }

        const md = [
          `## Packages: "${query}" on ${registry}`,
          "",
          ...results.map((r, i) => {
            const dl = r.downloads ? ` | 📥 ${r.downloads.toLocaleString()}/wk` : "";
            const ver = r.version ? ` | v${r.version}` : "";
            return [
              `### ${i + 1}. [${r.name}](${r.url})${ver}${dl}`,
              r.description,
              "",
            ].join("\n");
          }),
        ].join("\n");

        return { content: [{ type: "text", text: md }], details: { query, registry, results } };
      } catch (err: any) {
        return {
          content: [{ type: "text", text: `Package search failed: ${err.message}` }],
          isError: true,
          details: { error: err.message },
        };
      }
    },
  });
}
