# 14. Deploy и release: пускане, миграции, health, rollback

## 1. Кой как върви (наблюдавано от координатора, 2026-10-06)

VPS `164.138.216.72`, проект `/srv/wheelylove` (собствен 6 GB loop диск),
Docker контейнери `wheelylove-app` (текущ release) и `wheelylove-db`
(продукционна база), отпред nginx + Cloudflare. Пускането е с
`bash /srv/wheelylove/deploy/deploy.sh /tmp/wheelylove-<SHA>.tar.gz`, а
архивът на release-а се прави на работната станция с `git archive HEAD`.
Последен пуснат release: `20261006-094012-70fa290`.

## 2. Пътят на един release (стъпка по стъпка)

**На работната станция** (Git Bash, `D:\dev\Wheelylove`; commit-нете всичко
преди това — `git archive` взима само комитнати файлове!):

```bash
# 1. проверки локално (вж. 13)
npx tsc --noEmit && npm run lint && npm test

# 2. архив от ТОЧНО комитнатото състояние
git archive --format=tar.gz -o /tmp/wheelylove-$(git rev-parse --short HEAD).tar.gz HEAD

# 3. качване (примерният ключ/път са на вашата машина)
scp /tmp/wheelylove-<sha>.tar.gz <потребител>@164.138.216.72:/tmp/
```

**На VPS (root)**:

```bash
bash /srv/wheelylove/deploy/deploy.sh /tmp/wheelylove-<sha>.tar.gz
```

`deploy.sh` прави 9 стъпки (`deploy/deploy.sh:39-186`): проверки (env 600,
без `CHANGE_ME`, docker жив, ≥2800 MB RAM за билд) → разархивиране в
`releases/<ид>` (идът = UTC дата-време + първите 7 знака на SHA) → билд на
VPS в builder с твърд лимит **2 GB RAM / 1.5 CPU** (проверява, че лимитът
реално е приложен; алтернатива `--image-tar` с готови образи) → db healthy →
**pre-deploy архив на базата** → `drizzle-kit migrate` (провал = СПИРА,
старото приложение продължава) → смяна на app контейнера → health check
(неспокоен → автоматичен rollback към старото) → запис на таговете
(`state/tag.env`, `state/prev_tag.env`), symlink `current`, копие на
deploy/ скриптовете, предупреждение при divergence с nginx/firewall
файловете → чистене (3 releases, текущ+предишен образи).

- **Прекъсване**: ~5-20 s 502 при смяната на контейнера; базата не се
  рестартира (`deploy.sh:13`).
- `NEXT_PUBLIC_APP_URL` е build arg → смяната на домейн изисква нов deploy.

## 3. След deploy: проверка

```bash
# на VPS:
docker ps --filter name=wheelylove           # и двата контейнера healthy/Up
docker logs --tail 30 wheelylove-app          # гледка за грешки при старта
# отвън (вашата машина):
curl -sI https://wheelylove.net/ | head -5    # HTTP/2 200 или 307
```
Очаквано крайно съобщение: `DEPLOY OK: wheelylove-app:<време>-<sha>`.

## 4. Миграции: правила

1. Прилагат се ПРЕДИ смяната на приложението, след fresh backup
   (`deploy.sh:127-137`).
2. **Обратно съвместими**: добавяй колони/табели; триенето — чак втори
   release по-късно, през `deploy/deferred-migrations/` (примерът там:
   `deferred-drop_stripe_columns.sql`, с инструкции в самия файл).
3. Провалена миграция: приложението НЕ е сменено; базата може да е
   half-migrated → поправете миграцията и пуснете пак; в краен случай
   възстановете `pre-deploy-*.dump` (§6).
4. Нова колона: (а) промени `src/db/schema.ts`; (б) `npm run db:generate`
   (създава `drizzle/00NN_*.sql` + обновява журнала); (в) commit-ни И двете
   (deploy.sh отказва release без `drizzle/`); (г) тестът
   `migrations.test.ts` пази синхрона.

## 5. Rollback (секунди, само приложението)

```bash
bash /srv/wheelylove/deploy/rollback.sh            # към предишния записан таг
bash /srv/wheelylove/deploy/rollback.sh <tag>      # към конкретен (docker images wheelylove-app)
```
Разменя текущия/предишния таг (втори път връща напред). Health check отново.
**Миграциите НЕ се отменят** — затова правилото в §4.2.

## 6. Rollback срещу възстановяване на базата — РАЗЛИКАТА

| | `rollback.sh` | `pg_restore` от backup |
|---|---|---|
| Какво връща | само приложението (стар образ) | **данните** на момента на архива |
| Продълителност | секунди | минути (спира app) |
| Кога се ползва | лоша версия на кода | зле отишла миграция / счупени данни |
| Данни | не ги пипа | **губи всичко след архива** (вкл. нови резервации!) |

Възстановяване на базата (последна мярка, ПРЕЗАПИСВА):
```bash
docker stop wheelylove-app
docker exec -i wheelylove-db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --no-acl' < /srv/wheelylove/backups/<файл>.dump
docker start wheelylove-app
```
Възстановяване на uploads: вж. [10 §5](10-faylove-i-arhivi.md).

## 7. Продукционни CLI задачи (set-admin / set-instructor / демо)

```bash
# през SSH тунел от работната станция (шаблон .env.admin.example):
ssh -N -L 15432:127.0.0.1:5432 root@164.138.216.72     # отделен терминал
npm run set-admin -- <имейл>                            # чете .env.admin
npm run set-instructor -- <имейл> <slug>

# ИЛИ директно на VPS, в migrate образа (deploy/README.md:175-190):
source /srv/wheelylove/deploy/scripts/lib.sh
compose --profile tools run --rm migrate node_modules/.bin/tsx scripts/set-instructor.ts <имейл> <slug>
```
И двата скрипта изискват потвърден имейл; след смяната сесиите на акаунта се
изтриват и паролата се обезсилва (вж. [06 §3](06-auth-i-sigurnost.md)).

## 8. Първи път на нов сървър

`install.sh` (идемпотентен) прави: loop диск, папки, `.env` (с генерирани
секрети), firewall unit, nginx vhost (с `nginx -t` преди reload), таймери и
cron. `deploy.sh` НЕ прави тези — затова първият ред е ЗАДЪЛЖИТЕЛНО
`install.sh` преди първия `deploy.sh` (`deploy/README.md:137-142`).
Пълното описание стъпка по стъпка: `deploy/README.md` §5-§6.

## 9. Споделения VPS — НЕ пипайте

На същата машина работят QHub (localhost:4000), OpenVPN (tun0), netdata,
друг Postgres и др. Забранено е: `docker system prune`, спиране на чужди
контейнери, рестарт на docker daemon, `apt upgrade` на ловко. WheelyLove
ползва собствени мрежи/вериги/папки — всичко с префикс `wl`/`wheelylove`.
Изолирането е описано в `deploy/README.md:76-94` и `deploy/firewall/`.

## 10. Кога не се пуска deploy

- Червени тестове/typecheck (момента е точно такъв с чакащата работа —
  вж. [13 §5](13-testove-i-proverki.md)).
- `MemAvailable` под 2800 MB на VPS (deploy.sh сам отказва, `deploy.sh:54-56`).
- По време на активен клас пик — прекъсването е 5-20 s, но по-добре в тих час.
- Докато друг deploy върви (flock-ът в deploy.sh пази, `:36-37`).
