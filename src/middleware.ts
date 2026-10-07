import { defineMiddleware } from "astro:middleware";
import { createClient } from "@/lib/supabase";
import type { Role } from "@/types";

const PROTECTED_ROUTES = [
  "/dashboard",
  "/matches",
  "/api/matches",
  "/api/tips",
  "/league",
  "/api/league",
  "/api/results",
];

export const onRequest = defineMiddleware(async (context, next) => {
  const supabase = createClient(context.request.headers, context.cookies);

  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    context.locals.user = user ?? null;

    if (user) {
      // Missing profile row or a query error falls back to the least-privileged role.
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle<{ role: Role }>();
      // eslint-disable-next-line no-console
      if (error) console.error(error.message);
      context.locals.role = !error && profile?.role === "organizer" ? "organizer" : "employee";
    } else {
      context.locals.role = null;
    }
  } else {
    context.locals.user = null;
    context.locals.role = null;
  }

  if (PROTECTED_ROUTES.some((route) => context.url.pathname.startsWith(route))) {
    if (!context.locals.user) {
      return context.redirect("/auth/signin");
    }
  }

  return next();
});
