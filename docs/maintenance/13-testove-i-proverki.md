# 13. Тестове и проверки: видове, команди, изолация, ръчни стъпки

## 1. Команди (винаги от `D:\dev\Wheelylove`, Git Bash)

```bash
npx tsc --noEmit     # типова проверка (няма npm скрипт; tsc чете tsconfig.json)
npm run lint         # eslint (0 грешки се изисква; warnings допустими)
npm test             # всички vitest тестове (чрез dotenv -e .env.local)
npx vitest run src/lib/bookings.test.ts   # само един файл
npx vitest run -t "името на теста"        # само един тест
```

`npm test` зарежда `.env.local` → **DATABASE_URL трябва да сочи изолирана
база `_test`** (вж. [12 §2](12-lokalna-sreda.md)). Пазачът
(`src/lib/test-db-guard.ts`, включен като setupFile във `vitest.config.ts:14`)
спира ВСИЧКО преди първи тест, ако името не свършва на `_test`.

## 2. Какви тестове има (снимка 15:52 на 2026-10-06: 35 файла, 315 теста — броят се движи с активната работа)

| Вид | Файлове (примери) | Какво пазят |
|---|---|---|
| Миграции/схема | `src/db/migrations.test.ts` | schema.ts ↔ drizzle/ синхрон; стената на миграциите върху празна база |
| Резервации/капацитет | `booking-capacity.test.ts`, `bookings.test.ts` | атомично заемане, отказ, дубликати |
| Waitlist | `bookings.test.ts`, `schedule.test.ts` | известията и позициите |
| Автентикация | `auth.test.ts` (15), `auth-client.test.ts`, `google-auth.test.ts`, `hardening.test.ts` | verification gate, reset, rate limits, safe-next |
| Инструкторски панел | `instructor.test.ts`, `instructor-admin.test.ts` ⟨нов⟩, `instructor-concurrency.test.ts` ⟨нов, в писане⟩ | присъствие, доклад, архивни състезания |
| Админ страници guard | `admin-pages-guard.test.ts` | `requireAdminPage()` е първи ред на ВЯКА админ страница |
| Имейли | `email.test.ts`, `email-smtp.test.ts`, `email-locale.test.ts` | текстове/език/SMTP |
| Локейл/формати | `locale.test.ts`, `format.test.ts`, `booking-locale.test.ts` | bg/en, София, DST |
| Качвания | `storage.test.ts` | magic bytes, размери, пътева сигурност |
| Календар | `calendar.test.ts`, `api/calendar/.../route.test.ts` | .ics валидност, folding, 404-та |
| Други | `phone.test.ts`, `user-phone.test.ts`, `sport-content.test.ts`, `demo-data.test.ts`, `set-admin.test.ts`, `set-instructor.test.ts`, `admin-bookings.test.ts` ⟨нов⟩, `resend-outcome.test.ts`, `bands.test.ts` (галерия), `test-db-guard.test.ts`, `api/internal/admin-check/route.test.ts` | |

Тестовете пишат реални редове в тестовата база и си чистят (фикстури през
`src/lib/test-helpers.ts`); всеки файл е независим от друг — паралелът е
безопасен В РАЗЛИЧНИ бази. Затова на тази машина има по една база на агент
(`wheelylove_bookings_test` е тази за нас).

## 3. Какво проверяват тестовете НЕ (ръчни/QA стъпки)

- Реални имейли (SMTP relay, Google), реален Google OAuth.
- Визуалното: responsive, lightbox на галерията, превключвателя на език.
- PWA/икони, manifest.
- Цялата верига „регистрация → потвърждение по имейл → резервация → писмо →
  напомняне“ — локално става с локален SMTP catcher (виж §6).

## 4. Build проверка

`npm run build` прави production билд + typecheck на страниците. Правете го
преди release. ВНИМАНИЕ при вървящ dev server — вж. [12 §6](12-lokalna-sreda.md):
най-безопасно е в копие на дървото:

```bash
# копие без .next/.git/node_modules, после пълно копие на node_modules
# (junction за node_modules НЕ работи — Turbopack го отказва:
#  "Symlink [project]/node_modules is invalid")
```

Build-ът НЕ изисква база: клиентът на базата е мързелив, а в Docker се подава
фиктивен `DATABASE_URL` (`Dockerfile:52-55`).

## 5. Изпълнени проверки на 2026-10-06 (изходите в `.glm-evidence-docs/`)

Първите шест реда са моя снимка от **15:49–15:53** — направена по средата на
паралелни редакции на същите нови файлове от други агенти. Провалите и
грешките там НЕ са дефекти на кода, а междинно състояние („снимка по средата
на надбягване“). След като работата приключи (~16:00), независимите
проверители съобщават зелено състояние — последните два реда (техни изходи,
не мои).

