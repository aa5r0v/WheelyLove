# 08. Езици и имейли

## 1. Езикова модел (bg по подразбиране, en под /en)

- Единствен източник на истината за локейлите: `src/lib/locale.ts:4`
  (`"bg" | "en"`). Routing-ът на next-intl: `defaultLocale: "bg"`,
  `localePrefix: "as-needed"`, **`localeDetection: false`** (никакво
  пренасочване по Accept-Language), `localeCookie: false`
  (`src/i18n/routing.ts:8-18`).
  - `https://wheelylove.net/…` = български; `https://wheelylove.net/en/…` =
    английски; `/bg/…` → 301 към непрефикснатия път (поведение на
    `as-needed`).
- Преводите: `src/i18n/messages/bg.json` / `en.json`; читат се през
  `next-intl` (`src/i18n/request.ts`). При липсващ ключ — добави и в двата
  файла.
- Cookie `NEXT_LOCALE` се пише САМО от превключвателя в заглавието
  (`src/app/locale-switch.tsx`) и се чете само за езика на имейлите; routing-ът
  не го ползва (`routing.ts:15-17`).
- Публичният превод на съдържание от seed-а (напр. „Спининг“ → „Spinning“) е
  списък с ТОЧНИ съвпадения — редактирано от студиото съдържание не се
  „превежда“ автоматично (`src/lib/sport-content.ts:1-32`).
- Админ панелът и панелът на инструктора са само на български
  (`admin/layout.tsx:17-23` пренасочва `/en/admin` → `/admin`).

## 2. Езикът на имейлите — кой решава кое

| Писмо | Език източник | Код |
|---|---|---|
| Потвърждение на резервация | `bookings.locale` — запазен при резервацията | `checkout/route.ts:52,152` |
| Напомняне | `bookings.locale` | `cron/reminders/route.ts:60-69` |
| Отказ (клиентски/админски) | `bookings.locale` | `bookings.ts:100-107` |
| Освободено място (чакащи) | `waitlist_entries.locale` — запазен при записването | `waitlist.ts:48-59` |
| Автентикационни (потвърждение/reset/съществуващ профил) | header `x-app-locale` (пращат го формите) → cookie `NEXT_LOCALE` → bg | `src/lib/auth.ts:18-20`, `src/lib/locale.ts:31-42` |

Същите текстове на двата езика живеят в `TEXTS` в `src/lib/email.ts:53-182`.
Форматът на датите в писмата е софийски (`formatDateTimeLong`).

## 3. Двата пътя на изпращане (`src/lib/email.ts`)

1. **SMTP (продукция)**: зададен ли е `SMTP_HOST` → nodemailer транспорт
   (`:312-332`): Google Workspace SMTP relay `smtp-relay.gmail.com:587`,
   requireTLS, EHLO с името на сайта (relay-ят отказва голо име на контейнер),
   без парола (IP allowlist на VPS адреса), опционално `SMTP_USER`/`SMTP_PASS`.
   Настройката от страната на Google е описана в `deploy/README.md:321-339`.
2. **Resend (резерв/локално)**: без `SMTP_HOST` → Resend API с `RESEND_API_KEY`,
   подател по подразбиране `reservations@<RESEND_EMAIL_DOMAIN>`; `EMAIL_FROM`
   (напр. `WheelyLove <adelina@purepoint.bg>`) печели.
- Отговорът на клиентите (`Reply-To`) винаги е пощата на студиото
  (`wheelylove@abv.bg`, константа в `email.ts:22`).
- Обработка на грешки: автентикационните писма хвърлят (клиентът разбира,
   че не е изпратено), транзакционните (резервации) логват с маркера
   **`[email:FAILED]`** и поглъщат грешката — проваленото писмо не проваля
   резервацията (`:279-306`).
- Всички писма са inline-styled HTML (клиентите за поща губят `<style>`),
   лого от `${SITE_URL}/email-logo.png`.

## 4. Видове писма (пълния списък)

| Тип | Кога | Текст | Бутон води към |
|---|---|---|---|
| booking-confirmation | успешна резервация | „приета“ + плащане на място | /my-bookings |
| booking-reminder | cron, ≤26 ч преди час | „ела 10 мин по-рано“ | /my-bookings |
| waitlist-spot-open | освобождено място | „пръв се записва“ | /sports/<slug> |
| booking-cancelled | отказ (клиент/админ) | два варианта: твоя резервация / отменен час | /#schedule |
| existing-account | опит за регистрация със существуващ имейл | + линк за нова парола | /forgot-password |
| verification (24 ч) | регистрация / поискване | „потвърди имейла си“ | по-добре auth линк → /sign-in?verified=1 |
| password-reset (1 ч) | забравена парола | еднократен линк | /reset-password |

Всяко писмо за резервация включва и трите календарни/адресни линка
(Google Calendar, .ics, „как да стигна“ — `calendarLinksHtml`, `:363-381`).

## 5. Дневният таймер за напомняния

- systemd: `wheelylove-reminders.timer` — всеки ден **08:00 UTC**
  (`deploy/systemd/wheelylove-reminders.timer`), `Persistent=true` (наваксва
  след рестарт на машината). Пуска `deploy/scripts/cron-reminders.sh`, който
  вика `http://127.0.0.1:5610/api/cron/reminders` с Bader тайната, подадена
  по stdin (не се вижда в `ps`).
- 08:00 UTC = 10:00 софийско зимно / 11:00 лятно: напомнянията за „утре
  сутринта“ отиват навреме целогодишно, а тези за „същия ден“ остават с
  часове запас (прозорецът е 26 ч).
- Ръчен тест на VPS:
  ```bash
  systemctl start wheelylove-reminders.service && journalctl -u wheelylove-reminders -n 20 --no-pager
  ```
  Очакван отговор: `{"sent":N}` (deploy/README.md:226-230).
- Наблюдение на провалени писма: `deploy/scripts/check-email-failures.sh`
  брои `[email:FAILED]` маркери в docker лога (cron на 15 мин препоръчан в
  `deploy/README.md:232-245`).

## 6. Как се добавя нов тип писмо (за агента)

1. Добави текстове и в двата езикови блока на `TEXTS` (`src/lib/email.ts`).
2. Направи `send<Нещо>Email` функция, извикай `sendEmail` с правния `kind`
   (`auth` хвърля, `transactional` логва) и `type` (за търсене в логовете).
3. Тествай локално без реална поща: SMTP catcher-ът в `.glm-smtp-catcher.mjs`
   показва писмата локално (вж. [13](13-testove-i-proverki.md) §6); unit
   тестите мокват изпращането (`email-smtp.test.ts`, `email.test.ts`).
