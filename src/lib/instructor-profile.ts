// Validation of the admin instructor profile form (create + edit). The limits
// mirror the DB columns in src/db/schema.ts; every message is Bulgarian because
// the admin UI is BG-only.

export type InstructorProfileField =
  | "name"
  | "slug"
  | "specialties"
  | "phone"
  | "email"
  | "bio";

export type InstructorProfileValues = {
  name: string;
  slug: string;
  specialties: string;
  phone: string | null;
  email: string | null;
  bio: string;
};

export type InstructorProfileErrors = Partial<Record<InstructorProfileField, string>>;

// Canonical slug: lowercase latin letters/digits, single inner dashes.
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const field = (fd: FormData, name: string) => String(fd.get(name) ?? "").trim();

export function parseInstructorProfile(fd: FormData): {
  values: InstructorProfileValues;
  errors: InstructorProfileErrors;
} {
  const errors: InstructorProfileErrors = {};

  const name = field(fd, "name");
  if (!name) errors.name = "Въведи име.";
  else if (name.length > 128) errors.name = "Името е до 128 символа.";

  const slug = field(fd, "slug");
  if (!slug) errors.slug = "Въведи slug (напр. ani).";
  else if (slug.length > 64) errors.slug = "Slug-ът е до 64 символа.";
  else if (!SLUG_RE.test(slug))
    errors.slug = "Slug-ът може да съдържа само малки букви, цифри и тирета (напр. ani-marie).";

  const specialties = field(fd, "specialties");
  if (specialties.length > 256) errors.specialties = "Специалностите са до 256 символа.";

  const phone = field(fd, "phone");
  if (phone.length > 32) errors.phone = "Телефонът е до 32 символа.";

  const email = field(fd, "email");
  if (email) {
    if (email.length > 256) errors.email = "Имейлът е до 256 символа.";
    else if (!EMAIL_RE.test(email)) errors.email = "Невалиден имейл.";
  }

  const bio = String(fd.get("bio") ?? "").trim();

  return {
    values: {
      name,
      slug,
      specialties,
      phone: phone || null,
      email: email || null,
      bio,
    },
    errors,
  };
}

// Route/row ids from URLs or bound action arguments must be positive integers.
export function isSafeId(id: unknown): id is number {
  return typeof id === "number" && Number.isSafeInteger(id) && id > 0;
}
