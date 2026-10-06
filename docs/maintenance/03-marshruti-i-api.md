# 03. Маршрути, API и server actions

Пълният списък по-долу е копиран от изхода на `next build` върху комит
`70fa290` (`ƒ` = динамична сървърна страница, `○` = статична;
`.glm-evidence-docs/next-build-head-tail40.txt`). Всички страници живеят под
`src/app/[locale]/…`, където `[locale]` е `bg` (без префикс в URL) или `en`
(под `/en`).

## 1. Страници (публични)

| Маршрут | Какво показва | Ключов код |
|---|---|---|
| `/` и `/en` | Начална:-hero, разписание 14 дни, инструктори, връзки | `src/app/[locale]/page.tsx` |
| `/schedule` | Разписание: 14 дни, ден по избор (`?d=ГГГГ-ММ-ДД`), филтри по тренировка/инструктор (`?sport=`, `?instructor=`) | `src/app/[locale]/schedule/page.tsx`, списъкът в `schedule-list.tsx` |
| `/sports` | Всички тренировки (карти с ниво/цена) | `src/app/[locale]/sports/page.tsx` |
| `/sports/[slug]` | Една тренировка: часове със свободни места, бутон Резервирай / Списък на чакащи | `src/app/[locale]/sports/[slug]/page.tsx`, `book-button.tsx`, `waitlist-button.tsx` |
| `/instructors` | Инструктори (карти) | `src/app/[locale]/instructors/page.tsx` |
| `/instructors/[slug]` | Профил: био, специалности, предстоящи часове на инструктора | `src/app/[locale]/instructors/[slug]/page.tsx` |
| `/gallery` | Галерия снимки/видео с lightbox | `src/app/[locale]/gallery/page.tsx` |
| `/privacy`, `/terms` | Поверителност, условия | съответните `page.tsx` |
| `not-found` | 404 страница (двуезична) | `src/app/[locale]/not-found.tsx` |

## 2. Страници (аутентикация и клиентски)

| Маршрут | Какво прави | Ключов код |
|---|---|---|
| `/sign-in` (`?next=`, `?verified=1`, `?session=`) | Вход; след потвърден имейл показва „готово, влез“ | `sign-in/page.tsx`, формата `sign-in-form.tsx` |
| `/sign-up` | Регистрация (мин. 10 символа парола, `auth.ts:40`) | `sign-up/page.tsx` |
| `/forgot-password` | Заявка за нова парола (писмо с линк, винаги еднакъв отговор независимо дали имейлът съществува, `auth.ts:47-50`) | `forgot-password/page.tsx` |
| `/reset-password` | Задаване на нова парола от линк (валиден 1 ч, текста в `email.ts:568`) | `reset-password/page.tsx` |
| `/booking/success?s=<id>` | Успешна резервация: детайли + Google/.ics/„как да стигна“; чужд/невалиден `s` → няма какво да покаже | `booking/success/page.tsx`, `src/lib/bookings.ts:55-75` |
| `/my-bookings` | Моите резервации (активни/отменени), отказ, телефон, повторно писмо за потвърждение | `my-bookings/page.tsx`, `phone-form.tsx`, `verify-email-banner.tsx`, `resend-outcome.ts` |

## 3. Страници (панели — само BG, без `/en` огледало)

| Маршрут | Достъп | Какво прави |
|---|---|---|
| `/admin` | admin + потвърден имейл | Табло |
| `/admin/sessions` | админ | Всички часове: създаване (с повторение N седмици), редакция, отмяна |
| `/admin/schedule` | админ | Седмични шаблони + бутона „Генерирай 8 седмици“ |
| `/admin/bookings` | админ | Резервации: търсене/отмяна/„платена на място“ ⟨филтри и странициране ЧАКАЩО⟩ |
| `/admin/sports` | админ | Тренировки: създаване/редакция (цвят, ниво, цени по подразбиране) |
| `/admin/instructors` | админ | Инструктори: профил, свързване на акаунт ⟨архив/възстановяване/изтриване и форма за създаване ЧАКАЩО⟩ |
| `/admin/gallery` | админ | Качване/изтриване на снимки и видеа |
| `/instructor` | instructor + потвърден имейл (+ незаархивиран ⟨ЧАКАЩО⟩) | Панел на инструктора |
| `/instructor/sessions/[id]` | същото | Един час: записани, присъствие |
| `/instructor/report` | същото | Месечен доклад (`?month=ГГГГ-ММ`) |

Админ layout-ът пренасочва `/en/admin… → /admin` нарочно: nginx пуска големия
upload само на непрефикснатия път (`src/app/[locale]/admin/layout.tsx:20-23`).

## 4. API маршрути (`src/app/api/…`)