| Проверка | Резултат | Файл |
|---|---|---|
| `vitest run` (база `wheelylove_bookings_test` на 5440, с `BETTER_AUTH_URL`) | снимка 15:52: 309/315 минават; 6 падат в 2 файла, редактирани в момента от други агенти | `vitest-run-final.txt` |
| `vitest run src/lib/auth.test.ts` | 15/15 (провалът в пълния run беше от липсващ `BETTER_AUTH_URL` в средата на първия опит) | `vitest-auth-retry.txt` |
| `npx tsc --noEmit` | снимка 15:53: 6 грешки — само в същите 2 нови/редактирани тестови файла | `tsc-noEmit.txt` |
| `npm run lint` | 0 грешки, 19 warnings (в помощни `.glm-*` скриптове) | `eslint.txt` |
| `next build` върху комит `70fa290` (последния на живо), в изолирано копие | **успех (exit 0)**, пълна маршрутна таблица | `next-build-head.txt`, `next-build-head-tail40.txt` |
| `next build` върху работното дърво | снимка 15:53: компилира се, спира на същите 6 typecheck грешки | `next-build.txt` |
| `tsc --noEmit` върху работното дърво след края на работата (~16:00) | **exit 0 — чисто** (независима проверка) | `.glm-evidence-instructor-admin/fix-tsc.txt` |
| фокусирани тестове след края на работата (~16:00) | **6 файла, 80/80 зелени** (instructor-admin, instructor-concurrency, instructor, schedule-generator, migrations, set-instructor) | `.glm-evidence-instructor-admin/fix-tests-green.txt` |

Браузърен QA срещу dev превюто (независими харнеси, 2026-10-06): списъкът
„Резервации“ (филтри/странициране) — **25/25 PASS**; админ панелът за
инструктори — **30/30 PASS** (срещу състоянието към ~15:48; по-късните
корекции от ~16:00 са покрити от фокусираните тестове и независимия review).
Изходи: `.glm-evidence-admin-bookings/qa-rerun.txt`,
`.glm-evidence-instructor-admin/qa-run-tail.txt`.

Извод: **на живо (70fa290) всичко е зелено; и чакащата работа минава чисто**
според независимите проверки след ~16:00. За release остават: задачата за
снимка на инструктор (активно разработване към 16:43), commit и самото
пускане (гл. 14).

## 6. Локален SMTP catcher (писма без да излизат)

Рецептата на предишни QA цикли (файловете са в корена на репото):
`.glm-smtp-catcher.mjs` вдига локален SMTP на 465 (с TLS сертификата от
`.codex-tls/`), а dev сървърът се пуска с `SMTP_HOST=127.0.0.1
SMTP_PORT=465 SMTP_USER= SMTP_PASS= EMAIL_FROM='WheelyLove Test
<test@example.invalid>'` (точно така прави `.codex-preview.ps1`). Писмата се
виждат в конзолата на catcher-а — удобно за ръчна проверка на веригата.

## 7. Ръчни браузърни стъпки (минимален чеклист преди release)

1. `/` и `/en` се отварят; превключвателят на език помни избора.
2. `/schedule` показва дни/точки; филтрите работят; „почти пълно/пълно“ са
   верни спрямо създадените тестови данни.
3. Регистрация на нов имейл → писмо (catcher-а) → линкът води към
   `/sign-in?verified=1` (НЕ влиза автоматично) → вход.
4. Резервация на бъдещ час: успех → `/booking/success?s=…` с правилните
   детайли; повторна опит за същия час → 409 съобщение.
5. Пълен час → бутон „Списък на чакащи“ → записване; отказ на чужда
   резервация (админ) → писмо „освободи се място“.
6. „Моите резервации“: отказ преди началото работи; след началото — отказан.
7. Админ: създай шаблон → Генерирай → часовете се появяват; повтори — без
   дубликати; отмени час → писма.
8. Инструктор: вход свързан акаунт → отбелязване на присъствие след началото.
9. Галерия: качи малка снимка → вижда се; изтрий → изчезва.
10. `?next=` манипулации: `/sign-in?next=//evil.com` → води към /schedule
    (`safeNext`).

## 8. Кога какво се пуска (минимум)

- Преди всеки commit: `npx tsc --noEmit` + `npm run lint`.
- Преди всеки merge/release: `npm test` (зелено на ИЗОЛИРАНА база) + build +
  §7 стъпки 1-4.
- След deploy: health check + бърз visual check (вж. [14 §8](14-deploy-i-release.md)).
