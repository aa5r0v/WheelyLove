"use client";

import { useState, useTransition } from "react";
import { createInstructor, type InstructorFormState } from "../actions";
import {
  InstructorProfileFields,
  profileFormValues,
  type InstructorProfileDefaults,
} from "./instructor-fields";
import { InstructorPhotoInput } from "./instructor-photo";

export default function InstructorCreateForm() {
  const [state, setState] = useState<InstructorFormState>({});
  // A refused create keeps everything typed (React resets uncontrolled inputs
  // after an action, so the fields re-mount with the submitted values); a
  // successful create clears them for the next entry. The picked photo File
  // lives here for the same reason: it survives the remount and is re-attached
  // to the fresh input by InstructorPhotoInput.
  const [lastSubmitted, setLastSubmitted] = useState<InstructorProfileDefaults | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [fieldsKey, setFieldsKey] = useState(0);
  const [pending, start] = useTransition();

  const submit = (formData: FormData) => {
    const typed = profileFormValues(formData);
    if (photo) formData.set("photo", photo);
    start(async () => {
      const result = await createInstructor(formData);
      setState(result);
      setLastSubmitted(result.ok ? null : typed);
      if (result.ok) setPhoto(null);
      setFieldsKey((k) => k + 1);
    });
  };

  return (
    <form
      action={submit}
      className="mt-6 grid gap-3 rounded-lg border border-neutral-200 bg-white p-5 sm:grid-cols-2"
    >
      <InstructorProfileFields
        key={fieldsKey}
        prefix="new-instructor"
        defaults={lastSubmitted ?? undefined}
        errors={state.errors}
      />
      <div className="sm:col-span-2">
        <InstructorPhotoInput
          key={fieldsKey}
          prefix="new-instructor"
          file={photo}
          onFile={setPhoto}
          disabled={pending}
        />
      </div>
      {state.error && <p className="text-sm text-red-600 sm:col-span-2">{state.error}</p>}
      {state.ok && <p className="text-sm text-green-700 sm:col-span-2">{state.ok}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-neutral-900 px-4 py-1.5 text-white disabled:opacity-50 sm:col-span-2"
      >
        {pending ? "Добавяне…" : "Добави инструктор"}
      </button>
    </form>
  );
}
