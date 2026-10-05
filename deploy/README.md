# WheelyLove - production deploy на VPS (изолирано)

Това е пакетът за пускане на WheelyLove (Next.js 16) на VPS `164.138.216.72` (Ubuntu 22.04, Docker, nginx,
Cloudflare отпред), ИЗОЛИРАНО от другите услуги там (QHub, primorsko-mail, ads-approve, creato-hub-db,
PostgreSQL 14, OpenVPN към клиентската мрежа, netdata). Нищо от този пакет не е изпълнявано още - всичко е
само файлове в репото. Нищо не се пуска без ваше изрично одобрение.

Временен адрес: `wheelylove.purepoint.bg`. По-късно идва собствен домейн (вижте "Собствен домейн").

## 1. Накратко: как е устроено

```
Интернет -> Cloudflare -> nginx (443, само Cloudflare IP) -> 127.0.0.1:5610 -> [app]  --wl-internal (затворена мрежа)--> [db]
                                                                                  \--wl-egress (само изходящ HTTPS, филтриран)--> Resend (имейли)
```

| Решение | Защо (просто) |
|---|---|
| Два контейнера `app` и `db` в проект `wheelylove`, папка `/srv/wheelylove` | Всичко на едно място; не се смесва с другите проекти. |
| Порт `127.0.0.1:5610` (само loopback) | Проверено на VPS: 5610 е свободен; достъпен е само за nginx на същата машина, не от интернет. |
| Мрежа `wl-internal` с `internal: true` | `db` няма никакъв маршрут навън и няма публикуван порт. Само `app` го вижда. |
| Мрежа `wl-egress` (172.28.61.0/24) само за `app` | `app` трябва да вика само Resend (имейли). Тази мрежа е филтрирана от защитната стена (т. 4). |
| Подмрежи 172.28.61.0/24 и 172.28.62.0/24 | Проверено: заети са 172.17-172.20/16 (Docker), 10.10.0.0/16 + 10.50.0.0/24 + 172.16.91.0/24 + 192.168.102.0/24 + 77.85.202.0/26 (OpenVPN tun0). 172.28.61/62 не се пресичат с нищо. |
| Loop диск 6 GB (`/srv/wheelylove.img`) | Файл с фиксиран размер, монтиран като отделен диск (`nosuid,nodev`). Данните на проекта НЕ МОГАТ да запълнят главния диск. |
| Ротация на логовете (10 MB x 3 на контейнер) | Логовете на Docker не растат безкрайно. |
| `read_only`, `cap_drop: ALL`, `no-new-privileges`, не-root потребител, лимити за памет/CPU/процеси | Ако приложението бъде пробито, вътре почти нищо не може да се прави и не може да изяде машината. |
| Без `realip` във vhost-а | На този сървър `realip` се бие със списъка `cloudflare-allow.conf`. Истинското IP се взема от хедъра `CF-Connecting-IP` (безопасно, защото vhost-ът пуска само Cloudflare). |

## 2. Файлове

| Файл | За какво е |
|---|---|
| `Dockerfile`, `.dockerignore` (в корена) | Многоетапен образ `node:22-alpine`, Next standalone, non-root; втора цел `migrate`. |
| `deploy/docker-compose.yml` | `app`, `db`, еднократен `migrate`, мрежите. |
| `deploy/.env.production.example` | Шаблон на променливите. Истинският файл е `/srv/wheelylove/.env` (root, режим 600). |
| `deploy/install.sh` | Първоначална настройка (идемпотентен): диск, папки, защитна стена, nginx, таймер, cron. |
| `deploy/deploy.sh` / `deploy/rollback.sh` | Пускане на нова версия / връщане към предишната. |
| `deploy/uninstall.sh` | Маха всичко, което `install.sh` е сложил (без да трие данни). |
| `deploy/firewall/wheelylove-firewall.sh` + `deploy/systemd/wheelylove-firewall.service` | Собствени iptables вериги, само за мрежите на WheelyLove. |
| `deploy/nginx/*` | vhost, зони за ограничаване на заявките, общи proxy настройки. |
| `deploy/systemd/wheelylove-reminders.*` | Дневен таймер 08:00 UTC за `/api/cron/reminders`. |
| `deploy/cron/wheelylove-backup`, `deploy/scripts/backup.sh` | Нощен `pg_dump` + tar на качванията, 14 дни ротация. |
| `deploy/scripts/lib.sh`, `cron-reminders.sh` | Помощни. |
| `deploy/import-from-neon.md` | Еднократен (по избор) импорт на спортове/инструктори/часове/галерия от старата Neon база. |
| `deploy/migrate-r2-to-local.md`, `scripts/migrate-r2-to-local.ts` | Еднократна миграция на снимките/видеото от Cloudflare R2 към локалния диск. |

