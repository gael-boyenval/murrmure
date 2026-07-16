import { useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@murrmure/shell-ui";
import { SharedFlowPage } from "../components/SharedFlowPage.js";
import { useShellClient } from "../providers/ShellClientProvider.js";

export function FlowPreviewPage() {
  const { spaceId, flowId } = useParams();
  const [searchParams] = useSearchParams();
  const originSpaceId = searchParams.get("origin_space_id") ?? spaceId;
  const client = useShellClient();
  const navigate = useNavigate();
  const [selectedStepId, setSelectedStepId] = useState<string | undefined>();

  const previewQuery = useQuery({
    queryKey: ["flow-preview", originSpaceId, flowId],
    queryFn: () => client!.spaces.flowPreview(originSpaceId!, flowId!),
    enabled: Boolean(client && originSpaceId && flowId),
  });

  const preview = previewQuery.data;
  const runMutation = useMutation({
    mutationFn: () => client!.spaces.runFlow(flowId!, { space_id: originSpaceId, input: {} }),
    onSuccess: (result) => navigate(`/sessions/${result.session.session_id}`),
  });

  return (
    <SharedFlowPage
      title={preview?.name ?? flowId ?? "Flow"}
      subtitle={preview?.digest}
      status="Applied preview"
      backHref={`/spaces/${spaceId}`}
      backLabel="Back to space"
      graph={preview?.graph}
      graphFallback={
        <p className="text-sm text-muted-foreground">
          {previewQuery.isError ? "Flow preview is unavailable." : "Loading flowchart…"}
        </p>
      }
      selectedStepId={selectedStepId}
      onSelectStep={setSelectedStepId}
      actions={
        preview?.manual && preview.can_run ? (
          <Button onClick={() => runMutation.mutate()} disabled={runMutation.isPending}>
            {runMutation.isPending ? "Starting…" : "Run"}
          </Button>
        ) : null
      }
    />
  );
}
