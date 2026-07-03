import type { FlowStepDispatch } from "@murrmure/hub-core";
import type { InvokeService } from "./invoke-service.js";
import { prefixedSpaceId } from "./space-id.js";

export async function dispatchFlowSteps(
  invokeService: InvokeService,
  input: {
    dispatch: FlowStepDispatch[];
    session_id: string;
    run_id: string;
    actor_id: string;
    token_id: string;
  },
): Promise<void> {
  for (const step of input.dispatch) {
    await invokeService.invokeAction({
      space_id: prefixedSpaceId(step.space_id.replace(/^spc_/, "")),
      action_name: step.action_name,
      body: {
        session_id: input.session_id,
        run_id: input.run_id,
        step_id: step.step_id,
        params: step.params,
      },
      actor_id: input.actor_id,
      token_id: input.token_id,
    });
  }
}
