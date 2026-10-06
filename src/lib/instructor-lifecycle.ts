import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { classSessions, instructors, sessionTemplates } from "@/db/schema";
import { unlinkInstructorWithinTx } from "./instructor-link";

// Removal of an instructor row. Everything here runs in ONE transaction and
// locks the instructors row FOR UPDATE first, so archiving, linking and
// deleting serialize on the same row instead of interleaving.

export type DeleteInstructorResult =
  | { ok: true; slug: string; photoUrl: string | null }
  | { ok: false; reason: "not_found" | "referenced"; sessions: number; templates: number };

// Permanent delete, offered only when nothing references the instructor (the
// FKs on class_sessions/session_templates are RESTRICT and must stay that way:
// history is never silently dropped). A still-linked account is unlinked in
// the same transaction (sessions revoked, "instructor" role back to "user").
export async function deleteInstructorRow(instructorId: number): Promise<DeleteInstructorResult> {
  return getDb().transaction(async (tx) => {
    const [ins] = await tx
      .select({ id: instructors.id, slug: instructors.slug, photoUrl: instructors.photoUrl })
      .from(instructors)
      .where(eq(instructors.id, instructorId))
      .for("update");
    if (!ins) return { ok: false as const, reason: "not_found" as const, sessions: 0, templates: 0 };

    const [s] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(classSessions)
      .where(eq(classSessions.instructorId, instructorId));
    const [t] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(sessionTemplates)
      .where(eq(sessionTemplates.instructorId, instructorId));
    if (s.n > 0 || t.n > 0)
      return { ok: false as const, reason: "referenced" as const, sessions: s.n, templates: t.n };

    await unlinkInstructorWithinTx(tx, instructorId);
    await tx.delete(instructors).where(eq(instructors.id, instructorId));
    return { ok: true as const, slug: ins.slug, photoUrl: ins.photoUrl };
  });
}

export type ArchiveInstructorResult =
  | { ok: true; templatesDisabled: number; accessRemoved: boolean }
  | { ok: false; reason: "not_found" | "already_archived" };

// Soft removal: every class, booking and report stays; the recurring templates
// of this instructor are deactivated (the generator creates nothing new) and a
// linked panel account is cut + signed out atomically. The user/account rows
// themselves are never deleted and an admin role is never touched.
export async function archiveInstructorRow(instructorId: number): Promise<ArchiveInstructorResult> {
  return getDb().transaction(async (tx) => {
    const [ins] = await tx
      .select({ archivedAt: instructors.archivedAt })
      .from(instructors)
      .where(eq(instructors.id, instructorId))
      .for("update");
    if (!ins) return { ok: false as const, reason: "not_found" as const };
    if (ins.archivedAt) return { ok: false as const, reason: "already_archived" as const };

    await tx.update(instructors).set({ archivedAt: new Date() }).where(eq(instructors.id, instructorId));
    const disabled = await tx
      .update(sessionTemplates)
      .set({ active: false })
      .where(and(eq(sessionTemplates.instructorId, instructorId), eq(sessionTemplates.active, true)))
      .returning({ id: sessionTemplates.id });
    const accessRemoved = await unlinkInstructorWithinTx(tx, instructorId);
    return { ok: true as const, templatesDisabled: disabled.length, accessRemoved };
  });
}

export type RestoreInstructorResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "not_archived" };

// Only clears archived_at. The account link was cut at archive time and the
// templates were deactivated: neither is restored silently — the admin relinks
// the account and re-enables templates explicitly.
export async function restoreInstructorRow(instructorId: number): Promise<RestoreInstructorResult> {
  return getDb().transaction(async (tx) => {
    const [ins] = await tx
      .select({ archivedAt: instructors.archivedAt })
      .from(instructors)
      .where(eq(instructors.id, instructorId))
      .for("update");
    if (!ins) return { ok: false as const, reason: "not_found" as const };
    if (!ins.archivedAt) return { ok: false as const, reason: "not_archived" as const };
    await tx.update(instructors).set({ archivedAt: null }).where(eq(instructors.id, instructorId));
    return { ok: true as const };
  });
}
