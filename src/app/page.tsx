import { redirect } from "next/navigation";

// Force dynamic so this isn't statically prerendered at build time.
export const dynamic = "force-dynamic";

export default function Home() {
  redirect("/dashboard");
}
