import type { AuthError } from "@supabase/supabase-js";

// Traduz os erros do Supabase Auth para mensagens amigáveis.
// Mensagens de login são genéricas de propósito, para não revelar se um e-mail existe.
export function translateAuthError(error: AuthError): string {
  switch (error.code) {
    case "invalid_credentials":
      return "E-mail ou senha inválidos.";
    case "email_not_confirmed":
      return "Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada.";
    case "weak_password":
      return "Senha muito fraca. Use pelo menos 8 caracteres, misturando letras e números.";
    case "email_address_invalid":
      return "Endereço de e-mail inválido.";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.";
    case "signup_disabled":
      return "Novos cadastros estão temporariamente desativados.";
    default:
      console.error("[auth]", error.code, error.message);
      return "Não foi possível concluir a operação. Tente novamente.";
  }
}
