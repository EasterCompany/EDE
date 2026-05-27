import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.on("session_start", (_event, ctx) => {
    ctx.ui.setFooter((_tui, theme, _footerData) => {
      return {
        invalidate() {},
        render(_width: number): string[] {
          const usage = ctx.getContextUsage();
          const ctxPct = usage?.tokens != null && usage?.max != null
            ? Math.round((usage.tokens / usage.max) * 100)
            : null;

          const model = ctx.model?.id ?? "";

          const line = ctxPct != null
            ? `${theme.fg("accent", model)} ${theme.fg("dim", `${ctxPct}%`)}`
            : theme.fg("accent", model);

          return [line];
        },
      };
    });
  });
}
