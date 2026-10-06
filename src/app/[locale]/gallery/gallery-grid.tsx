"use client";

import { useCallback, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { StaggerGrid } from "@/app/reveal";
import Lightbox from "./lightbox";
import { planBands, type GalleryItem } from "./bands";
import s from "./gallery.module.css";

const SLOT_CLASSES = ["slotA", "slotB", "slotC"] as const;

function Tile({
  item,
  index,
  slot,
  eager,
  onOpen,
}: {
  item: GalleryItem;
  index: number;
  slot: number;
  eager: boolean;
  onOpen: (index: number) => void;
}) {
  const t = useTranslations("gallery");
  const [broken, setBroken] = useState(false);
  const alt = item.caption?.trim() || t("altFallback");

  return (
    <figure className={`${s.tile} ${s[SLOT_CLASSES[slot]] ?? ""}`}>
      <button
        type="button"
        className={s.tileBtn}
        aria-label={t("openMedia", { caption: alt })}
        onClick={() => onOpen(index)}
      >
        <span className={s.frame}>
          {broken ? (
            <span className={s.brokenTile} role="status">
              {t("brokenMedia")}
            </span>
          ) : item.type === "image" ? (
            // Uploads are nginx-served files under /uploads/ with unknown
            // dimensions; a plain img inside a fixed-ratio frame is the
            // contract. The lead image is the only eager one.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.url}
              alt={alt}
              loading={eager ? "eager" : "lazy"}
              {...(eager ? { fetchPriority: "high" } : {})}
              className={s.media}
              onError={() => setBroken(true)}
            />
          ) : (
            <video
              src={item.url}
              muted
              playsInline
              preload="metadata"
              aria-label={alt}
              className={s.media}
              onError={() => setBroken(true)}
            />
          )}
          {item.type === "video" && !broken && (
            <span className={s.badge} aria-hidden="true">
              {t("videoLabel")}
            </span>
          )}
          <span className={s.openHint} aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M14 4h6v6M20 4l-7 7M10 20H4v-6M4 20l7-7" />
            </svg>
          </span>
        </span>
      </button>
      {item.caption?.trim() ? (
        <figcaption className="mt-2 px-1 text-sm text-ink/60">
          {item.caption}
        </figcaption>
      ) : null}
    </figure>
  );
}

export default function GalleryGrid({ items }: { items: GalleryItem[] }) {
  const bands = useMemo(() => planBands(items.length), [items.length]);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const handleClose = useCallback(() => setOpenIndex(null), []);

  return (
    <>
      <div className={s.bands}>
        {bands.map((band) => (
          <StaggerGrid
            key={band.slots[0]}
            className={`${s.band} ${s[band.archetype]}`}
          >
            {band.slots.map((itemIndex, slot) => (
              <Tile
                key={items[itemIndex].id}
                item={items[itemIndex]}
                index={itemIndex}
                slot={slot}
                eager={itemIndex === 0}
                onOpen={setOpenIndex}
              />
            ))}
          </StaggerGrid>
        ))}
      </div>
      <Lightbox
        items={items}
        index={openIndex}
        onNavigate={setOpenIndex}
        onClose={handleClose}
      />
    </>
  );
}
