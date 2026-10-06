"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { GalleryItem } from "./bands";
import s from "./gallery.module.css";

// Close animation length — must match the .dialog transition duration in
// gallery.module.css (230ms).
const CLOSE_MS = 230;

// Distance a horizontal swipe must travel to count as navigation.
const SWIPE_MIN_PX = 48;

export default function Lightbox({
  items,
  index,
  onNavigate,
  onClose,
}: {
  items: GalleryItem[];
  index: number | null;
  onNavigate: (index: number) => void;
  onClose: () => void;
}) {
  const t = useTranslations("gallery");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closingRef = useRef(false);
  const swipedRef = useRef(false);
  const swipeRef = useRef<{ x: number; y: number; pointerId: number } | null>(
    null
  );
  const [closing, setClosing] = useState(false);
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);

  const count = items.length;
  const safeIndex = index !== null && index >= 0 && index < count ? index : null;
  const open = safeIndex !== null;
  const active = open ? items[safeIndex] : null;
  const multi = count > 1;

  // Animated close: flip data-closing, let the CSS transition play, then run
  // the native close(). The only timer in the component; cleared before it
  // can race a reopen or the unmount cleanup.
  const requestClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => {
      closeTimer.current = null;
      dialogRef.current?.close();
    }, window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 120 : CLOSE_MS);
  }, []);

  // close/cancel are wired as native listeners so every trigger path
  // (Escape, our button, programmatic close) behaves identically.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleClose = () => {
      closingRef.current = false;
      setClosing(false);
      if (closeTimer.current) {
        clearTimeout(closeTimer.current);
        closeTimer.current = null;
      }
      onClose();
      // Focus return: back to the tile that opened the viewer.
      openerRef.current?.focus?.();
      openerRef.current = null;
    };
    const handleCancel = (e: Event) => {
      e.preventDefault();
      requestClose();
    };
    dialog.addEventListener("close", handleClose);
    dialog.addEventListener("cancel", handleCancel);
    return () => {
      dialog.removeEventListener("close", handleClose);
      dialog.removeEventListener("cancel", handleCancel);
    };
  }, [onClose, requestClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      openerRef.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      setBrokenUrl(null);
      dialog.showModal();
    } else if (!open && dialog.open && !closingRef.current) {
      // The parent dropped the index (e.g. the collection shrank); sync.
      dialog.close();
    }
  }, [open]);

  // Unmount cleanup: pending timer, open dialog, focus — leave nothing behind.
  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
      closingRef.current = false;
      const dialog = dialogRef.current;
      if (dialog?.open) dialog.close();
      openerRef.current?.focus?.();
      openerRef.current = null;
    },
    []
  );

  // Preload neighbour images so arrow navigation swaps media instantly.
  useEffect(() => {
    if (safeIndex === null || count < 2) return;
    for (const delta of [1, -1]) {
      const neighbour = items[(safeIndex + delta + count) % count];
      if (neighbour?.type === "image") {
        const img = new Image();
        img.src = neighbour.url;
      }
    }
  }, [safeIndex, items, count]);

  const go = useCallback(
    (delta: number) => {
      if (safeIndex === null || count < 2 || closingRef.current) return;
      onNavigate((safeIndex + delta + count) % count);
    },
    [safeIndex, count, onNavigate]
  );

  // Arrow navigation is immediate state, no debounce/timer. Skipped when the
  // key press belongs to the video's own controls (they use arrows for
  // seeking/volume) — the viewer must not steal them.
  const onKeyDown = (e: React.KeyboardEvent<HTMLDialogElement>) => {
    if (
      e.key !== "ArrowLeft" &&
      e.key !== "ArrowRight"
    )
      return;
    if (e.target !== e.currentTarget) {
      const target = e.target as HTMLElement;
      if (target.closest("video")) return;
    }
    e.preventDefault();
    go(e.key === "ArrowLeft" ? -1 : 1);
  };

  // Horizontal swipe navigation on the stage; vertical drags keep scrolling
  // (touch-action: pan-y). Gestures starting on the video are left to its
  // native controls.
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!e.isPrimary || e.button !== 0) return;
    swipedRef.current = false;
    if ((e.target as HTMLElement).closest("video")) {
      swipeRef.current = null;
      return;
    }
    swipeRef.current = { x: e.clientX, y: e.clientY, pointerId: e.pointerId };
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const start = swipeRef.current;
    swipeRef.current = null;
    if (!start || start.pointerId !== e.pointerId) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.abs(dx) >= SWIPE_MIN_PX && Math.abs(dx) > Math.abs(dy) * 1.5) {
      swipedRef.current = true;
      go(dx < 0 ? 1 : -1);
    }
  };

  // Backdrop click: a click that hit the dialog element itself.
  const onBackdropClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (swipedRef.current) { swipedRef.current = false; return; }
    const target = e.target as HTMLElement;
    if (target === dialogRef.current || target.classList.contains(s.shell) || target.classList.contains(s.stage)) requestClose();
  };

  const caption = active?.caption?.trim() || null;
  const alt =
    caption ?? (active?.type === "video" ? t("videoLabel") : t("altFallback"));

  return (
    <dialog
      ref={dialogRef}
      className={s.dialog}
      data-closing={closing}
      aria-label={t("title")}
      onKeyDown={onKeyDown}
      onClick={onBackdropClick}
    >
      {active && safeIndex !== null && (
        <>
          <div className={s.topbar}>
            {multi && (
              <span className={s.counter}>
                {t("counter", { current: safeIndex + 1, total: count })}
              </span>
            )}
            <button
              type="button"
              className={s.iconBtn}
              aria-label={t("close")}
              onClick={requestClose}
            >
              ×
            </button>
          </div>

          {multi && (
            <>
              <button
                type="button"
                className={`${s.iconBtn} ${s.sidePrev}`}
                aria-label={t("prev")}
                onClick={() => go(-1)}
              >
                <span className={s.sideBtnFont} aria-hidden="true">
                  ‹
                </span>
              </button>
              <button
                type="button"
                className={`${s.iconBtn} ${s.sideNext}`}
                aria-label={t("next")}
                onClick={() => go(1)}
              >
                <span className={s.sideBtnFont} aria-hidden="true">
                  ›
                </span>
              </button>
            </>
          )}

          <div
            className={s.shell}
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
            onPointerCancel={() => { swipeRef.current = null; }}
          >
            <div className={s.stage}>
              {brokenUrl === active.url ? (
                <p className={s.brokenStage} role="status">
                  {t("brokenMedia")}
                </p>
              ) : active.type === "image" ? (
                // Uploads are nginx-served files under /uploads/, not pipeline
                // assets — a plain img with intrinsic sizing is the contract.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={active.id}
                  src={active.url}
                  alt={alt}
                  className={s.mediaAnim}
                  onError={() => setBrokenUrl(active.url)}
                />
              ) : (
                <video
                  key={active.id}
                  src={active.url}
                  controls
                  autoPlay
                  muted
                  playsInline
                  aria-label={alt}
                  className={s.mediaAnim}
                  onError={() => setBrokenUrl(active.url)}
                />
              )}
            </div>
          </div>

          {caption && <p className={s.captionBar}>{caption}</p>}
          <p className="sr-only" aria-live="polite">
            {alt}
          </p>
        </>
      )}
    </dialog>
  );
}
