import { desc } from "drizzle-orm";
import { getDb } from "@/db";
import { galleryItems } from "@/db/schema";
import { deleteGalleryItem, uploadGalleryItem } from "../actions";

export default async function AdminGalleryPage() {
  const db = getDb();
  const items = await db
    .select()
    .from(galleryItems)
    .orderBy(desc(galleryItems.createdAt));

  return (
    <div>
      <h1 className="text-2xl font-bold">Галерия</h1>

      <form
        action={uploadGalleryItem}
        className="mt-6 flex flex-wrap items-end gap-3 rounded-lg border border-neutral-200 bg-white p-5"
      >
        <div>
          <label className="block text-xs font-medium text-neutral-600">
            Файл (JPEG, PNG, WebP до 8 MB или MP4 до 50 MB)
          </label>
          <input
            type="file"
            name="file"
            accept="image/jpeg,image/png,image/webp,video/mp4"
            required
            className="mt-1"
          />
        </div>
        <div className="flex-1">
          <label className="block text-xs font-medium text-neutral-600">
            Описание
          </label>
          <input
            name="caption"
            className="mt-1 w-full rounded-md border border-neutral-300 px-2 py-1.5"
          />
        </div>
        <button
          type="submit"
          className="rounded-md bg-neutral-900 px-4 py-1.5 text-white"
        >
          Качи
        </button>
      </form>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {items.map((item) => (
          <div
            key={item.id}
            className="group relative overflow-hidden rounded-lg border border-neutral-200 bg-white"
          >
            {item.type === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.url}
                alt={item.caption ?? ""}
                className="h-32 w-full object-cover"
              />
            ) : (
              <video src={item.url} className="h-32 w-full object-cover" muted />
            )}
            <form
              action={async () => {
                "use server";
                await deleteGalleryItem(item.id);
              }}
              className="absolute right-1 top-1"
            >
              <button className="rounded bg-black/60 px-2 py-0.5 text-xs text-white opacity-0 group-hover:opacity-100">
                Изтрий
              </button>
            </form>
          </div>
        ))}
      </div>
    </div>
  );
}