## 3. Ресурси (приблизителни оценки; ще се потвърдят с `docker stats` след първото пускане)

| Какво | RAM (обичайно) | RAM (твърд таван) | CPU | Диск |
|---|---|---|---|---|
| `app` | 150-300 MB | 512 MB (`memswap` = същото, без swap) | <5% от ядро; таван 1.0 | образ ~300 MB (на главния диск); tmpfs до 192 MB е в рамките на тавана |
| `db` (Postgres 17) | 60-150 MB | 384 MB | <3%; таван 0.5 | данни върху loop диска (старт <100 MB); целият loop диск = 6 GB фиксирани |
| `migrate` (няколко секунди при пускане) | ~150 MB | 384 MB | таван 0.5 | образ ~600-800 MB (споделя слоеве с кеша на билда) |
| Билд на VPS (само при пускане, няколко минути) | 1.5-2 GB | 2 GB твърдо (builder контейнер) | таван 1.5 ядро от 4 | кеш на билда до 1 GB + 3 версии образи на `/var/lib/docker` |
| Логове | - | - | - | най-много 60 MB (3 x 10 MB x 2 контейнера) |

Сметка спрямо VPS (7.9 GB RAM, ~6.2 GB свободни, 61 GB диск):
- В покой: `app` + `db` ~ 0.25-0.45 GB (най-много 0.9 GB по таваните) -> остават >5 GB.
- При пускане (най-лошия момент): 0.9 GB + 2.0 GB билд = ~2.9 GB -> остават >=3.3 GB. Билдът не може да надхвърли 2 GB (и само той ще бъде убит от ядрото, ако го надхвърли - QHub и другите не се засягат).
- Запас за идващия Creato HUB: дори да му се заделят 2 GB, остава >1 GB запас в най-лошия момент на пускане; в покой ~3 GB.
- Диск: 6 GB (loop) + ~2-3 GB (образи, кеш, логове) = ~9 GB от 61 GB -> остават ~50 GB.
- Процесор: 4 ядра; в покой <0.1 ядро; при билд до 1.5 ядро няколко минути (пускайте в тих час).

### Къде се строи образът - решение

Избрано: **билд на VPS, в отделен buildx builder с твърд лимит 2 GB RAM / 1.5 CPU**, с резервен вариант
"наготово образи" (`deploy.sh --image-tar ...`).

Защо: на вашия компютър няма Docker (проверено: командата `docker` липсва), а RAM-ът на лаптопа е тясното място.
`docker build --memory` не върши работа с BuildKit (флагът се игнорира), затова лимитът е на самия builder
контейнер (`--driver-opt memory=2g`). `deploy.sh` ПРОВЕРЯВА, че лимитът наистина е приложен, и спира, ако не е -
никога не строи без таван на продукционна машина. Билдът е бавен (няколко минути), но безопасен: ако го убие
ядрото (нужда от повече от 2 GB), пускането просто пропада, а работещата версия не е докосната. Тогава вдигнете
`BUILDER_MEM` в `deploy.sh` (напр. 3g - все още безопасно) или строете наготово другаде.

## 4. Мрежова изолация (защитна стена)

`deploy/firewall/wheelylove-firewall.sh` създава ДВЕ собствени вериги и по ЕДИН преход към всяка:

- `WHEELYLOVE` (от `DOCKER-USER`, само за `-i wl-egress0` и `-s 172.28.61.0/24`): DROP към всички частни
  диапазони (10/8, 172.16/12, 192.168/16 - значи другите Docker мрежи и OpenVPN тунела), 100.64/10, 169.254/16,
  127/8, multicast; разрешава established/related; към интернет пуска САМО портове 80 и 443 (`EGRESS_PORTS`).