| Маршрут | Метод | Достъп | Какво прави |
|---|---|---|---|
| `/api/auth/[...all]` | GET/POST | публично | Всички Better Auth endpoints (вход, регистрация, забравена парола, потвърждение, Google callback…); инициализира се мързеливо, за да не иска база при build (`route.ts:5-11`) |
| `/api/checkout` | POST | вход + потвърден имейл | Създава резервация (вж. [05](05-rezervacii-i-chakashti.md)) |
| `/api/calendar/session/[id]?l=bg|en` | GET | публично | `.ics` файл за час (само публични данни: тренировка/инструктор/време/място; отменени и минали часове → 404, `route.ts:35-42`) |
| `/api/cron/reminders` | GET | Bearer `CRON_SECRET` | Дневни напомняния (вж. [08](08-ezitsi-i-imeyli.md)); nginx връща 404 отвън, таймерът го вика на loopback |
| `/api/internal/admin-check` | GET | вътрешно (nginx `auth_request`) | 204 при валидна админ сесия, иначе 403 (`route.ts:13-17`); отвън е 404 |
| `/icon-192.png`, `/icon-512.png` | GET | публично | PWA икони (генерирани) |
| `/manifest.webmanifest` | GET | публично | PWA манифест (`src/app/manifest.ts`) |

Специални правила в `src/proxy.ts` (middleware):
- `/(bg|en)/api/*` и `/(bg|en)/uploads/*` → **404** (никога не се резолват до
  истинските пътища — nginx политиките важат за точно тях, `proxy.ts:11-13`);
- всичко останало минава през next-intl маршрутизация: непознат локейл → 404,
  `/bg/…` → 301 към непрефикснатия път (next-intl `localePrefix: "as-needed"`,
  `src/i18n/routing.ts:8-18`).

## 5. Server actions (по файлове)

**`src/app/[locale]/admin/actions.ts`** — всички започват с `assertAdmin()`
(номерата на редовете: снимка 2026-10-06 ~16:35):

| Действие | Ред | Какво прави |
|---|---|---|
| `createSession(formData)` | :67 | Ръчен час (+ повторение `repeatWeeks` седмици); изисква активен инструктор в заключена транзакция ⟨ЧАКАЩО⟩ |
| `updateSession(id, formData)` | :108 | Редакция на час; капацитет ≥ вече записани (`:129`); буди чакащи при промяна (`:176`) |
| `cancelSession(id)` | :186 | Отменя час + всички активни резервации с писмо „тренировката е отменена“ |
| `cancelBooking(id)` | :215 | Отменя една резервация + писмо |
| `confirmCashBooking(id)` | :223 | Бележи платена на място (`pending → confirmed`), без писмо |
| `createSport` / `updateSport` | :235/:252 | Тренировка: име, цвят, описание, ниво, default-и |
| `createInstructor` ⟨ЧАКАЩО⟩ | :311 | Нов инструктор (валидация `instructor-profile.ts`) |
| `updateInstructor(id, …)` ⟨ЧАКАЩО⟩ | :336 | Редакция на публичните полета; без photoUrl/role/mass assignment |
| `deleteInstructor` ⟨ЧАКАЩО⟩ | :373 | Окончателно изтриване — отказва при часове/шаблони |
| `archiveInstructor` / `restoreInstructor` ⟨ЧАКАЩО⟩ | :396/:423 | Меко скриване / връщане (вж. [06](06-auth-i-sigurnost.md)) |
| `linkInstructorAccess` / `removeInstructorAccess` | :450/:470 | Свързване/прекъсване на акаунт на инструктор |
| `uploadGalleryItem(formData)` | :476 | Качване на снимка/видео (валидация по magic bytes) |
| `deleteGalleryItem(id)` | :496 | Изтриване на галерия + файла на диска |
| `createTemplate` / `updateTemplate` / `deleteTemplate` | :526/:540/:581 | Седмичен шаблон; активиране/смяна на инструктор изисква активен инструктор ⟨ЧАКАЩО⟩ |
| `generateFromTemplates()` | :587 | Генерира часове от активните шаблони (8 седмици) |

**`src/app/[locale]/sports/[slug]/actions.ts`**: `joinWaitlist(sessionId, locale)`
(:13), `leaveWaitlist(sessionId)` (:84).

**`src/app/[locale]/my-bookings/actions.ts`**: `cancelOwnBooking(bookingId)`
(:13), `updateOwnPhone(raw)` (:46), `getOwnPhone()` (:61), `getOwnEmail()` (:68).

**`src/app/[locale]/instructor/actions.ts`**: `markAttendance(sessionId,
bookingId, attendance)` (:19).

## 6. Как да добавиш нова страница/маршрут (съвети за агента)

1. Страница: `src/app/[locale]/<път>/page.tsx`; текстовете — в
   `src/i18n/messages/bg.json` и `en.json` (задължително и на двата езика).
2. Server action: `"use server"` файл до страницата; при админ — първо
   `assertAdmin()`, при страница — първо `requireAdminPage()`
   (`src/lib/admin-page.ts:9-11`; тестът `admin-pages-guard.test.ts` изисква
   той да е първият ред на default export функцията).
3. API: `route.ts` с `export async function GET/POST`; не забравяй
   `src/proxy.ts` matcher-ът изключва `/api` — локейлът там идва от
   `x-app-locale` header или cookie (`src/lib/locale.ts:31-35`).
4. Публичните пътища, които се инвалидират при промяна на съдържание:
   `revalidateLocalized(path)` невалидира bg + /en варианта
   (`src/lib/revalidate.ts:7-10`).
