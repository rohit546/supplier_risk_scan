import { createServerFn } from "@tanstack/react-start";

import { getPublicApiUrl } from "./config.server";

/**
 * Server function returning the backend URL configured in the deployment
 * environment. The handler runs server-only (getPublicApiUrl + its node:process
 * import are tree-shaken from the client bundle), and the result is serialized
 * to the browser via the root route loader.
 */
export const getRuntimeApiUrl = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ apiUrl: string }> => {
    return { apiUrl: getPublicApiUrl() };
  },
);
