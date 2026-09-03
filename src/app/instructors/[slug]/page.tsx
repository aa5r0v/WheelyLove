import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { instructors } from "@/db/schema";

export default async function InstructorPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const db = getDb();
  const [instructor] = await db
    .select()
    .from(instructors)
    .where(eq(instructors.slug, slug));

  if (!instructor) notFound();

  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <div className="grid overflow-hidden border-2 border-accent sm:grid-cols-2">
        <div className="placeholder-media relative aspect-square sm:aspect-auto">
          <span className="absolute bottom-2 right-2 bg-ink/70 px-2 py-1 text-[10px] tracking-widest text-paper/70">
            СНИМКА
          </span>
        </div>
        <div className="flex flex-col justify-center bg-ink p-8 text-paper">
          <p className="inline-block w-fit bg-accent px-2 py-1 text-xs font-semibold tracking-[0.3em] text-accent-ink">
            {instructor.specialties}
          </p>
          <h1 className="font-display mt-3 text-4xl">{instructor.name}</h1>
          <p className="mt-4 text-sm leading-relaxed text-paper/70">
            {instructor.bio}
          </p>

          <div className="mt-6 space-y-1 border-t border-accent/40 pt-4 text-sm">
            {instructor.email && (
              <p>
                <a
                  href={`mailto:${instructor.email}`}
                  className="text-paper/80 underline decoration-accent underline-offset-2 hover:text-paper"
                >
                  {instructor.email}
                </a>
              </p>
            )}
            {instructor.phone && (
              <p>
                <a
                  href={`tel:${instructor.phone}`}
                  className="text-paper/80 underline decoration-accent underline-offset-2 hover:text-paper"
                >
                  {instructor.phone}
                </a>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
