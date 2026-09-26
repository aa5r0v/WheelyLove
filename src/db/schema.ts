import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  varchar,
  pgEnum,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const bookingStatusEnum = pgEnum("booking_status", [
  "pending",
  "confirmed",
  "cancelled",
]);

export const paymentMethodEnum = pgEnum("payment_method", ["card", "cash"]);

export const galleryTypeEnum = pgEnum("gallery_type", ["image", "video"]);

export const sports = pgTable("sports", {
  id: serial("id").primaryKey(),
  slug: varchar("slug", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 128 }).notNull(),
  color: varchar("color", { length: 32 }).notNull().default("#6366f1"),
  description: text("description").default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const instructors = pgTable("instructors", {
  id: serial("id").primaryKey(),
  slug: varchar("slug", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 128 }).notNull(),
  bio: text("bio").default(""),
  photoUrl: text("photo_url"),
  email: varchar("email", { length: 256 }),
  phone: varchar("phone", { length: 32 }),
  specialties: varchar("specialties", { length: 256 }).default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const classSessions = pgTable("class_sessions", {
  id: serial("id").primaryKey(),
  sportId: integer("sport_id")
    .notNull()
    .references(() => sports.id, { onDelete: "restrict" }),
  instructorId: integer("instructor_id")
    .notNull()
    .references(() => instructors.id, { onDelete: "restrict" }),
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time").notNull(),
  capacity: integer("capacity").notNull().default(12),
  bookedCount: integer("booked_count").notNull().default(0),
  priceCents: integer("price_cents").notNull(),
  cancelledAt: timestamp("cancelled_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const bookings = pgTable("bookings", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id")
    .notNull()
    .references(() => classSessions.id, { onDelete: "restrict" }),
  userId: varchar("user_id", { length: 128 }).notNull(),
  userEmail: varchar("user_email", { length: 256 }).notNull(),
  userPhone: varchar("user_phone", { length: 32 }).notNull(),
  status: bookingStatusEnum("status").notNull().default("pending"),
  paymentMethod: paymentMethodEnum("payment_method").notNull().default("card"),
  stripeCheckoutSessionId: varchar("stripe_checkout_session_id", {
    length: 256,
  }),
  stripePaymentIntentId: varchar("stripe_payment_intent_id", { length: 256 }),
  reminderSentAt: timestamp("reminder_sent_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const waitlistEntries = pgTable(
  "waitlist_entries",
  {
    id: serial("id").primaryKey(),
    sessionId: integer("session_id")
      .notNull()
      .references(() => classSessions.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 128 }).notNull(),
    userEmail: varchar("user_email", { length: 256 }).notNull(),
    notifiedAt: timestamp("notified_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("waitlist_session_user_idx").on(t.sessionId, t.userId)]
);

export const galleryItems = pgTable("gallery_items", {
  id: serial("id").primaryKey(),
  type: galleryTypeEnum("type").notNull(),
  url: text("url").notNull(),
  caption: text("caption").default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
