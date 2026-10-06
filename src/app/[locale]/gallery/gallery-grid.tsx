"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { StaggerGrid } from "@/app/reveal";

type GalleryItem = {
  id: number;
  type: "image" | "video";
  url: string;
  caption: string | null;
};

const CLOSE_MS = 250;

export default function GalleryGrid({ items }: { items: GalleryItem[] }) {
  const t = useTranslations("gallery");
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [closing, setClosing] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const close = () => {
    setClosing(true);
    closeTimer.current = setTimeout(() => {
      setOpenIndex(null);
      setClosing(false);
    }, CLOSE_MS);
  };
  const showPrev = () =>
    setOpenIndex((i) => (i === null ? null : (i - 1 + items.length) % items.length));
  const showNext = () =>
    setOpenIndex((i) => (i === null ? null : (i + 1) % items.length));

  useEffect(() => {
    if (openIndex === null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
      if (e.key === "ArrowLeft") showPrev();
      if (e.key === "ArrowRight") showNext();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openIndex]);

  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  const active = openIndex !== null ? items[openIndex] : null;

  return (
    <>
      <StaggerGrid className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
        {items.map((item, index) => (
          <figure
            key={item.id}
            className="card-lift group overflow-hidden border-2 border-transparent bg-paper-dim transition-[border-color] hover:border-accent"
          >
            <button
              type="button"
              onClick={() => setOpenIndex(index)}
              className="block w-full cursor-zoom-in"
            >
              {item.type === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.url}
                  alt={item.caption ?? ""}
                  className="h-48 w-full object-cover"
                />
              ) : (
                <video src={item.url} className="h-48 w-full object-cover" muted />
              )}
            </button>
            {item.caption && (
              <figcaption className="p-2 text-sm text-ink/60">
                {item.caption}
              </figcaption>
            )}
          </figure>
        ))}
      </StaggerGrid>

      {active && (
        <div
          data-open={!closing}
          className="lightbox-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={close}
        >
          <button
            onClick={close}
            aria-label={t("close")}
            className="press absolute right-4 top-4 text-3xl text-white/80 hover:text-accent"
          >
            ×
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              showPrev();
            }}
            aria-label={t("prev")}
            className="press absolute left-2 top-1/2 -translate-y-1/2 px-3 py-6 text-4xl text-white/70 hover:text-accent sm:left-6"
          >
            ‹
          </button>

          <div
            data-open={!closing}
            className="lightbox-content max-h-[85vh] max-w-[90vw]"
            onClick={(e) => e.stopPropagation()}
          >
            {active.type === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={active.id}
                src={active.url}
                alt={active.caption ?? ""}
                className="lightbox-media max-h-[85vh] max-w-[90vw] rounded-lg object-contain"
              />
            ) : (
              <video
                key={active.id}
                src={active.url}
                className="lightbox-media max-h-[85vh] max-w-[90vw] rounded-lg"
                controls
                autoPlay
              />
            )}
            {active.caption && (
              <p className="mt-3 text-center text-sm text-white/80">
                {active.caption}
              </p>
            )}
          </div>

          <button
            onClick={(e) => {
              e.stopPropagation();
              showNext();
            }}
            aria-label={t("next")}
            className="press absolute right-2 top-1/2 -translate-y-1/2 px-3 py-6 text-4xl text-white/70 hover:text-accent sm:right-6"
          >
            ›
          </button>
        </div>
      )}
    </>
  );
}
