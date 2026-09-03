import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { bookings, classSessions, sports } from "@/db/schema";
import { cancelBooking, confirmCashBooking } from "../actions";

const statusLabels: Record<string, string> = {
  pending: "Изчаква плащане",
  confirmed: "Потвърдена",
  cancelled: "Отказана",
};

const paymentLabels: Record<string, string> = {
  card: "Карта",
  cash: "В брой",
};

export default async function AdminBookingsPage() {
  const db = getDb();
  const allBookings = await db
    .select({
      id: bookings.id,
      status: bookings.status,
      paymentMethod: bookings.paymentMethod,
      userEmail: bookings.userEmail,
      userPhone: bookings.userPhone,
      createdAt: bookings.createdAt,
      startTime: classSessions.startTime,
      sportName: sports.name,
      priceCents: classSessions.priceCents,
    })
    .from(bookings)
    .innerJoin(classSessions, eq(bookings.sessionId, classSessions.id))
    .innerJoin(sports, eq(classSessions.sportId, sports.id))
    .orderBy(desc(bookings.createdAt));

  return (
    <div>
      <h1 className="text-2xl font-bold">Резервации</h1>
      <div className="mt-6 overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-neutral-200 text-neutral-500">
            <tr>
              <th className="px-4 py-2">Клиент</th>
              <th className="px-4 py-2">Телефон</th>
              <th className="px-4 py-2">Спорт</th>
              <th className="px-4 py-2">Час</th>
              <th className="px-4 py-2">Цена</th>
              <th className="px-4 py-2">Плащане</th>
              <th className="px-4 py-2">Статус</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {allBookings.map((b) => (
              <tr key={b.id} className="border-b border-neutral-100">
                <td className="px-4 py-2">{b.userEmail}</td>
                <td className="px-4 py-2">{b.userPhone}</td>
                <td className="px-4 py-2">{b.sportName}</td>
                <td className="px-4 py-2">
                  {b.startTime.toLocaleString("bg-BG")}
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
    </div>
  );
}
