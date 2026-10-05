import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { user } from "@/db/schema";

export async function getSavedPhone(userId: string): Promise<string | null> {
  const [row] = await getDb().select({ phone: user.phone }).from(user).where(eq(user.id, userId));
  return row?.phone ?? null;
}

// Stores an already normalized phone on exactly this user (id comes from the session).
export async function savePhone(userId: string, phone: string) {
  await getDb().update(user).set({ phone, updatedAt: new Date() }).where(eq(user.id, userId));
}
