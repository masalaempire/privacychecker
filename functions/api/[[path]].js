import { handleApi } from "../../server/api.js";

export function onRequest({ request, env }) {
  return handleApi(request, env);
}
