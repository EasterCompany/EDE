import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const EMS_QUOTA_URL = "https://easter.company/api/ems/v1/opengo/quota";

interface QuotaInfo {
  tokens_used: number;
  paid_available: boolean;
}

export default function (pi: ExtensionAPI) {
  pi.on("session_start", (_event, ctx) => {
    let cachedQuota: QuotaInfo | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    const poll = () => {
      fetch(EMS_QUOTA_URL, {
        headers: {
          Authorization: `Bearer ${process.env.DARWIN_TOKEN || ""}`,
        },
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((data: QuotaInfo | null) => { cachedQuota = data; })
        .catch(() => { /* endpoint unavailable */ });
    };

    poll();
    pollTimer = setInterval(poll, 60_000);

    ctx.ui.setFooter((_tui, theme, _footerData) => {
      let disposed = false;

      return {
        invalidate() {},
        render(_width: number): string[] {
          if (disposed) return [];

          // Context usage from pi's built-in API
          const usage = ctx.getContextUsage();
          const ctxPct = usage?.tokens != null && usage?.max != null
            ? Math.round((usage.tokens / usage.max) * 100)
            : null;

          // Model name
          const model = ctx.model?.id ?? "";

          // Quota segment
          let quotaStr = "";
          if (cachedQuota) {
            if (cachedQuota.paid_available) {
              quotaStr = ` ${cachedQuota.tokens_used.toLocaleString()}t`;
            } else {
              quotaStr = " \u26A0\uFE0F$";
            }
          }

          const parts: string[] = [];
          if (ctxPct != null) {
            parts.push(theme.fg("dim", `[${ctxPct}%]`));
          }
          parts.push(theme.fg("accent", model));
          if (quotaStr) {
            parts.push(theme.fg("dim", quotaStr));
          }

          return [parts.join(" ")];
        },
        dispose() {
          disposed = true;
          if (pollTimer) clearInterval(pollTimer);
        },
      };
    });
  });
}
