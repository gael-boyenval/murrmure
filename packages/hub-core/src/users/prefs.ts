import type { StudioPersistencePort } from "@murrmure/hub-persistence";
import { addSpaceId } from "../bridge/ids.js";

export interface UserMeProfile {
  actor_id: string;
  landing_space_id?: string;
  suggest_landing?: boolean;
  notify_email?: boolean;
  notify_desktop?: boolean;
}

function prefsToProfile(actor_id: string, prefs: {
  landing_space_id?: string;
  notify_email?: boolean;
  notify_desktop?: boolean;
} | null | undefined): UserMeProfile {
  return {
    actor_id,
    landing_space_id: prefs?.landing_space_id ? addSpaceId(prefs.landing_space_id) : undefined,
    notify_email: prefs?.notify_email !== false,
    notify_desktop: prefs?.notify_desktop !== false,
  };
}

export async function getUserMe(studio: StudioPersistencePort, actor_id: string): Promise<UserMeProfile> {
  const prefs = await studio.getUserPrefs(actor_id);
  return prefsToProfile(actor_id, prefs);
}

export async function patchUserMe(
  studio: StudioPersistencePort,
  actor_id: string,
  patch: {
    landing_space_id?: string | null;
    notify_email?: boolean;
    notify_desktop?: boolean;
  },
): Promise<UserMeProfile> {
  const existing = (await studio.getUserPrefs(actor_id)) ?? {
    actor_id,
    landing_suggest_shown: false,
  };

  let landingBare: string | undefined = existing.landing_space_id;
  if (patch.landing_space_id === null) {
    landingBare = undefined;
  } else if (patch.landing_space_id !== undefined) {
    landingBare = patch.landing_space_id.startsWith("spc_")
      ? patch.landing_space_id.slice(4)
      : patch.landing_space_id;
  }

  const notify_email = patch.notify_email !== undefined ? patch.notify_email : existing.notify_email;
  const notify_desktop = patch.notify_desktop !== undefined ? patch.notify_desktop : existing.notify_desktop;

  await studio.upsertUserPrefs({
    actor_id,
    landing_space_id: landingBare,
    landing_suggest_shown: existing.landing_suggest_shown,
    notify_email,
    notify_desktop,
  });

  return getUserMe(studio, actor_id);
}

/** First successful space link by actor → suggest landing once; never auto-set. */
export async function markSpaceLinkForActor(
  studio: StudioPersistencePort,
  actor_id: string,
): Promise<{ suggest_landing: boolean }> {
  const existing = await studio.getUserPrefs(actor_id);
  if (existing?.landing_suggest_shown) {
    return { suggest_landing: false };
  }

  await studio.upsertUserPrefs({
    actor_id,
    landing_space_id: existing?.landing_space_id,
    landing_suggest_shown: true,
    notify_email: existing?.notify_email,
    notify_desktop: existing?.notify_desktop,
  });

  return { suggest_landing: true };
}