- `WHEELYLOVE-IN` (от `INPUT`, само за `wl-egress0` и `wl-internal0`): контейнерите не могат да отварят връзки
  към самия хост (QHub :4000, netdata :19999 и т.н.); отговорите на вече отворени връзки минават.

Важна находка: пакетите към собствените адреси на хоста минават през `INPUT`, а не през `FORWARD`, затова само
правилото `--dst-type LOCAL` в `DOCKER-USER` не би спряло достъпа до услугите на хоста. Затова има и `INPUT` правило.
Проверено на VPS: `DOCKER-USER` е празна, `FORWARD` сочи първо към нея; политиката на `INPUT` е DROP (ufw).

Никой друг контейнер и трафик не се засяга - всяко правило е ограничено по интерфейс. Връщане:
`bash /srv/wheelylove/deploy/uninstall.sh` (или само `sudo /usr/local/sbin/wheelylove-firewall remove`).

Остатъчен риск: при рестарт на сървъра контейнерите тръгват заедно с Docker, а защитната стена се прилага секунди
по-късно -> кратък прозорец без филтър при зареждане. Приемливо, но го знайте.

## 5. Първо инсталиране (стъпка по стъпка)

Предпоставки в кода (друг агент ги прави - проверете ПРЕДИ билд):
1. `next.config.ts` има `output: "standalone"` (Dockerfile сам се проваля с ясно съобщение, ако няма).
2. Миграциите са в `./drizzle` и са в git (`deploy.sh` отказва без тях); `package.json` използва драйвера `postgres`.
3. `.gitignore` съдържа `.env*`, което хваща и `deploy/.env.production.example`. Добавете го принудително:
   `git add -f deploy/.env.production.example` (или изключение `!deploy/.env.production.example` в `.gitignore`).
   Без него `git archive` няма да го включи и `install.sh` ще спре с обяснение.
4. Ако страници се опитват да четат базата по време на `next build`, билдът ще падне (няма база при билд).
   Тогава на тези страници трябва `export const dynamic = "force-dynamic"` - това е в `src/`, не тук.

От вашия компютър (PowerShell, папка `D:\dev\Wheelylove`, след като промените са commit-нати):

```powershell
git archive --format=tar.gz -o $env:TEMP\release.tar.gz HEAD
scp -i ~/.ssh/invictus_key $env:TEMP\release.tar.gz root@164.138.216.72:/root/release.tar.gz
```
Очаквано: файл ~ няколко MB качен без грешка. Връщане: `ssh ... rm /root/release.tar.gz`.

На VPS (root):

```bash
mkdir -p /root/wl-src && tar -xzf /root/release.tar.gz -C /root/wl-src
less /root/wl-src/deploy/install.sh          # прегледайте преди да го пуснете
bash /root/wl-src/deploy/install.sh
```
Очаквано: 7 стъпки с `ok:`, накрая "Next steps". `install.sh` първо само проверява (docker, nginx, сертификата,
свободен порт/подмрежи), после създава диска, `.env`, защитната стена, nginx vhost (с `nginx -t` ПРЕДИ reload;
при грешка сам връща промените) и таймера. Не стартира приложението.
Връщане: `bash /srv/wheelylove/deploy/uninstall.sh`.

После:
```bash
nano /srv/wheelylove/.env                # сменете всяко CHANGE_ME (POSTGRES_PASSWORD, CRON_SECRET и BETTER_AUTH_SECRET са вече генерирани)
ls -l /srv/wheelylove/.env               # очаквано: -rw------- root root
```
Cloudflare: DNS запис `A wheelylove -> 164.138.216.72` (Proxied) и SSL/TLS режим "Full (strict)" (иначе 80->443
пренасочването върти в кръг). Входът е собствен (Better Auth в нашия Postgres) - няма външни auth услуги за настройване.

## 6. Пускане на версия (deploy) и връщане

