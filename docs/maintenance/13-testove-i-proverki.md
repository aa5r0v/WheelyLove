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

Финалните проверки са изпълнени върху кода, пуснат в production release
`20261006-153700-b2125f3`. Междинните логове от по-ранните работни опити не
са критерий за текущото състояние.

| Проверка | Резултат |
|---|---|
| `npm test` | **337/337 PASS** на изолирана тестова база |
| `npx tsc --noEmit` | чисто |
| `npx eslint src` | 0 грешки и предупреждения |
| `npm run build` | успешно локално и на VPS |
| Браузърен QA | bookings 25/25, instructors 30/30, photos 16/16 PASS |

Production release `20261006-153700-b2125f3` е жив. Гостите към админ маршрутите
получават очакван redirect към вход. Пълните production URL-и са проверени с
HTTP 200 за `/` и `/en`; изображенията се качват и обслужват през защитения
админ маршрут.
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
