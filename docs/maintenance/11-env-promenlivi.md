# 11. Променливи на средата: имена, предназначение, секрети

**В тази документация има само ИМЕНА и плейсхолдъри — никога стойности на
секрети.** Истинските стойности живеят само в съответните env файлове.

## 1. Кой файл къде

| Файл | Къде | Кой го ползва | В git ли е |
|---|---|---|---|
| `.env.local` | локално, `D:\dev\Wheelylove` | `dev`, `test`, `db:*` скриптове (чрез `dotenv -e .env.local`) | НЕ (игнорiran) |
| `.env.admin` | локално | САМО `set-admin` / `set-instructor` (шаблон `.env.admin.example`) | НЕ |
| `/srv/wheelylove/.env` | VPS | docker compose + контейнерите (шаблон `deploy/.env.production.example`) | НЕ |
| `state/tag.env`, `state/prev_tag.env` | VPS | изображението, което върви / предишното (записват се от deploy.sh) | НЕ |

Правила на продъкшън файла (парсерът на скриптовете е прост):
`KEY=value`, без кавички, без интервали около `=`, без `$` във стойностите;
`deploy.sh` отказва при остатък `CHANGE_ME` (`deploy/deploy.sh:44-48`).
Секрети се генерират с `openssl rand -hex 24`.

## 2. Всички имена (продукция / локално)

### Продукция (`/srv/wheelylove/.env`)

| Променлива | За какво | Бележки |
|---|---|---|
| `POSTGRES_USER` | потребител на базата (`wheely`) | compose строи `DATABASE_URL` от трите стойности — не се задава ръчно |
| `POSTGRES_DB` | име на базата (`wheelylove`) | |
| `POSTGRES_PASSWORD` | парола на базата | генерира се от install.sh |
| `NEXT_PUBLIC_APP_URL` | публичен адрес (`https://wheelylove.net`) | **вграден при билда** — смяната изисква нов deploy (build arg, `deploy.sh:104-107`) |
| `BETTER_AUTH_URL` | = NEXT_PUBLIC_APP_URL | за Better Auth |
| `BETTER_AUTH_SECRET` | подпис на сесийните токени | генерира се от install.sh |
| `RESEND_API_KEY` | Resend (ако не се ползва SMTP relay) | |
| `RESEND_EMAIL_DOMAIN` | домейн на подателя `reservations@…` | |
| `EMAIL_FROM` | подател при SMTP (напр. `Your Wheely <adelina@purepoint.bg>`) | печели над reservations@ |
| `SMTP_HOST` / `SMTP_PORT` | SMTP relay (smtp-relay.gmail.com / 587) | зададен HOST → SMTP вместо Resend |
| `SMTP_USER` / `SMTP_PASS` | само при app-password режим | при IP allowlist остават празни |
| `SMTP_HELO_NAME` | EHLO име (по подразбиране хостът на сайта) | Google relay иска реално име |
| `UPLOAD_DIR` | папка в контейнера (`/data/uploads`) | compose го задава; локално за тестове — temp папка |
| `CRON_SECRET` | Bearer за `/api/cron/reminders` | чете се от systemd таймера |
| `HEALTH_PATH` | път за health check (по подразбиране `/`) | optional |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | вход с Google | само и двете → бутонът се появява |

### Локално (`.env.local`)

`DATABASE_URL` (задължително; **името на базата трябва да свършва на
`_test`** за тестовете — `src/lib/test-db-guard.ts`), `BETTER_AUTH_SECRET`,
`BETTER_AUTH_URL`/`NEXT_PUBLIC_APP_URL` (за локалните писма/линкове),
по избор `RESEND_API_KEY`/`RESEND_*`, `SMTP_*` (локален catcher), `UPLOAD_DIR`
(temp папка за тестове на качвания).

### `.env.admin` (само за CLI срещу продукция)

`DATABASE_URL` → SSH тунел към продукционната база
(`ssh -N -L 15432:127.0.0.1:5432 root@164.138.216.72`, после
`postgres://wheely:<POSTGRES_PASSWORD>@127.0.0.1:15432/wheelylove`) —
описанието е в `.env.admin.example`. **Никога не насочвай `.env.local` към
продукция** (там тестовете биха думп-нали данни — пазачът им отказва база без
`_test`, но пак: не създавайте база „…_test“ на продуктовия сървър).

## 3. Управление на секретите (процедури)

- **Смяна на `POSTGRES_PASSWORD`**: едновременно в `.env` на VPS и
  рестарт на контейнерите (`docker compose up -d --force-recreate db app`
  през wrapper-а `compose` от `lib.sh`); старата парола спира да важи след
  рестарта на db.
- **Смяна на `CRON_SECRET`**: редакция на `.env` + `docker compose up -d
  --force-recreate app` (env се чете при старт; таймера чете файла всеки път).
- **Смяна на `BETTER_AUTH_SECRET`**: изходва ВСИЧКИ сесии на всички (подписът
  се сменя) — прави се в тих час; потребителите влизат наново.
- **Загубен секрет**: паролата на базата е в `/srv/wheelylove/.env` (root);
  Resend ключа — в dashборда на Resend; Google — в Google Cloud Console.
- **Никога**: секрет в команда от cron/`ps` (таймера подава тайната по
  stdin точно за това), в документи, в комити, в чат.
- Проверка, че никой не е комитил env файл: `git log --all --diff-filter=A -- '*.env*'`
  (показа само example файловете при последна проверка — `.gitignore:33-39`
  ги пази с изключения точно за шаблоните).

## 4. Как приложението чете променливите

Всички четения са `process.env.<NAME>` при стартиране/първа употреба:
`src/lib/auth.ts` (BETTER_AUTH_*, GOOGLE_*), `src/lib/email.ts:19,25,316-330`
(FROM/SITE_URL/SMTP_*), `src/lib/storage.ts:23-25` (UPLOAD_DIR),
`src/app/api/cron/reminders/route.ts:9` (CRON_SECRET),
`src/db/index.ts:6` (DATABASE_URL). Само `NEXT_PUBLIC_APP_URL` се вгражда в
клиентския код при билда (build arg в Dockerfile:46).