**ВНИМАНИЕ - първи release на новия стек:** `deploy.sh` НЕ инсталира nginx конфигурацията,
папката `/srv/wheelylove/uploads` и останалата извън-Docker настройка - прави го само
`install.sh`. Затова за ТОЗИ първи release редът е задължителен:
`install.sh` (стъпка 5) ПРЕДИ първия `deploy.sh` - иначе сайтът тръгва без vhost и без
папка за качванията. При по-късни releases `deploy.sh` само сравнява nginx/firewall
файловете с инсталираните и предупреждава при разлика (вж. стъпка 8 в самия скрипт).

```bash
bash /srv/wheelylove/deploy/deploy.sh /root/release.tar.gz
```
Стъпки (9): проверки -> разархивиране -> билд (с лимит) -> старт на db -> архив преди миграция -> `migrate` ->
превключване на `app` -> проверка на здравето (при неуспех автоматично връща старата версия) -> чистене.
Очаквано в края: `DEPLOY OK: wheelylove-app:<време>-<commit>`. Прекъсване: ~5-20 секунди 502 при смяната на
контейнера (db не се рестартира).

Проверка отвън: `curl -sI https://wheelylove.purepoint.bg/ | head -5` (очаквано: HTTP/2 200 или 307) и че
`curl -sI http://164.138.216.72/` не отговаря от името на сайта (заключено към Cloudflare).

Връщане към предишната версия (секунди):
```bash
bash /srv/wheelylove/deploy/rollback.sh            # към предишната; втори път -> обратно напред
bash /srv/wheelylove/deploy/rollback.sh <tag>      # към конкретна (docker images wheelylove-app)
```
Внимание: връщането сменя само приложението, миграциите на базата НЕ се отменят. Правете миграциите
обратно съвместими (първо добавяне, после махане). Ако миграция трябва да се отмени: възстановете архива
`pre-deploy-*.dump` (т. 8).

Първи админ: регистрирайте се в сайта с имейла на студиото, ПОТВЪРДЕТЕ имейла (линкът идва по пощата - без
това скриптът отказва) и на вашия компютър задайте ролята: `npm run set-admin -- <имейл>`. Скриптът чете
`.env.admin` (копирайте `.env.admin.example` - там е описано как стигате до продукционната база през SSH
тунел). Внимание: `.env.admin` е САМО за set-admin - не насочвайте `.env.local` (тестове, миграции, dev)
към производствената база никога; тестовете отказват да тръгнат срещу база, чието име не завършва на `_test`.
Алтернатива без тунел: пуснете същата команда в контейнера на VPS (`docker exec -it wheelylove-app node ...`
или кратък `docker compose run` с променлива `DATABASE_URL` към `db`). След смяната на ролята скриптът
прекратява всички сесии на потребителя И обезсилва паролата му (защото акаунтът може да е бил предварително
регистриран с чужда парола) - собственикът трябва да зададе нова парола през „Забравена парола" преди
първия вход.

Резервен вариант без билд на VPS: `deploy.sh --image-tar app.tar migrate.tar release.tar.gz`, като образите са
записани с `docker save` под имената `wheelylove-app:prebuilt` и `wheelylove-migrate:prebuilt`.

### Отложени миграции (deferred)

`deploy.sh` прилага ВСИЧКО в `./drizzle` (през `drizzle-kit migrate` и журнала
`drizzle/meta/_journal.json`). Миграции, които трият колони, се държат ВНЕ от тази папка -
в `deploy/deferred-migrations/` - и не се прилагат с текущия release:

- **`deferred-drop_stripe_columns.sql`** (умишлено без номер - при пускане получава следващия свободен номер в `drizzle/`) - трие остарелите Stripe колони на `bookings`.
  Пуска се чак с ВТОРИЯ release на новия стек: дотогава колоните остават, за да може
  първият release да се върне към версия на приложението, която още ги чете.
  Точните стъпки (преместване + запис в журнала) са описани в самия файл.

## 7. Дневни напомняния (cron)

Таймерът `wheelylove-reminders.timer` вика всеки ден в 08:00 UTC `http://127.0.0.1:5610/api/cron/reminders`
директно (не през интернет; nginx връща 404 на `/api/cron/`). Тайната `CRON_SECRET` се чете от `.env` и се подава
на `curl` през stdin - не се вижда в `ps`.

