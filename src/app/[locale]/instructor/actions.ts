"use server";

import { revalidatePath } from "next/cache";
import {
  ATTENDANCE_VALUES,
  getInstructorForSession,
  setBookingAttendance,
  type AttendanceValue,
} from "@/lib/instructor";

const ERRORS = {
  not_found: "Резервацията не е намерена в твой час.",
  not_started: "Присъствие може да се отбелязва само за час, който е започнал.",
  not_active: "Резервацията не е активна или часът е отменен.",
} as const;

// Session check -> instructor row -> the session is his -> the booking is in
// that session (all enforced again inside setBookingAttendance).
export async function markAttendance(sessionId: number, bookingId: number, attendance: string) {
  const instructor = await getInstructorForSession();
  if (!instructor) throw new Error("Нямаш достъп.");

  if (!Number.isSafeInteger(sessionId) || sessionId <= 0) throw new Error("Невалиден час.");
  if (!Number.isSafeInteger(bookingId) || bookingId <= 0) throw new Error("Невалидна резервация.");
  if (!(ATTENDANCE_VALUES as readonly string[]).includes(attendance)) {
    throw new Error("Невалидна стойност за присъствие.");
  }

  const result = await setBookingAttendance(
    instructor.id,
    sessionId,
    bookingId,
    attendance as AttendanceValue
  );
  if (result !== "ok") throw new Error(ERRORS[result]);

  revalidatePath(`/instructor/sessions/${sessionId}`);
  revalidatePath("/instructor/report");
}
