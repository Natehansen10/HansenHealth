"use server";

import { createClient } from "@/lib/supabase/server";

export async function setFamilyPrizes(prefs: {
  individual_prize_description: string;
  group_prize_description: string;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Your session expired. Please sign in again." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("family_id, role")
    .eq("id", user.id)
    .single();

  if (!profile?.family_id || profile.role !== "admin") {
    return { error: "Only a family admin can set prizes." };
  }

  const { error } = await supabase.from("family_prizes").upsert(
    {
      family_id: profile.family_id,
      individual_prize_description: prefs.individual_prize_description || null,
      group_prize_description: prefs.group_prize_description || null,
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    },
    { onConflict: "family_id" },
  );

  if (error) {
    console.error("setFamilyPrizes failed", error);
    return { error: error.message };
  }

  return { error: null };
}
