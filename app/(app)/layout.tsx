import { createClient } from "@/lib/supabase/server";
import { AppNav } from "@/components/layout/app-nav";
import { BottomNav } from "@/components/layout/bottom-nav";

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let userName: string | undefined;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle();
    userName = profile?.full_name;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <AppNav userName={userName} />
      {/* Bottom padding clears the fixed mobile tab bar (and the iOS home
          indicator below it) so the last element on any page is never
          trapped underneath it. Removed at sm:, where the bar is hidden. */}
      <div className="flex-1 pb-[calc(3.5rem+env(safe-area-inset-bottom))] sm:pb-0">
        {children}
      </div>
      <BottomNav />
    </div>
  );
}
