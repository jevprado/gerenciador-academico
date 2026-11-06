import { redirect } from "next/navigation";

// O proxy decide para onde a raiz vai (/inicio ou /login) conforme a sessão.
// Este redirect é só um fallback.
export default function Home() {
  redirect("/login");
}
