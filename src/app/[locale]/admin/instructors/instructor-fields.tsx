"use client";

import type { InstructorProfileErrors } from "@/lib/instructor-profile";

// Labelled profile fields shared by the create and edit forms. maxLength
// mirrors the DB columns; the server re-validates everything anyway.
export type InstructorProfileDefaults = {
  name: string;
  slug: string;
  specialties: string | null;
  phone: string | null;
  email: string | null;
  bio: string | null;
};

// What the user just typed, extracted from the submitted FormData. React
// resets uncontrolled inputs after every form action, so a refused save
// re-mounts the fields with these values to keep everything typed.
export function profileFormValues(formData: FormData): InstructorProfileDefaults {
  const v = (name: string) => String(formData.get(name) ?? "");
  return {
    name: v("name"),
    slug: v("slug"),
    specialties: v("specialties"),
    phone: v("phone"),
    email: v("email"),
    bio: v("bio"),
  };
}

export function InstructorProfileFields({
  prefix,
  defaults,
  errors,
}: {
  prefix: string;
  defaults?: InstructorProfileDefaults;
  errors?: InstructorProfileErrors;
}) {
  const input = "mt-1 w-full rounded-md border border-neutral-300 px-2 py-1.5";
  const d = defaults;
  return (
    <>
      <div>
        <label htmlFor={`${prefix}-name`} className="block text-sm text-neutral-600">
          Име *
        </label>
        <input
          id={`${prefix}-name`}
          name="name"
          required
          maxLength={128}
          defaultValue={d?.name}
          aria-invalid={!!errors?.name}
          className={input}
        />
        {errors?.name && <p className="mt-1 text-sm text-red-600">{errors.name}</p>}
      </div>
      <div>
        <label htmlFor={`${prefix}-slug`} className="block text-sm text-neutral-600">
          Slug (URL, напр. ani) *
        </label>
        <input
          id={`${prefix}-slug`}
          name="slug"
          required
          maxLength={64}
          defaultValue={d?.slug}
          aria-invalid={!!errors?.slug}
          className={input}
        />
        {errors?.slug && <p className="mt-1 text-sm text-red-600">{errors.slug}</p>}
      </div>
      <div>
        <label htmlFor={`${prefix}-specialties`} className="block text-sm text-neutral-600">
          Специалности (напр. Пилатес)
        </label>
        <input
          id={`${prefix}-specialties`}
          name="specialties"
          maxLength={256}
          defaultValue={d?.specialties ?? ""}
          aria-invalid={!!errors?.specialties}
          className={input}
        />
        {errors?.specialties && <p className="mt-1 text-sm text-red-600">{errors.specialties}</p>}
      </div>
      <div>
        <label htmlFor={`${prefix}-phone`} className="block text-sm text-neutral-600">
          Телефон
        </label>
        <input
          id={`${prefix}-phone`}
          name="phone"
          maxLength={32}
          defaultValue={d?.phone ?? ""}
          aria-invalid={!!errors?.phone}
          className={input}
        />
        {errors?.phone && <p className="mt-1 text-sm text-red-600">{errors.phone}</p>}
      </div>
      <div className="sm:col-span-2">
        <label htmlFor={`${prefix}-email`} className="block text-sm text-neutral-600">
          Имейл
        </label>
        <input
          id={`${prefix}-email`}
          name="email"
          type="email"
          maxLength={256}
          defaultValue={d?.email ?? ""}
          aria-invalid={!!errors?.email}
          className={input}
        />
        {errors?.email && <p className="mt-1 text-sm text-red-600">{errors.email}</p>}
      </div>
      <div className="sm:col-span-2">
        <label htmlFor={`${prefix}-bio`} className="block text-sm text-neutral-600">
          Био
        </label>
        <textarea
          id={`${prefix}-bio`}
          name="bio"
          rows={3}
          defaultValue={d?.bio ?? ""}
          aria-invalid={!!errors?.bio}
          className={input}
        />
        {errors?.bio && <p className="mt-1 text-sm text-red-600">{errors.bio}</p>}
      </div>
    </>
  );
}
