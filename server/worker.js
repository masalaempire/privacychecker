import { handleApi } from "./api.js";

export default {
  fetch(request, env) {
    if (new URL(request.url).pathname.startsWith("/api/")) {
      return handleApi(request, env);
    }

    return env.ASSETS.fetch(request);
  }
};
