import * as p from "@clack/prompts";

export function printDesktopHandoff(options: {
  hubUrl: string;
  spaceId: string;
  flowId?: string;
}): void {
  const runHint = options.flowId
    ? `Desktop → space home → **Run** on \`${options.flowId}\` — you land in the flow's **ViewCanvasHost** custom view at checkpoint steps.`
    : "Desktop → space home → **Run** on your indexed flow — checkpoint steps open in **ViewCanvasHost** (custom view canvas), not shell admin chrome.";

  p.note(
    [
      "1. Open Murrmure Desktop (or reload if already running)",
      `2. Confirm space \`${options.spaceId}\` appears in the sidebar`,
      `3. ${runHint}`,
      "",
      "Shell chrome (flowchart, gate inbox) is operator/admin mode — your workflow's custom views are the human OS.",
      `Hub: ${options.hubUrl}`,
    ].join("\n"),
    "Desktop handoff",
  );
}