```bash
systemctl list-timers wheelylove-reminders.timer --no-pager     # кога е следващото пускане
systemctl start wheelylove-reminders.service && journalctl -u wheelylove-reminders -n 20 --no-pager   # ръчен тест
```
Очаквано: `{"sent":N}`. Връщане: `systemctl disable --now wheelylove-reminders.timer`.

### Проверка за неуспешно изпратени писма (на 15 мин)

Всяко отхвърлено от Resend писмо се логва с маркера `[email:FAILED]` от приложението; писмата за резервации
не прекъсват резервацията, затова грешката може да остане незабелязана. `deploy/scripts/check-email-failures.sh`
брои маркерите в `docker logs --since <период>` на app контейнера и при >0 печата кратко обобщение по тип
писмо (без имейл адреси) и излиза с код 1. Примерен cron ред (на 15 мин; в проекта няма механизъм за
известия - записва се в syslog, както нощният архив):

```cron
*/15 * * * * root /srv/wheelylove/deploy/scripts/check-email-failures.sh 15m 2>&1 | logger -t wheelylove-email
```

При пропаднали писма в журнала се появява `wheelylove-email: ... EMAIL FAILURES ...` - алармирайте по него
с обичайния за сървъра мониторинг (извън този пакет). Ръчен тест: `bash /srv/wheelylove/deploy/scripts/check-email-failures.sh 15m; echo $?`.

## 8. Архиви

Нощно в 02:17 (`/etc/cron.d/wheelylove-backup`) се прави `pg_dump` (custom формат) на базата И `tar.gz` на
`/srv/wheelylove/uploads` (снимки/видео от галерията) в `/srv/wheelylove/backups`, 14 дни ротация;
`deploy.sh` прави и `pre-deploy-*` архиви преди всяка миграция.

```bash
bash /srv/wheelylove/deploy/scripts/backup.sh && ls -lh /srv/wheelylove/backups | tail -4      # ръчен архив
# Възстановяване на базата (ПРЕЗАПИСВА текущите данни! първо спрете app: docker stop wheelylove-app):
docker exec -i wheelylove-db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --no-acl' < /srv/wheelylove/backups/<файл>.dump
# Възстановяване на качванията:
tar -xzf /srv/wheelylove/backups/<файл>-uploads.tar.gz -C /srv/wheelylove
docker start wheelylove-app
```
Внимание: uploads растат с галерията и седят на същия 6 GB loop диск - следете `df -h /srv/wheelylove`.
Архивите са на същия сървър и същия loop диск - при загуба на машината ги губите. Добавете копие извън сървъра
(напр. `rclone` към друго хранилище) - не е включено в този пакет.

## 8а. Качвания на локален диск (няма вече R2)

Снимките и видеата от галерията се записват от приложението в `/data/uploads` (bind mount на
`/srv/wheelylove/uploads`, собственик uid 10001 = app потребителя) и nginx ги раздава директно от диска на
`/uploads/<uuid>.<ext>` - заявката изобщо не минава през Node. Приложението приема само JPEG/PNG/WebP до 8 MB и
MP4 до 50 MB (проверка по magic bytes, UUID име на файла); nginx служи само разширенията jpg/jpeg/png/webp/mp4
(всичко друго е 404) с `Content-Security-Policy: default-src 'none'; sandbox`, без autoindex, с дълъг cache.

