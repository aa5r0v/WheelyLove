# 04. База данни: схема, релации, миграции, инварианти

Схемата е дефинирана в `src/db/schema.ts` (Drizzle). Продукционна база:
Postgres 17 в контейнер `wheelylove-db`, база `wheelylove`, потребител
`wheelylove` (наблюдавано от координатора; в compose
`deploy/docker-compose.yml:86-94`). Връзката се създава мързеливо от
`getDb()` с pool до 10 (`src/db/index.ts:6-15`).

## 1. Таблици и релации

```
sports 1──n class_sessions n──1 instructors
  │ 1──n session_templates n──1 ┘
bookings n──1 class_sessions
waitlist_entries n──1 class_sessions
gallery_items (самостоятелна)
user 1──n session / account / verification (Better Auth)
instructors.user_id ──> user.id (0..1, unique)   ← връзка „панел акаунт“
rate_limit (Better Auth, собствена)
```

| Таблица | Полета (съществено) | Инварианти / бележки |
|---|---|---|
| `sports` (:31) | slug* unique, name*, color default `#6366f1`, description, level (all/beginner/intermediate/advanced), default_duration_min, default_price_cents, default_capacity default 12 | |
| `instructors` (:44) | slug* unique, name*, bio, photo_url, email, phone, specialties, `user_id` unique → user.id (ON DELETE SET NULL), `archived_at` ⟨ЧАКАЩО, миграция 0010⟩ | Мекото триене (`archived_at`) скрива профила и спира нови часове, без да пипа историята (`schema.ts:56-58`) |
| `session_templates` (:67) | sport_id*, instructor_id* (RESTRICT), weekday 1-7 (CHECK `:85`), start_time „ЧЧ:ММ“ **софийско стеново време**, duration_min, capacity, price_cents, active | Седмичен шаблон за генератора |
| `class_sessions` (:88) | sport_id*, instructor_id* (RESTRICT), start/end*, capacity, `booked_count` default 0, price_cents, cancelled_at, template_id (SET NULL), `template_slot` | **UNIQUE (template_id, template_slot)** (:113) — генераторът не дублира и не създава наново преместен/отменен час |
| `bookings` (:116) | session_id* (RESTRICT), user_id*, user_email*, user_phone*, status pending/confirmed/cancelled, attendance unknown/attended/no_show, payment_method default `cash`, `locale` default „bg“, reminder_sent_at | **Частичен UNIQUE (session_id, user_id) WHERE status IN (pending, confirmed)** (:138-140) — една активна резервация на потребител за час. `card` в enum-а е наследен; плащането е само на място (`schema.ts:128`) |
| `waitlist_entries` (:144) | session_id* (CASCADE), user_id*, user_email*, locale, notified_at | **UNIQUE (session_id, user_id)** (:159); изтрива се автоматично при резервация (`checkout/route.ts:156-163`) |
| `gallery_items` (:162) | type image/video, url, caption | url сочи `/uploads/<uuid>.<ext>` |
| `user` (:174) | id text, name*, email* unique, `email_verified` default false, image, `role` default „user“, `phone` (E.164, пита се веднъж при първа резервация) | Полетата са на Better Auth; property имената съвпадат с библиотеката (`schema.ts:170-172`) |
| `session` (:189) | token unique, expires_at, ip/userAgent, user_id (CASCADE) | Сесиите на Better Auth; изтриването им = изход навсякъде |
| `account` (:202) | provider_id, account_id, access/id/refresh tokens, `password` (scrypt хеш, само за credential) | Един акаунт може да има и credential, и google provider редове |
| `verification` (:221) | identifier (имейл), value (токен), expires_at | Линките за потвърждение/нулиране |
| `rate_limit` (:231) | key unique, count, last_request (epoch ms) | Better Auth rate limiter със storage „database“ — оцелява при рестарт на контейнера (`src/lib/auth.ts:95-105`) |

`*` = NOT NULL. CASCADE/RESTRICT са реални FK действия — при RESTRICT триенето
на ред с история е невъзможно на ниво база (затова и `deleteInstructorRow`
проверява и отказва с четимо съобщение, `src/lib/instructor-lifecycle.ts:27-36`).

## 2. Инварианти, които кодът гарантира (и трябва да се пазят)

1. **`booked_count` ≤ `capacity`** — заемането на място е един `UPDATE … WHERE
   booked_count < capacity` в транзакция с insert-а на резервацията
   (`src/app/api/checkout/route.ts:129-141`); отказът намалява с
   `greatest(booked_count - 1, 0)` (`src/lib/bookings.ts:8-13`).
