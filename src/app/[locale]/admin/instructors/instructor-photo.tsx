"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { removeInstructorPhoto, uploadInstructorPhoto } from "../actions";

// Mirror of MAX_IMAGE_BYTES from src/lib/storage.ts (not imported here:
// storage.ts is server-only). The server re-validates the real bytes anyway.
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

// Labelled file picker with a live preview and client-side size/type hints.
// Purely a UX layer: the server action re-validates the actual bytes.
export function InstructorPhotoInput({
  prefix,
  currentUrl,
  file,
  onFile,
  disabled,
}: {
  prefix: string;
  currentUrl?: string | null;
  file: File | null;
  onFile: (file: File | null) => void;
  disabled?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // The preview URL is created/revoked in the change handler (not an effect):
  // setState-in-effect triggers cascading renders the hooks lint forbids.
  const swapPreview = (url: string | null) => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = url;
    setObjectUrl(url);
  };
  useEffect(
    () => () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    },
    []
  );

  // React resets uncontrolled inputs after form actions; the manager keeps the
  // picked File in state, so re-attach it to the fresh input (best effort).
  useEffect(() => {
    const input = inputRef.current;
    if (file && input && input.files && input.files.length === 0) {
      try {
        const dt = new DataTransfer();
        dt.items.add(file);
        input.files = dt.files;
      } catch {
        // Older browsers: the preview next to the input still shows the pick.
      }
    }
  }, [file]);

  const pick = (picked: File | null) => {
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
    if (!picked) {
      swapPreview(null);
      onFile(null);
      return;
    }
    if (picked.size > MAX_PHOTO_BYTES) {
      setError(
        `Снимката е до 8 MB (тази е ${(picked.size / 1024 / 1024).toFixed(1)} MB).`
      );
      swapPreview(null);
      onFile(null);
      return;
    }
    if (!/^image\/(jpeg|png|webp)$/.test(picked.type)) {
      setError("Позволени са само JPEG, PNG и WebP снимки.");
      swapPreview(null);
      onFile(null);
      return;
    }
    swapPreview(URL.createObjectURL(picked));
    onFile(picked);
  };

  const previewSrc = objectUrl ?? currentUrl;

  return (
    <div>
      <label htmlFor={`${prefix}-photo`} className="block text-sm text-neutral-600">
        Снимка (JPEG, PNG или WebP, до 8 MB)
      </label>
      <input
        ref={inputRef}
        id={`${prefix}-photo`}
        name="photo"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        disabled={disabled}
        aria-invalid={!!error}
        aria-describedby={error ? `${prefix}-photo-error` : undefined}
        onChange={(e) => pick(e.target.files?.[0] ?? null)}
        className="mt-1 block w-full text-sm text-neutral-700 file:mr-3 file:rounded-md file:border-0 file:bg-neutral-900 file:px-3 file:py-1.5 file:text-sm file:text-white"
      />
      {error && (
        <p id={`${prefix}-photo-error`} aria-live="polite" className="mt-1 text-sm text-red-600">
          {error}
        </p>
      )}
      <div className="mt-2 flex items-start gap-3">
        {previewSrc ? (
          // Arbitrary admin photoUrl incl. legacy external URLs: next/image
          // would need per-host config, plain img renders anything.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewSrc}
            alt="Преглед на снимката на инструктора"
            className="h-24 w-24 rounded-md border border-neutral-200 bg-white object-cover object-top"
          />
        ) : (
          <div
            aria-hidden="true"
            className="flex h-24 w-24 items-center justify-center rounded-md border border-dashed border-neutral-300 bg-neutral-50 text-xs text-neutral-400"
          >
            без снимка
          </div>
        )}
        <p className="text-xs text-neutral-500">
          Използва се в профила на инструктора и в списъка с инструктори.
          Качването и премахването действат веднага и не променят останалите
          полета.
        </p>
      </div>
    </div>
  );
}

// Photo upload/replace/remove for an existing (non-archived) instructor.
// Separate from the profile "Запази" form: a photo failure never refuses the
// profile fields, and a profile validation error never blocks the photo.
// Buttons are type="button" on purpose — this sits inside the edit <form>.
export function InstructorPhotoManager({
  instructor,
}: {
  instructor: { id: number; name: string; photoUrl: string | null };
}) {
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<{
    error?: string;
    ok?: string;
    photoUrl?: string | null;
  }>({});
  const [current, setCurrent] = useState<string | null>(instructor.photoUrl);
  const [previewResetKey, setPreviewResetKey] = useState(0);
  const [pending, start] = useTransition();

  const submitUpload = () => {
    if (!file) return;
    const fd = new FormData();
    fd.set("photo", file);
    start(async () => {
      const r = await uploadInstructorPhoto(instructor.id, fd);
      setState(r);
      if (r.ok) {
        setCurrent(r.photoUrl ?? null);
        setFile(null);
        setPreviewResetKey((key) => key + 1);
      }
    });
  };

  const submitRemove = () => {
    if (
      !confirm(
        `Премахване на снимката на ${instructor.name}?\n\nПрофилът ще остане без снимка (ще се покаже стилизиран placeholder). Останалите данни в профила не се променят.`
      )
    )
      return;
    start(async () => {
      const r = await removeInstructorPhoto(instructor.id);
      setState(r);
      if (r.ok) {
        setCurrent(null);
        setFile(null);
        setPreviewResetKey((key) => key + 1);
      }
    });
  };

  return (
    <div className="rounded-md border border-neutral-100 bg-neutral-50/60 p-3 sm:col-span-2">
      <p className="text-sm font-medium text-neutral-700">Снимка</p>
      <InstructorPhotoInput
        key={previewResetKey}
        prefix={`ins-${instructor.id}`}
        currentUrl={current}
        file={file}
        onFile={setFile}
        disabled={pending}
      />
      <div className="mt-2 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={submitUpload}
          disabled={pending || !file}
          className="rounded-md bg-neutral-900 px-4 py-1.5 text-sm text-white disabled:opacity-50"
        >
          {pending ? "Качване…" : "Качи снимката"}
        </button>
        {current && (
          <button
            type="button"
            onClick={submitRemove}
            disabled={pending}
            className="text-sm text-red-600 hover:underline disabled:opacity-50"
          >
            Премахни снимката
          </button>
        )}
      </div>
      {state.error && (
        <p aria-live="polite" className="mt-2 text-sm text-red-600">
          {state.error}
        </p>
      )}
      {state.ok && <p className="mt-2 text-sm text-green-700">{state.ok}</p>}
    </div>
  );
}