**Компромисът с големината на заявките:** глобално nginx позволява само 2 MB тяло на заявка (достатъчно за форми
и JSON, дребно поле за атака). Единствено `location /admin/gallery` позволява 55 MB, защото качването в галерията е
server action към страницата `/admin/gallery` (50 MB видео + multipart overhead). Този път е допълнително ограден:
nginx пита приложението (`auth_request` към вътрешния location `/_auth/admin` → `GET /api/internal/admin-check`)
дали заявката носи валидна АДМИН сесия — роля admin И потвърден имейл, същата проверка като в админ действията
(`isAdmin` в `src/lib/admin.ts`). Без нея (анонимна заявка, фалшива/изтекла бисквитка, обикновен потребител,
непотвърден админ) nginx връща 401/403, ПРЕДИ да е прочел тялото на заявката. Пътят има и собствена тавърда
rate-limit зона (`wl_admin_upload`, 6/мин, burst 3), броена по реалното клиентско IP за ВЯРКА заявка към пътя —
не по хедъра `Next-Action`, защото обикновена `<form>` публикация (progressive enhancement) не го изпраща.
Типът и големината на файла се проверяват от приложението след качването. Директните външни заявки към
`/api/internal/` получават 404 (както `/api/cron/`) — маршрутът е достъпен само като internal subrequest.
Ако някой ден качването стане публично, този лимит трябва да се премахне и да се ползва директен S3-подобен upload.

## 9. nginx, CSP, ограничаване на заявките

- vhost: 80 -> 301 към https; 443 със сертификата `/etc/ssl/cloudflare/purepoint-origin.crt` (покрива `*.purepoint.bg`);
  `include /etc/nginx/cloudflare-allow.conf` (проверено: файлът и сертификатите съществват);
  `client_max_body_size 2m` глобално и `55m` само за `/admin/gallery` - с проверка за валидна админ сесия през
  `auth_request` (вж. т. 8а) и отделна rate-limit зона; proxy таймаути 60 s (Cloudflare реже на ~100 s).
- Ограничаване: `/api/` 30 заявки/мин на клиент (burst 20); server actions (заявки с хедър `Next-Action`) 60/мин
  (burst 30); качване в галерията (`/admin/gallery`) - отделна зона 6/мин (burst 3), ключът е реалният клиентски IP от
  `CF-Connecting-IP` за вярка заявка към пътя. Входът/регистрацията/смената на парола имат и
  собствено ограничение в приложението (Better Auth, със storage в базата - виж `.env` и кода).
- CSP е само `'self'` вече (входът е собствен, няма Stripe/Clerk/външни скриптове) и е включен като **Report-Only**
  (нищо не се чупи; нарушенията се виждат в конзолата на браузъра). След около седмица чисто ползване (вход,
  регистрация, резервация, админ галерия) сменете реда `Content-Security-Policy-Report-Only` с
  `Content-Security-Policy` във `deploy/nginx/wheelylove.conf`, после нов release и повторно `install.sh` (то прави
  `nginx -t` преди reload). `'unsafe-inline'` за скриптове е нужен на Next.js без nonce.

## 10. Собствен домейн (по-късно)

1. Във `deploy/nginx/wheelylove.conf` добавете домейна към ДВЕТЕ `server_name` (има коментар).
2. Нужен е Cloudflare origin сертификат за новия домейн (`*.purepoint.bg` не го покрива) - добавете втори
   `ssl_certificate` блок или нов сертификат за двата домейна.
3. Сменете `NEXT_PUBLIC_APP_URL` и `BETTER_AUTH_URL` в `.env` (двете са равни), ново `deploy.sh` (адресът е вграден при билда).
4. Пуснете `install.sh` повторно (идемпотентен; прави `nginx -t` преди reload).

## 11. Рискове за съществуващите услуги (какво проверих и какво остава)

- nginx: нов vhost + два файла (`conf.d`, `snippets`) - общият `nginx.conf` не се променя; грешка в конфигурацията би
  блокирала reload за всички, затова `install.sh` прави `nginx -t` преди reload и сам маха файловете при провал.
  Имената на зоните и променливите са с префикс `wl_`, за да не пречат на `crm-ratelimit.conf`.
- iptables: два прехода (по интерфейс) в споделените `DOCKER-USER` и `INPUT`; не пипат ufw/Docker правилата.
- Docker daemon НЕ се рестартира никъде (би рестартирал `creato-hub-db`).
- Билд на VPS ползва до 1.5 от 4 ядра няколко минути -> пускайте в тих час; RAM е с твърд таван 2 GB.
- Loop диск: 6 GB се резервират веднага от ~60 GB свободни.
- Порт 5610 и подмрежите 172.28.61/62.0/24 са свободни към момента на проверката (read-only); `install.sh` ги проверява отново.
