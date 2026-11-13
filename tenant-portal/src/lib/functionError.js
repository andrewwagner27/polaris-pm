// src/lib/functionError.js
// supabase.functions.invoke() reports any non-2xx response as "Edge Function returned a non-2xx status code".
// The function's own message (e.g. invite-tenant's "This tenant already has a portal account…") is in the
// response body, available as error.context (a Response). Returns that message when there is one.
export async function functionErrorMessage(error) {
  if (!error) return "";
  try {
    const ctx = error.context;
    if (ctx && typeof ctx.json === "function") {
      const body = await ctx.clone().json();
      if (body && typeof body.error === "string" && body.error.trim()) return body.error.trim().slice(0, 300);
    }
  } catch { /* not JSON: fall through */ }
  return error.message || "Something went wrong.";
}
