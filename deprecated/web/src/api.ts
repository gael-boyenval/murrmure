import { createStudioClient } from "@studio/client";

/** Empty baseUrl → same-origin requests proxied to the daemon by Vite. */
const baseUrl = import.meta.env.VITE_STUDIO_BASE ?? "";

export const client = createStudioClient({ baseUrl });
