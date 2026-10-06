# 01. Обзор: какво е WheelyLove, стек, файлова карта

## 1. Какво прави сайтът

WheelyLove е сайт на фитнес студио в Каварна („Kavarna City Center“,
`src/lib/studio.ts:4-15`) за **резервации на групови тренировки** (спининг,
пилатес, силови). Основни неща, които трябва да се знаят от самото начало:

- **Плащането е само на място** — онлайн плащане няма. Резервацията се пази със
  статус `pending`, докато студиото я отбележи като платена (`confirmed`)
  („Плащането е на място“, `src/lib/email.ts:59`; коментар в
  `src/db/schema.ts:128-129`). Полето `payment_method` има стойност `cash` по
  подразбиране; стойността `card` е наследена от стари данни.
- **Входът е собствен** (Better Auth в нашия Postgres): имейл + парола, задължително
  потвърждение на имейла; незадължителен вход с Google. Никой не може да резервира
  или да се запиете в списъка на чакащите без потвърден имейл.
- **Езиците са два**: български по подразбиране (без префикс) и английски под
  `/en`. Админ панелът и панелът на инструктора са само на български.
- **Часовете са винаги в софийско време** (`Europe/Sofia`), независимо къде е
  сървърът (`src/lib/format.ts:4`).

## 2. Технологии и версии (от `package.json`)

| Пакет | Версия в package.json | Роля |
|---|---|---|
| `next` | `16.3.4` (точна) | framework; `output: "standalone"` (`next.config.ts:7`) |
| `react` / `react-dom` | `19.2.8` (точни) | UI |
| `better-auth` | `^1.7.7` | регистрация/вход/сесии, в нашата база |
| `drizzle-orm` | `^0.45.2` | ORM |
| `postgres` | `^3.4.9` | Postgres драйвер |
| `next-intl` | `^4.14.9` | езици/bg-en |
| `nodemailer` | `^10.0.15` | SMTP (Google Workspace relay) |
| `resend` | `^6.25.0` | имейл API (резервен път) |
| `date-fns` | `^4.4.0` | датни помощници |
| `drizzle-kit` | `^0.31.10` (dev) | миграции |
| `vitest` | `^4.1.11` (dev) | тестове |
| `typescript` | `^5` (dev) | типове |
| `eslint` / `eslint-config-next` | `^9` / `16.3.4` (dev) | lint |
| `tailwindcss` / `@tailwindcss/postcss` | `^4` (dev) | стилове |

Инструменти около проекта: **Node 22** (Docker образа е `node:22-alpine`,
`Dockerfile:12`), **Postgres 17** (продукционен контейнер,
`deploy/docker-compose.yml:87`), **Docker Compose** проект `wheelylove`,
**nginx** отпред на VPS, **Cloudflare** пред nginx.

Скриптове в `package.json:5-17`: `dev`, `build`, `start`, `lint`, `db:push`,
`db:generate`, `db:migrate`, `db:seed`, `set-admin`, `set-instructor`, `test`.

## 3. Топология — продукция (наблюдавано от координатора, 2026-10-06)

```
Интернет → Cloudflare → nginx (VPS, 443) → 127.0.0.1:5610 → контейнер wheelylove-app
                                                            └─ мрежа wl-internal → контейнер wheelylove-db (Postgres 17)
                                                            └─ мрежа wl-egress (само изходящ HTTPS/587) → имейли
```

- VPS: `164.138.216.72`, проектът живее в `/srv/wheelylove` (отделен loop диск).
- Приложението слуша **само на loopback порт 5610** (compose
  `deploy/docker-compose.yml:51-53`); единствено nginx му говори.
- Базата **няма публикуван порт** — reachable само от app контейнера
  (`deploy/docker-compose.yml:90`).
- Публичен адрес: `https://wheelylove.net` (стар временен
  `wheelylove.purepoint.bg` и `www` пренасочват към него,
  `deploy/nginx/wheelylove.conf:29-49`).
- Качените файлове (галерия) лежат на диска на VPS и nginx ги раздава директно
  (`/uploads/…`, `deploy/nginx/wheelylove.conf:101-117`).
- На същия VPS работят и **други услуги** (QHub на localhost:4000, OpenVPN
  tun0, netdata, друг Postgres 14) — пакетът WheelyLove е изолиран от тях и те
  **не трябва** да се спират/трият (`deploy/README.md:3-6`).

## 4. Топология — локална разработка (Windows)

- Работно копие: `D:\dev\Wheelylove`, клон `feat/instructor-panel`.
- Локален Postgres за тестове на порт **5440** (trust, без парола, потребител
  `postgres`) с бази `wheelylove_test`, `wheelylove_codex_test`,
  `wheelylove_bookings_test` — вж. [12-lokalna-sreda.md](12-lokalna-sreda.md).
  **Порт 5432 е споделен — не го пипай.**
- `npm run dev` вдига сайт на `http://localhost:3000` (с `run-slot` и друг порт
  при паралелна работа на няколко агента — вж. [12](12-lokalna-sreda.md)).

## 5. Статус: какво е на живо и какво чака (снимка 2026-10-06)

**На живо** е комит `70fa290` (release `20261006-094012-70fa290`). Изпълнен
`next build` върху точно този комит минава чисто — доказателство:
`.glm-evidence-docs/next-build-head.txt` (изходен код 0).

