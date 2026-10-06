import { Link } from "@/i18n/navigation";
import { cancelBooking, confirmCashBooking } from "../actions";
import { requireAdminPage } from "@/lib/admin-page";
import { firstParam, getAdminBookingsPage } from "@/lib/admin-bookings";
import { formatDateTimeShort } from "@/lib/format";

const statusLabels: Record<string, string> = {
  pending: "Плащане на място",
  confirmed: "Потвърдена",
  cancelled: "Отказана",
};

const paymentLabels: Record<string, string> = {
  card: "Карта",
  cash: "В брой",
};

// Базов път за линковете: next-intl Link слага /en само когато локейлът е en,
// така че /admin/bookings и /en/admin/bookings остават коректни.
const BOOKINGS_PATHNAME = "/admin/bookings";

export default async function AdminBookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // Винаги първо guards — преди всяка заявка към базата.
  await requireAdminPage();

  const sp = await searchParams;
  const rawFrom = firstParam(sp.from)?.trim() ?? "";
  const rawTo = firstParam(sp.to)?.trim() ?? "";
  const rawStatus = firstParam(sp.status)?.trim() ?? "";

  const outcome = await getAdminBookingsPage(sp);
  const errorFor = (field: "from" | "to" | "status") =>
    outcome.ok ? undefined : outcome.errors.find((e) => e.field === field)?.message;

  // GET формата няма action → изпраща се към текущия път с нов query string:
  // „page" остава извън формата, така че всяко прилагане/нулиране на филтри
  // връща страницата към 1. Липсата на action пази и локейл префикса (/en/...).
  return (
    <div>
      <h1 className="text-2xl font-bold">Резервации</h1>

      <form
        method="get"
        className="mt-6 flex flex-wrap items-end gap-3 rounded-lg border border-neutral-200 bg-white p-4"
      >
        <div className="flex flex-col gap-1">
          <label htmlFor="bookings-from" className="text-sm text-neutral-600">
            От — дата на тренировката
          </label>
          <input
            id="bookings-from"
            name="from"
            type="date"
            defaultValue={rawFrom}
            aria-invalid={errorFor("from") ? true : undefined}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm"
          />
          {errorFor("from") && (
            <p role="alert" className="text-xs text-red-600">
              {errorFor("from")}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="bookings-to" className="text-sm text-neutral-600">
            До — дата на тренировката
          </label>
          <input
            id="bookings-to"
            name="to"
            type="date"
            defaultValue={rawTo}
            aria-invalid={errorFor("to") ? true : undefined}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm"
          />
          {errorFor("to") && (
            <p role="alert" className="text-xs text-red-600">
              {errorFor("to")}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="bookings-status" className="text-sm text-neutral-600">
            Статус
          </label>
          <select
            id="bookings-status"
            name="status"
            defaultValue={rawStatus}
            aria-invalid={errorFor("status") ? true : undefined}
            className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm"
          >
            <option value="">Всички</option>
            <option value="pending">Плащане на място</option>
            <option value="confirmed">Потвърдена</option>
            <option value="cancelled">Отказана</option>
          </select>
          {errorFor("status") && (
            <p role="alert" className="text-xs text-red-600">
              {errorFor("status")}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            className="rounded-md bg-neutral-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-neutral-700"
          >
            Приложи
          </button>
          <Link
            href={{ pathname: BOOKINGS_PATHNAME }}
            className="text-sm text-neutral-600 underline hover:text-neutral-900"
          >
            Нулирай
          </Link>
        </div>
      </form>

      {!outcome.ok ? (
        <p
          role="alert"
          className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          Филтрите не са валидни, затова списъкът не е показан — поправи датите
          и приложи отново.
        </p>
      ) : (
        <>
          <p aria-live="polite" className="mt-4 text-sm text-neutral-600">
            Общо: {outcome.data.total} резервации · Страница {outcome.data.page} от{" "}
            {outcome.data.totalPages}
          </p>

          {outcome.data.total === 0 ? (
            <p className="mt-6 rounded-lg border border-neutral-200 bg-white p-6 text-center text-sm text-neutral-600">
              {outcome.hasAny
                ? "Няма резервации за избраните филтри."
                : "Все още няма резервации."}
            </p>
          ) : (
            <div
              role="region"
              aria-label="Списък с резервации"
              tabIndex={0}
              className="mt-2 overflow-x-auto rounded-lg border border-neutral-200 bg-white"
            >
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead className="border-b border-neutral-200 text-neutral-500">
                  <tr>
                    <th scope="col" className="px-4 py-2">Клиент</th>
                    <th scope="col" className="px-4 py-2">Телефон</th>
                    <th scope="col" className="px-4 py-2">Тренировка</th>
                    <th scope="col" className="px-4 py-2">Час</th>
                    <th scope="col" className="px-4 py-2">Цена</th>
                    <th scope="col" className="px-4 py-2">Плащане</th>
                    <th scope="col" className="px-4 py-2">Статус</th>
                    <th scope="col" className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {outcome.data.rows.map((b) => (
                    <tr key={b.id} className="border-b border-neutral-100">
                      <td className="px-4 py-2">{b.userEmail}</td>
                      <td className="px-4 py-2">{b.userPhone}</td>
                      <td className="px-4 py-2">{b.sportName}</td>
                      <td className="px-4 py-2">
                        {formatDateTimeShort(b.startTime)}
                      </td>
                      <td className="px-4 py-2">
                        {(b.priceCents / 100).toFixed(2)} €
                      </td>
                      <td className="px-4 py-2">{paymentLabels[b.paymentMethod]}</td>
                      <td className="px-4 py-2">{statusLabels[b.status]}</td>
                      <td className="px-4 py-2 space-x-2">
                        {b.paymentMethod === "cash" && b.status === "pending" && (
                          <form
                            action={async () => {
                              "use server";
                              await confirmCashBooking(b.id);
                            }}
                            className="inline"
                          >
                            <button className="text-green-700 hover:underline">
                              Потвърди плащане
                            </button>
                          </form>
                        )}
                        {b.status !== "cancelled" && (
                          <form
                            action={async () => {
                              "use server";
                              await cancelBooking(b.id);
                            }}
                            className="inline"
                          >
                            <button className="text-red-600 hover:underline">
                              Отказ
                            </button>
                          </form>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <nav
            aria-label="Странициране на резервациите"
            className="mt-4 flex flex-wrap items-center justify-between gap-3"
          >
            {outcome.data.page > 1 ? (
              <Link
                href={{
                  pathname: BOOKINGS_PATHNAME,
                  query: pageQuery(rawFrom, rawTo, rawStatus, outcome.data.page - 1),
                }}
                rel="prev"
                className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100"
              >
                ← Предишна
              </Link>
            ) : (
              <span
                aria-disabled="true"
                className="rounded-md border border-neutral-200 px-3 py-1.5 text-sm text-neutral-300"
              >
                ← Предишна
              </span>
            )}

            <span aria-current="page" className="text-sm text-neutral-600">
              Страница {outcome.data.page} от {outcome.data.totalPages}
            </span>

            {outcome.data.page < outcome.data.totalPages ? (
              <Link
                href={{
                  pathname: BOOKINGS_PATHNAME,
                  query: pageQuery(rawFrom, rawTo, rawStatus, outcome.data.page + 1),
                }}
                rel="next"
                className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100"
              >
                Следваща →
              </Link>
            ) : (
              <span
                aria-disabled="true"
                className="rounded-md border border-neutral-200 px-3 py-1.5 text-sm text-neutral-300"
              >
                Следваща →
              </span>
            )}
          </nav>
        </>
      )}
    </div>
  );
}

// Валидните филтри се пазят в линковете за страници; page=1 се пропуска
// (чист URL за първата страница).
function pageQuery(from: string, to: string, status: string, page: number) {
  const query: Record<string, string> = {};
  if (from) query.from = from;
  if (to) query.to = to;
  if (status) query.status = status;
  if (page > 1) query.page = String(page);
  return query;
}
