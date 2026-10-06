"use client";

import { useState, useTransition } from "react";
import {
  archiveInstructor,
  deleteInstructor,
  removeInstructorAccess,
  updateInstructor,
  type InstructorActionState,
  type InstructorFormState,
} from "../actions";
import InstructorAccess from "./instructor-access";
import {
  InstructorProfileFields,
  profileFormValues,
  type InstructorProfileDefaults,
} from "./instructor-fields";
import { InstructorPhotoManager } from "./instructor-photo";

export type AdminInstructorView = InstructorProfileDefaults & {
  id: number;
  photoUrl: string | null;
  accountEmail: string | null;
  sessionCount: number;
  templateCount: number;
};

// One active instructor: inline edit form, exactly one removal action
// (permanent delete when nothing references them, archive otherwise) and the
// panel-access section. Removal always asks for confirmation and explains
// what stays and what stops.
export default function InstructorRow({ instructor }: { instructor: AdminInstructorView }) {
  const [editing, setEditing] = useState(false);
  const [updateState, setUpdateState] = useState<InstructorFormState>({});
  const [deleteState, setDeleteState] = useState<InstructorActionState>({});
  const [archiveState, setArchiveState] = useState<InstructorActionState>({});
  // Values of the last submit: shown while editing so a refused save keeps
  // everything typed, and after a successful save (until the refreshed page
  // data arrives). `fieldsKey` re-mounts the fields, because React resets
  // uncontrolled inputs once an action completes.
  const [lastSubmitted, setLastSubmitted] = useState<InstructorProfileDefaults | null>(null);
  const [fieldsKey, setFieldsKey] = useState(0);
  const [updatePending, startUpdate] = useTransition();
  const [deletePending, startDelete] = useTransition();
  const [archivePending, startArchive] = useTransition();

  const submitUpdate = (formData: FormData) => {
    const typed = profileFormValues(formData);
    startUpdate(async () => {
      const result = await updateInstructor(instructor.id, formData);
      setUpdateState(result);
      setLastSubmitted(typed);
      setFieldsKey((k) => k + 1);
      // The ok message stays visible below; a refused save keeps the form
      // open with the typed values.
      if (result.ok) setEditing(false);
    });
  };

  const submitDelete = () => {
    startDelete(async () => setDeleteState(await deleteInstructor(instructor.id)));
  };

  const submitArchive = () => {
    startArchive(async () => setArchiveState(await archiveInstructor(instructor.id)));
  };

  // Closing the editor discards unsaved edits: the next open shows the saved
  // values again (the server's, or the last successful save's).
  const closeEditor = () => {
    setEditing(false);
    setLastSubmitted(null);
    setUpdateState({});
  };

  const referenced = instructor.sessionCount + instructor.templateCount > 0;

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          {instructor.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={instructor.photoUrl}
              alt={`Снимка на ${instructor.name}`}
              className="h-12 w-12 shrink-0 rounded-md border border-neutral-200 object-cover object-top"
            />
          ) : (
            <div
              aria-hidden="true"
              className="h-12 w-12 shrink-0 rounded-md border border-dashed border-neutral-300 bg-neutral-50"
            />
          )}
          <div>
            <p className="font-medium">{instructor.name}</p>
            <p className="text-sm text-neutral-500">
              {instructor.specialties} · {instructor.email ?? "без имейл"} ·{" "}
              {instructor.phone ?? "без телефон"}
            </p>
            {referenced && (
              <p className="mt-1 text-xs text-neutral-400">
                {instructor.sessionCount} часа · {instructor.templateCount} шаблона
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <button
            onClick={() => (editing ? closeEditor() : setEditing(true))}
            className="text-neutral-700 hover:underline"
          >
            {editing ? "Скрий" : "Редактирай"}
          </button>
          {referenced ? (
            <form
              action={submitArchive}
              onSubmit={(e) => {
                if (
                  !confirm(
                    `Архивиране на ${instructor.name}?\n\n` +
                      "Планираните часове и резервациите остават и си личат в историята.\n" +
                      "Генерирането на нови часове от шаблоните му спира (шаблоните се деактивират).\n" +
                      "Ако има свързан акаунт, достъпът до инструкторския панел се маха."
                  )
                )
                  e.preventDefault();
              }}
            >
              <button disabled={archivePending} className="text-amber-700 hover:underline disabled:opacity-50">
                {archivePending ? "Архивиране…" : "Архивирай"}
              </button>
            </form>
          ) : (
            <form
              action={submitDelete}
              onSubmit={(e) => {
                if (!confirm(`Изтриване на ${instructor.name}? Това е окончателно.`))
                  e.preventDefault();
              }}
            >
              <button disabled={deletePending} className="text-red-600 hover:underline disabled:opacity-50">
                {deletePending ? "Изтриване…" : "Изтрий"}
              </button>
            </form>
          )}
        </div>
      </div>

      {deleteState.error && <p className="mt-2 text-sm text-red-600">{deleteState.error}</p>}
      {deleteState.ok && <p className="mt-2 text-sm text-green-700">{deleteState.ok}</p>}
      {archiveState.error && <p className="mt-2 text-sm text-red-600">{archiveState.error}</p>}
      {archiveState.ok && <p className="mt-2 text-sm text-green-700">{archiveState.ok}</p>}
      {updateState.error && <p className="mt-2 text-sm text-red-600">{updateState.error}</p>}
      {updateState.ok && <p className="mt-2 text-sm text-green-700">{updateState.ok}</p>}

      {editing && (
        <form
          action={submitUpdate}
          className="mt-3 grid gap-3 border-t border-neutral-100 pt-3 sm:grid-cols-2"
        >
          <InstructorProfileFields
            key={fieldsKey}
            prefix={`ins-${instructor.id}`}
            defaults={lastSubmitted ?? instructor}
            errors={updateState.errors}
          />
          <InstructorPhotoManager
            instructor={{
              id: instructor.id,
              name: instructor.name,
              photoUrl: instructor.photoUrl,
            }}
          />
          <div className="flex flex-wrap gap-3 sm:col-span-2">
            <button
              type="submit"
              disabled={updatePending}
              className="rounded-md bg-neutral-900 px-4 py-1.5 text-sm text-white disabled:opacity-50"
            >
              {updatePending ? "Запазване…" : "Запази"}
            </button>
            <button
              type="button"
              onClick={closeEditor}
              className="text-sm text-neutral-600 hover:underline"
            >
              Отказ
            </button>
          </div>
        </form>
      )}

      <div className="mt-3 border-t border-neutral-100 pt-3 text-sm">
        {instructor.accountEmail ? (
          <form
            action={removeInstructorAccess.bind(null, instructor.id)}
            className="flex flex-wrap items-center justify-between gap-2"
          >
            <span>Достъп до панела: {instructor.accountEmail}</span>
            <button className="text-red-600 hover:underline">Махни достъпа</button>
          </form>
        ) : (
          <InstructorAccess instructorId={instructor.id} />
        )}
      </div>
    </div>
  );
}
