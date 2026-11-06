import { redirect } from "next/navigation";

// Por enquanto a raiz leva direto ao login.
// Quando a autenticação existir, aqui decidiremos entre /login e o painel.
export default function Home() {
  redirect("/login");
}
