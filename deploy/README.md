# WheelyLove - production deploy на VPS (изолирано)

Това е пакетът за пускане на WheelyLove (Next.js 16) на VPS `164.138.216.72` (Ubuntu 22.04, Docker, nginx,
Cloudflare отпред), ИЗОЛИРАНО от другите услуги там (QHub, primorsko-mail, ads-approve, creato-hub-db,
PostgreSQL 14, OpenVPN към клиентската мрежа, netdata). Нищо от този пакет не е изпълнявано още - всичко е
само файлове в репото. Нищо не се пуска без ваше изрично одобрение.

Временен адрес: `wheelylove.purepoint.bg`. По-късно идва собствен домейн (вижте "Собствен домейн").

## 1. Накратко: как е устроено

```
Интернет -> Cloudflare -> nginx (443, само Cloudflare IP) -> 127.0.0.1:5610 -> [app]  --wl-internal (затворена мрежа)--> [db]
                                                                                  \--wl-egress (само изходящ HTTPS, филтриран)--> Clerk, Stripe, Resend, Twilio, R2
```

| Решение | Защо (просто) |
|---|---|
| Два контейнера `app` и `db` в проект `wheelylove`, папка `/srv/wheelylove` | Всичко на едно място; не се смесва с другите проекти. |
| Порт `127.0.0.1:5610` (само loopback) | Проверено на VPS: 5610 е свободен; достъпен е само за nginx на същата машина, не от интернет. |
| Мрежа `wl-internal` с `internal: true` | `db` няма никакъв маршрут навън и няма публикуван порт. Само `app` го вижда. |
| Мрежа `wl-egress` (172.28.61.0/24) само за `app` | `app` трябва да вика Clerk/Stripe/Resend/Twilio/R2. Тази мрежа е филтрирана от защитната стена (т. 4). |
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
| `deploy/cron/wheelylove-backup`, `deploy/scripts/backup.sh` | Нощен `pg_dump`, 14 дни ротация. |
| `deploy/scripts/lib.sh`, `cron-reminders.sh` | Помощни. |
| `deploy/import-from-neon.md` | Пренос на данните от Neon. |

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
nano /srv/wheelylove/.env                # сменете всяко CHANGE_ME (POSTGRES_PASSWORD и CRON_SECRET са вече генерирани)
ls -l /srv/wheelylove/.env               # очаквано: -rw------- root root
```
Cloudflare: DNS запис `A wheelylove -> 164.138.216.72` (Proxied) и SSL/TLS режим "Full (strict)" (иначе 80->443
пренасочването върти в кръг). Ако ползвате Clerk production instance, добавете и неговите DNS записи (`clerk.` и т.н.,
"DNS only") според указанията на Clerk. Stripe webhook: `https://wheelylove.purepoint.bg/api/webhooks/stripe`; в
Cloudflare WAF добавете изключение за този път, ако Stripe получава 403.

## 6. Пускане на версия (deploy) и връщане

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

Резервен вариант без билд на VPS: `deploy.sh --image-tar app.tar migrate.tar release.tar.gz`, като образите са
записани с `docker save` под имената `wheelylove-app:prebuilt` и `wheelylove-migrate:prebuilt`.

## 7. Дневни напомняния (cron)

Таймерът `wheelylove-reminders.timer` вика всеки ден в 08:00 UTC `http://127.0.0.1:5610/api/cron/reminders`
директно (не през интернет; nginx връща 404 на `/api/cron/`). Тайната `CRON_SECRET` се чете от `.env` и се подава
на `curl` през stdin - не се вижда в `ps`.

```bash
systemctl list-timers wheelylove-reminders.timer --no-pager     # кога е следващото пускане
systemctl start wheelylove-reminders.service && journalctl -u wheelylove-reminders -n 20 --no-pager   # ръчен тест
```
Очаквано: `{"sent":N}`. Връщане: `systemctl disable --now wheelylove-reminders.timer`.

## 8. Архиви

