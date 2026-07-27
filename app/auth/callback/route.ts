import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { Database } from "@/lib/types/database.types";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next");

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  // The redirect response has to be built up front so the Supabase client can
  // write session cookies directly onto it. Do NOT use lib/supabase/server.ts
  // here: its setAll() swallows cookie writes in a try/catch (correct for
  // Server Components, which cannot set cookies), which would silently drop
  // the session established by exchangeCodeForSession and bounce the user
  // straight back to /login on the next request.
  const response = NextResponse.redirect(`${origin}/`);

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return parseCookieHeader(request.headers.get("cookie") ?? "");
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=link_expired`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(`${origin}/login?error=no_session`);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  // Returning members go to the app (or wherever `next` pointed, as long as
  // it's a same-origin path). Users without a profile still need onboarding —
  // an unaccepted invite link is a valid `next` for them.
  const destination = profile
    ? safeNext(next) ?? "/"
    : safeNext(next) ?? "/onboarding/create-family";

  // Re-point the response rather than creating a new one: a fresh
  // NextResponse.redirect() would drop the session cookies set above.
  return redirectPreservingCookies(response, `${origin}${destination}`);
}

/** Only allow same-origin relative paths, so `next` can't be used as an open redirect. */
function safeNext(next: string | null): string | null {
  if (!next) return null;
  if (!next.startsWith("/") || next.startsWith("//")) return null;
  return next;
}

function parseCookieHeader(header: string): { name: string; value: string }[] {
  if (!header) return [];
  return header.split(";").flatMap((pair) => {
    const index = pair.indexOf("=");
    if (index === -1) return [];
    const name = pair.slice(0, index).trim();
    if (!name) return [];
    return [{ name, value: decodeURIComponent(pair.slice(index + 1).trim()) }];
  });
}

function redirectPreservingCookies(from: NextResponse, url: string) {
  const next = NextResponse.redirect(url);
  from.cookies.getAll().forEach((cookie) => next.cookies.set(cookie));
  return next;
}