2. **Една активна резервация на човек за час** — частичният unique index;
   нарушението се хваща като 23505 → 409 (`checkout/route.ts:173-175`).
3. **Отказът е точно веднъж** — `cancelBookingAtomic` сменя статуса с условие
   `status IN (pending, confirmed)` и връща ред само на победителя
   (`src/lib/bookings.ts:31-51`); повторни/паралелни отказа нищо не правят.
4. **`booked_count` никога не остава „изтичан“**: транзакцията обхваща и
   статус-промяната, и намаляването; rollback връща и двете.
5. **Напомняне максимум веднъж на резервация** — `reminder_sent_at` се
   маркира с условие IS NULL преди изпращане; конкурентни изпълнения на cron
   не дублират (`src/app/api/cron/reminders/route.ts:52-57`).
6. **Часовете не се дублират от генератора** — ON CONFLICT DO NOTHING по
   (template_id, template_slot) (`schedule-generator.ts:103-107`).
7. **Час с активна резервация не се изтрива** — FK RESTRICT (`schema.ts:120-122`).

## 3. Миграции

- Папка `drizzle/`, списъкът в `drizzle/meta/_journal.json`. Прилагат се с
  `drizzle-kit migrate` от специалния migrate образ по време на deploy
  (`deploy/deploy.sh:131-137`); локално/при разработка —
  `npm run db:generate` (генериране от схемата) и `npm run db:migrate`.
- Към 2026-10-06 журналът има 11 записи: `0000_baseline` …
  `0009_booking_locale` (на живо) и **`0010_instructor_archived_at` ⟨ЧАКАЩО⟩**
  (добавя `archived_at` на инструкторите; още не е пускана в продукция).
- Тестът `src/db/migrations.test.ts` проверява, че (а) схемата и миграциите
  са синхронни (kit generate не произвежда промяна), и (б) стената на
  миграциите може да се възпроизведе върху празна база — падането му означава
  „някой е променил schema.ts без нова миграция“.
- **Отложени миграции**: такива, които трият колони, стоят извън `drizzle/` —
  в `deploy/deferred-migrations/deferred-drop_stripe_columns.sql` — и се
  преместват в `drizzle/` чак с втория следващ release, за да може текущият да
  се върне (`deploy/README.md:195-204`).
- **Правило за обратно съвместими миграции**: rollback връща приложението, но
  НЕ базата (`deploy/rollback.sh:6-7`). Никога не трий/стеснявай колони в
  миграция, която върви заедно с ново приложение — първо добави, после (в
  следващ release) трий.

## 4. Празна база / нова среда (локално, стъпка по стъпка)

Вж. [12-lokalna-sreda.md](12-lokalna-sreda.md) за създаване на изолирана тестова
база. След това:

```bash
# Git Bash, D:\dev\Wheelylove — DATABASE_URL вече е в .env.local
npm run db:migrate     # прилага всички миграции (вкл. 0010 ⟨ЧАКАЩО⟩)
npm run db:seed        # спортове (Спининг/Пилатес/Steel) + инструктори (scripts/seed.ts)
npx tsx scripts/seed-sessions.ts   # примерни часове относително днес
```

Демо данни (фиктивни, домейн `demo.wheelylove.invalid`, slug-ове `demo-*`) —
само в тестови бази: `npx tsx scripts/seed-demo.ts --apply` и
`npx tsx scripts/remove-demo.ts --apply` (без `--apply` е проба;
`remove-demo` отказва, ако на демо час има истинска резервация).
`set-admin` / `set-instructor` — вж. [06](06-auth-i-sigurnost.md).

## 5. Полезни заявки за диагностика (само тестови бази!)

Подходящи при локална тестова база (`psql`/ADMINER) — за продукция виж
[15-incidenti.md](15-incidenti.md) за безопасния път:

```sql
SELECT id, slug, archived_at FROM instructors;                    -- кои са архивирани ⟨ЧАКАЩО⟩
SELECT id, start_time, capacity, booked_count, cancelled_at
  FROM class_sessions ORDER BY start_time DESC LIMIT 20;          -- заетост
SELECT b.id, b.status, b.user_email, s.start_time
  FROM bookings b JOIN class_sessions s ON s.id = b.session_id
  ORDER BY b.created_at DESC LIMIT 20;                            -- последни резервации
SELECT session_id, count(*) FROM waitlist_entries GROUP BY 1;     -- чакащи
SELECT email, role, email_verified FROM "user";                   -- акаунти/роли
```

⚠️ Никога не изпълнявай UPDATE/DELETE върху продукционни таблици ръчно —
промените минават през приложението или през архива (restore).
