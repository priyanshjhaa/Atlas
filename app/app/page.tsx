import { DashboardPage } from "@/components/features/dashboard";
import { requireAtlasSession } from "@/lib/auth-session";

export default async function Page() {
  const session = await requireAtlasSession();
  return <DashboardPage userName={session.user.name} />;
}