Нощно в 02:17 (`/etc/cron.d/wheelylove-backup`) се прави `pg_dump` (custom формат) в `/srv/wheelylove/backups`,
14 дни ротация; `deploy.sh` прави и `pre-deploy-*.dump` преди всяка миграция.

```bash
bash /srv/wheelylove/deploy/scripts/backup.sh && ls -lh /srv/wheelylove/backups | tail -3      # ръчен архив
# Възстановяване (ПРЕЗАПИСВА текущите данни! първо спрете app: docker stop wheelylove-app):
docker exec -i wheelylove-db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --no-acl' < /srv/wheelylove/backups/<файл>.dump
docker start wheelylove-app
```
Архивите са на същия сървър и същия loop диск - при загуба на машината ги губите. Добавете копие извън сървъра
(напр. `rclone` към R2) - не е включено в този пакет.

## 9. nginx, CSP, ограничаване на заявките

- vhost: 80 -> 301 към https; 443 със сертификата `/etc/ssl/cloudflare/purepoint-origin.crt` (покрива `*.purepoint.bg`);
  `include /etc/nginx/cloudflare-allow.conf` (проверено: файлът и сертификатите съществуват);
  `client_max_body_size 10m` (приложението ограничава качванията до 8 MB); proxy таймаути 60 s (Cloudflare режe на ~100 s).
- Ограничаване: `/api/` 30 заявки/мин на клиент (burst 20); server actions (заявки с хедър `Next-Action`) 60/мин
  (burst 30); ключът е `CF-Connecting-IP`. Stripe webhook е без ограничение (подписът се проверява от приложението).
- CSP е съвместим с Clerk + Stripe и е включен като **Report-Only** (нищо не се чупи; нарушенията се виждат в конзолата на браузъра).
  След около седмица чисто ползване (вход, регистрация, резервация, плащане, админ галерия) сменете реда
  `Content-Security-Policy-Report-Only` с `Content-Security-Policy` във `deploy/nginx/wheelylove.conf`, после нов release и повторно `install.sh` (то прави `nginx -t` преди reload).
  `'unsafe-inline'` за скриптове е нужен на Next.js без nonce. Ако Clerk production ползва `clerk.<домейн>`, сверете двата
  записа `clerk.wheelylove.purepoint.bg` в CSP.
- Ако искате собствено ограничаване на логин: Clerk има свое; тук не се дублира.

## 10. Собствен домейн (по-късно)

1. Във `deploy/nginx/wheelylove.conf` добавете домейна към ДВЕТЕ `server_name` (има коментар).
2. Нужен е Cloudflare origin сертификат за новия домейн (`*.purepoint.bg` не го покрива) - добавете втори
   `ssl_certificate` блок или нов сертификат за двата домейна.
3. Сменете `NEXT_PUBLIC_APP_URL` и Clerk/Stripe настройките в `.env`, ново `deploy.sh` (адресът е вграден при билда).
4. Обновете CSP записите за Clerk. Пуснете `install.sh` повторно (идемпотентен; прави `nginx -t` преди reload).

## 11. Рискове за съществуващите услуги (какво проверих и какво остава)

- nginx: нов vhost + два файла (`conf.d`, `snippets`) - общият `nginx.conf` не се променя; грешка в конфигурацията би
  блокирала reload за всички, затова `install.sh` прави `nginx -t` преди reload и сам маха файловете при провал.
  Имената на зоните и променливите са с префикс `wl_`, за да не пречат на `crm-ratelimit.conf`.
- iptables: два прехода (по интерфейс) в споделените `DOCKER-USER` и `INPUT`; не пипат ufw/Docker правилата.
- Docker daemon НЕ се рестартира никъде (би рестартирал `creato-hub-db`).
- Билд на VPS ползва до 1.5 от 4 ядра няколко минути -> пускайте в тих час; RAM е с твърд таван 2 GB.
- Loop диск: 6 GB се резервират веднага от ~60 GB свободни.
- Порт 5610 и подмрежите 172.28.61/62.0/24 са свободни към момента на проверката (read-only); `install.sh` ги проверява отново.