**⟨ЧАКАЩО⟩** — в работното дърво има некомитирани промени (+835/−307 реда в 17
файла плюс нови файлове) около: админ списък „Резервации“ (филтри/странициране,
`src/lib/admin-bookings.ts` — нов), **архивиране/възстановяване/изтриване на
инструктор** (`src/lib/instructor-lifecycle.ts` — нов; миграция
`drizzle/0010_instructor_archived_at.sql` — нова), създаване/редакция на
профил на инструктор от админа (`instructor-create.tsx`, `instructor-fields.tsx`
— нови), и генератор на разписание, който прескача архивирани инструктори в
заключена транзакция (`src/lib/schedule-generator.ts:100-110`). Снимка на
инструктор е **отделна** възложена задача, която се разработва активно към
16:43 на 2026-10-06 (полето и действията за снимка вече се появяват в
работното дърво от нея) и не е част от проверения пакет — не я ползвай и не
я описвай като налична, докато не бъде завършена, пусната и отразена в
гл. 09.

Тези промени **не са нито комитирани, нито пуснати**. Към ~16:00 на
2026-10-06 работата по тях е завършена и проверена: независим преглед без
материални забележки, фокусираните тестови суити зелени, typecheck-ът чист
(вж. [13-testove-i-proverki.md](13-testove-i-proverki.md) §5). Ранното
наблюдение от ~15:50 за 6 провала/грешки е било моментна снимка по средата на
паралелни редакции на същите файлове и вече не важи. Преди пускане остават:
задачата за снимка на инструктор (в ход), commit + release (гл. 14).

## 6. Файлова карта (само важното)

```
D:\dev\Wheelylove
├─ package.json / package-lock.json     зависимости и скриптове
├─ next.config.ts                       standalone + bodySizeLimit 55mb
├─ vitest.config.ts                     настройка на тестовете + пазач на тестовата база
├─ tsconfig.json                        пътят "@" → ./src
├─ Dockerfile                           образи: runner (приложение) + migrate (миграции/CLI)
├─ drizzle.config.ts                    настройки на drizzle-kit
├─ drizzle/                             МИГРАЦИИ (0000…0010) + meta/_journal.json
├─ .env.local                           ЛОКАЛНИ секрети (не се комитира) — не се чете!
├─ .env.admin.example                   шаблон за .env.admin (само за set-admin)
├─ deploy/
│  ├─ deploy.sh                         пускане на версия на VPS (9 стъпки)
│  ├─ rollback.sh                       връщане на предишната версия
│  ├─ install.sh                        първоначална/повторима инсталация на VPS
│  ├─ uninstall.sh                      премахва инсталираното (без данните)
│  ├─ docker-compose.yml                app + db + migrate, мрежи, лимити
│  ├─ .env.production.example           шаблон на /srv/wheelylove/.env
│  ├─ README.md                         ПЪЛНО ops ръководство (първоизточник за VPS)
│  ├─ nginx/                            vhost + rate-limit + proxy настройки
│  ├─ systemd/                          таймер за напомняния + firewall unit
│  ├─ cron/wheelylove-backup            нощен архив в 02:17
│  ├─ scripts/                          lib.sh, backup.sh, cron-reminders.sh, check-email-failures.sh
│  ├─ firewall/wheelylove-firewall.sh   iptables изолация на мрежите
│  └─ deferred-migrations/              миграции, чакащи втори release
├─ scripts/
│  ├─ seed.ts / seed-sessions.ts        начално съдържание (спортове, инструктори, часове)
│  ├─ set-admin.ts                      даване на admin роля (само през CLI)
│  ├─ set-instructor.ts                 свързване на инструктор с акаунт (CLI)
│  ├─ demo-data.ts / seed-demo.ts / remove-demo.ts   демо данни (фиктивни)
│  └─ check.ts / inspect.ts             малки помощни
├─ public/                              статични файлове (лого, икони)
└─ src/
   ├─ proxy.ts                          middleware: локейл маршрутизация + блок на /bg|/en/api
   ├─ db/  schema.ts, index.ts, migrations.test.ts
   ├─ i18n/  routing.ts, request.ts, navigation.ts, messages/{bg,en}.json
   ├─ lib/    ВСЯКА бизнес логика (вж. отделните глави)
   └─ app/
      ├─ [locale]/…                     всички страници по език (вж. 03)
      └─ api/…                          API маршрути (вж. 03)
```

`src/lib/` на кратко: `auth.ts` (Better Auth настройка), `admin.ts` (isAdmin),
`admin-page.ts` (guard за админ страници), `bookings.ts` (отказ на резервация),
`waitlist.ts` (уведомяване на чакащи), `schedule.ts` (списъци за графика),
`schedule-generator.ts` (седмични шаблони → часове), `instructor.ts` (панел на
инструктор), `instructor-link.ts` / `instructor-lifecycle.ts` /
`instructor-profile.ts` ⟨ЧАКАЩО⟩, `admin-bookings.ts` ⟨ЧАКАЩО⟩, `email.ts`
(писма), `calendar.ts` (Google/.ics), `storage.ts` (качвания), `phone.ts` /
`user-phone.ts` (телефони), `locale.ts` / `format.ts` (език/часове),
`safe-next.ts` (?next= санитизация), `server-messages.ts` (грешки на два езика),
`google-auth.ts` (по избор Google вход), `studio.ts` (адрес), `trainings.ts`
(валидация на форми), `sport-content.ts` (превод на seed-съдържание),
`test-db-guard.ts` (пазач на тестовата база).

## 7. Къде е истина за продукцията

При противоречие между документи и кода/скриптовете: кодът печели. За VPS
операциите първоизточникът е `deploy/README.md` (написан от създателя на
инсталацията), а тази папка го разширява и обяснява. Факти за живата продукция
(адреси, портове, последен release) са потвърдени от координатора на
2026-10-06; те не се извеждат от кода и не могат да се проверят локално.
