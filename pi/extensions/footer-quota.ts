import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";

export default function (pi: ExtensionAPI) {
  pi.on("session_start", (_event, ctx) => {
    ctx.ui.setFooter((_tui, theme, _footerData) => {
      return {
        invalidate() {},
        render(width: number): string[] {
          const usage = ctx.getContextUsage();
          const ctxPct = usage?.tokens != null && usage?.max != null
            ? Math.round((usage.tokens / usage.max) * 100)
            : null;

          const model = ctx.model?.id ?? "";
          const modelStr = theme.fg("accent", model);
          const pctStr = ctxPct != null ? theme.fg("dim", `${ctxPct}%`) : "";

          if (!ctxPct) return [modelStr];

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
