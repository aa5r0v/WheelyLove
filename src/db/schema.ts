import { sql } from "drizzle-orm";
import {
  pgTable,
  serial,
  text,
  boolean,
  bigint,
  integer,
  timestamp,
  varchar,
  pgEnum,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";

export const bookingStatusEnum = pgEnum("booking_status", [
  "pending",
  "confirmed",
  "cancelled",
]);

export const paymentMethodEnum = pgEnum("payment_method", ["card", "cash"]);

export const galleryTypeEnum = pgEnum("gallery_type", ["image", "video"]);

export const sportLevelEnum = pgEnum("sport_level", ["all", "beginner", "intermediate", "advanced"]);

// Instructor's own mark of who actually came (set from /instructor, never by the client).
export const attendanceEnum = pgEnum("booking_attendance", ["unknown", "attended", "no_show"]);

export const sports = pgTable("sports", {
  id: serial("id").primaryKey(),
  slug: varchar("slug", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 128 }).notNull(),
  color: varchar("color", { length: 32 }).notNull().default("#6366f1"),
  description: text("description").default(""),
  level: sportLevelEnum("level").notNull().default("all"),
  defaultDurationMin: integer("default_duration_min"),
  defaultPriceCents: integer("default_price_cents"),
  defaultCapacity: integer("default_capacity").notNull().default(12),
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
  // The login account of this instructor (user.role = "instructor"); linked only
  // by an admin (admin page / scripts/set-instructor.ts), at most one account each.
  userId: text("user_id")
    .unique()
    .references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Weekly recurring template. Concrete class_sessions are generated from it (see
// src/lib/schedule-generator.ts). weekday is ISO: 1 = Monday ... 7 = Sunday;
// startTime is a wall-clock "HH:MM" in Europe/Sofia.
export const sessionTemplates = pgTable(
  "session_templates",
  {
    id: serial("id").primaryKey(),
    sportId: integer("sport_id")
      .notNull()
      .references(() => sports.id, { onDelete: "restrict" }),
    instructorId: integer("instructor_id")
      .notNull()
      .references(() => instructors.id, { onDelete: "restrict" }),
    weekday: integer("weekday").notNull(),
    startTime: varchar("start_time", { length: 5 }).notNull(),
    durationMin: integer("duration_min").notNull(),
    capacity: integer("capacity").notNull().default(12),
    priceCents: integer("price_cents").notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [check("session_templates_weekday_chk", sql`${t.weekday} between 1 and 7`)]
);

export const classSessions = pgTable(
  "class_sessions",
  {
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
    templateId: integer("template_id").references(() => sessionTemplates.id, {
      onDelete: "set null",
    }),
    // The slot the weekly template planned (never changes, even if the class is
    // moved by hand later). Uniqueness is on (template_id, template_slot), so
    // a moved class is not re-created at its old time by the next "generate".
    templateSlot: timestamp("template_slot"),
  },
  (t) => [uniqueIndex("class_sessions_template_slot_idx").on(t.templateId, t.templateSlot)]
);

export const bookings = pgTable(
  "bookings",
  {
    id: serial("id").primaryKey(),
    sessionId: integer("session_id")
      .notNull()
      .references(() => classSessions.id, { onDelete: "restrict" }),
    userId: varchar("user_id", { length: 128 }).notNull(),
    userEmail: varchar("user_email", { length: 256 }).notNull(),
    userPhone: varchar("user_phone", { length: 32 }).notNull(),
    status: bookingStatusEnum("status").notNull().default("pending"),
    attendance: attendanceEnum("attendance").notNull().default("unknown"),
    // Плащането е само на място; стойността в enum-а "card" е наследена от стари данни.
    paymentMethod: paymentMethodEnum("payment_method").notNull().default("cash"),
    reminderSentAt: timestamp("reminder_sent_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    // One active (pending/confirmed) booking per user per session.
    uniqueIndex("bookings_active_session_user_idx")
      .on(t.sessionId, t.userId)
      .where(sql`${t.status} in ('pending', 'confirmed')`),
  ]
);

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

// --------------------------------------------------------------- Better Auth
// Self-hosted auth in our own Postgres. Property names must match Better Auth's
// field names (the drizzle adapter maps by property, DB column names are free).

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  // "user" | "admin" | "instructor"; set only via scripts/set-admin.ts, scripts/set-instructor.ts
  // or the admin panel (instructor link), never from the client.
  role: text("role").notNull().default("user"),
  // Saved contact phone (E.164), asked once at the first booking; never set from auth input.
  phone: varchar("phone", { length: 32 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  // Only the credential provider stores a password here (scrypt hash).
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Built-in Better Auth rate limiter with storage: "database".
export const rateLimit = pgTable(
  "rate_limit",
  {
    id: text("id").primaryKey(),
    key: text("key").notNull(),
    count: integer("count").notNull(),
    // Epoch milliseconds (Better Auth stores a number, not a timestamp).
    lastRequest: bigint("last_request", { mode: "number" }).notNull(),
  },
  (t) => [uniqueIndex("rate_limit_key_idx").on(t.key)]
);
