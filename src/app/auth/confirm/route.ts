import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Destino do link enviado por e-mail (confirmação de cadastro, etc.).
// Aceita os dois formatos do Supabase:
//  - ?code=...                    (template padrão, fluxo PKCE)
//  - ?token_hash=...&type=email   (template customizado, funciona em outro dispositivo)
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = safeNext(searchParams.get("next"));

  const supabase = await createClient();

  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && type
      ? await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
      : { error: new Error("Parâmetros ausentes") };

  if (error) {
    return NextResponse.redirect(new URL("/login?erro=link-invalido", request.url));
  }

  return NextResponse.redirect(new URL(next, request.url));
}

// Só permite redirecionar para caminhos internos (evita open redirect).
function safeNext(value: string | null) {
  if (value && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\")) {
    return value;
  }
  return "/inicio";
}
