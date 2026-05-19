import { handleGenerateRecipeRequest } from "./recipe-api.mjs";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/recipes/generate") {
      return handleGenerateRecipeRequest(request, env);
    }

    return env.ASSETS.fetch(request);
  },
};
