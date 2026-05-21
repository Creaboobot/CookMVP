import { handleGenerateRecipeRequest, handleRefineRecipeRequest } from "./recipe-api.mjs";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/recipes/generate") {
      return handleGenerateRecipeRequest(request, env);
    }

    if (url.pathname === "/api/recipes/refine") {
      return handleRefineRecipeRequest(request, env);
    }

    return env.ASSETS.fetch(request);
  },
};
