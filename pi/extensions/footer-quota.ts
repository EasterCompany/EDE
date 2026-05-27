import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";

function estimateTokens(msg: any): number {
  const c = msg.content;
  if (typeof c === "string") return Math.ceil(c.length / 4);
  if (Array.isArray(c)) {
    return c.reduce((s: number, p: any) => s + (p.text?.length ?? 0) / 4, 0);
  }
  return 40;
}

function scanSession(ctx: any): number | null {
  const cw = ctx.model?.contextWindow;
  if (!cw || cw <= 0) return null;
  let total = 0;
  try {
    for (const entry of ctx.sessionManager.getBranch()) {
      if (entry.type === "message" || entry.type === "custom") {
        total += estimateTokens(entry.message ?? entry);
      }
    }
  } catch {
    return null;
  }
  return Math.round((total / cw) * 100);
}

export default function (pi: ExtensionAPI) {
  let cachedPct: number | null = null;

  function update(ctx: any) {
    // Prefer pi's built-in usage tracking (now works with our camelCase fix)
    const usage = ctx.getContextUsage();
    if (usage?.tokens != null && usage?.max != null && usage.max > 0) {
      cachedPct = Math.round((usage.tokens / usage.max) * 100);
    } else {
      // Fallback: estimate from session entries
      cachedPct = scanSession(ctx);
    }
  }

  pi.on("turn_end", (_event, ctx) => update(ctx));
  pi.on("agent_end", (_event, ctx) => update(ctx));

  pi.on("session_start", (_event, ctx) => {
    update(ctx);

    ctx.ui.setFooter((_tui, theme, _footerData) => {
      return {
        invalidate() {},
        render(width: number): string[] {
          const model = ctx.model?.id ?? "";
          const modelStr = theme.fg("accent", model);

          if (cachedPct == null) return [modelStr];

          const pctStr = theme.fg("dim", `${cachedPct}%`);
          const modelW = visibleWidth(modelStr);
          const pctW = visibleWidth(pctStr);
          const gap = width - modelW - pctW;
          const pad = gap > 0 ? " ".repeat(gap) : " ";

          return [modelStr + pad + pctStr];
        },
      };
    });
  });
}
