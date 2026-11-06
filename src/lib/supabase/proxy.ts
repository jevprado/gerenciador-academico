import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnv } from "./env";

// Rotas que exigem usuário logado.
const PROTECTED_PREFIXES = ["/inicio"];
// Rotas que não fazem sentido para quem já está logado.
const AUTH_ROUTES = ["/login", "/cadastro"];

// Renova a sessão do Supabase a cada requisição e faz os redirecionamentos básicos.
// A verificação definitiva continua sendo feita em cada página/ação no servidor.
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { url, key } = getSupabaseEnv();

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
        Object.entries(headers).forEach(([k, v]) => response.headers.set(k, v));
      },
    },
  });

  // Não coloque código entre createServerClient e getClaims: isso pode
  // causar logouts aleatórios difíceis de depurar.
  const { data } = await supabase.auth.getClaims();
  const isLoggedIn = Boolean(data?.claims);
  const { pathname } = request.nextUrl;

  const isProtected = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );

  if (pathname === "/") {
    return redirectKeepingCookies(request, response, isLoggedIn ? "/inicio" : "/login");
  }

  if (!isLoggedIn && isProtected) {
    return redirectKeepingCookies(request, response, "/login");
  }

  if (isLoggedIn && AUTH_ROUTES.includes(pathname)) {
    return redirectKeepingCookies(request, response, "/inicio");
  }

  return response;
}

function redirectKeepingCookies(request: NextRequest, from: NextResponse, path: string) {
  const redirect = NextResponse.redirect(new URL(path, request.url));
  from.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  return redirect;
}
