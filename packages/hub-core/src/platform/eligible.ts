import { HandlerSpecSchema } from "@murrmure/contracts";
import type { StudioPersistencePort } from "@murrmure/hub-persistence";
import { addSpaceId, stripSpaceId } from "../bridge/ids.js";
import { handlerBindsDirective } from "./directive.js";

export type DirectiveEligibleSpace = {
  space_id: string;
  name?: string;
  slug?: string;
  handler_id: string;
};

export async function listEligibleDirectiveSpaces(
  studio: StudioPersistencePort,
  filter?: { space_id?: string },
): Promise<DirectiveEligibleSpace[]> {
  const wanted = filter?.space_id ? stripSpaceId(filter.space_id) : undefined;
  const spaces = await studio.listSpaces();
  const out: DirectiveEligibleSpace[] = [];

  for (const space of spaces) {
    const bare = stripSpaceId(space.space_id);
    if (wanted && bare !== wanted) continue;
    const hooks = await studio.listIndexedHooks(bare);
    for (const raw of hooks) {
      const parsed = HandlerSpecSchema.safeParse(raw);
      if (!parsed.success) continue;
      if (!handlerBindsDirective(parsed.data)) continue;
      out.push({
        space_id: addSpaceId(bare),
        name: space.name,
        slug: space.slug,
        handler_id: parsed.data.id,
      });
      break;
    }
  }

  return out;
}
