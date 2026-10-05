# Пренасяне на данните от Neon към новата база (Postgres 17 в контейнера) — ПО ИЗБОР

Неонската база НЕ се пипа и НЕ се трие по време на процедурата - тя е вашата резервна точка за връщане.
Всичко се пуска на VPS като root. Пароли не се пишат в командния ред (само имена на променливи).

**Какво се пренася: САМО `sports`, `instructors`, `class_sessions`, `gallery_items`.**

Защо не всичко:
- `bookings` и `waitlist_entries` са вързани за потребителски id-та от Clerk. В новия сайт входът е
  собствен (Better Auth, в нашия Postgres) - старите id-та не съществуват там, а старите резервации са
  минали/исторически. Клиентите ще си направят нови регистрации при нужда.
- Потребителите (имейли/пароли) живееха в Clerk и не могат да се пренесат автоматично.

Старите снимки в `gallery_items.url` / `instructors.photo_url` сочат към R2. След импорта пуснете
`deploy/migrate-r2-to-local.md`, за да ги свали на локалния диск и да препишe URL-ите.

## Защо "първо схема от миграциите, после само данни"

Досега схемата в Neon е правена с `db:push`, а не с миграции. Ако възстановите пълен дъмп (схема + данни)
и после пуснете `migrate`, drizzle ще се опита да създаде таблици, които вече съществуват, и ще гръмне с
"already exists". Затова препоръчителният ред е:

1. празна база -> `migrate` създава схемата (от `./drizzle`);
2. после само ДАННИ от Neon (`--data-only`) за четирите таблици.

## 1. Репетиция (сайтът още не е обявен - нищо не се чупи)

Вземете от Neon НЕПУЛИРАНАТА ("direct", без `-pooler` в хоста) връзка. Запазете я само в променлива на
текущата сесия (не във файл):

```bash
read -rs NEON_URL      # поставете връзката и натиснете Enter (не се показва)
export NEON_URL
```

```bash
TS=$(date -u +%Y%m%dT%H%M%SZ)
# Само четирите таблици, само данни. NEON_URL се предава по име, не по стойност.
docker run --rm -e NEON_URL postgres:17-alpine \
  sh -c 'pg_dump "$NEON_URL" --data-only --no-owner --no-acl --format=custom \
         -t sports -t instructors -t class_sessions -t gallery_items' \
  > /srv/wheelylove/backups/neon-$TS.dump
ls -lh /srv/wheelylove/backups/neon-$TS.dump          # очаквано: ненулев размер (обикновено малък, KB-MB)
chmod 600 /srv/wheelylove/backups/neon-$TS.dump
```

Възстановяване в контейнера (потребителят от контейнера е суперпотребител, затова `--disable-triggers` работи):

```bash
docker exec -i wheelylove-db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --data-only --disable-triggers --no-owner --no-acl --exit-on-error' \
  < /srv/wheelylove/backups/neon-$TS.dump
echo "exit code: $?"                                   # очаквано: 0
```

## 2. Проверка

Броят редове по четирите таблици трябва да съвпада със Neon:

```bash
echo "--- Neon";  docker run --rm -e NEON_URL postgres:17-alpine sh -c 'psql "$NEON_URL" -At -c "SELECT count(*) FROM sports" -c "SELECT count(*) FROM instructors" -c "SELECT count(*) FROM class_sessions" -c "SELECT count(*) FROM gallery_items"'
echo "--- Нова"; docker exec wheelylove-db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -c "SELECT count(*) FROM sports" -c "SELECT count(*) FROM instructors" -c "SELECT count(*) FROM class_sessions" -c "SELECT count(*) FROM gallery_items"'
```

Тествайте и че последователностите (sequences) са продължили от правилната стойност: направете пробен час
в админа и вижте, че няма грешка "duplicate key". Ако все пак има: `SELECT setval(pg_get_serial_sequence('sports','id'), (SELECT max(id) FROM sports));` (аналогично за останалите таблици).

## 3. Окончателно прехвърляне

1. Кажете на студиото да не правят промени ~10 минути (или поставете Neon в режим само за четене).
2. Повторете стъпка 1 (нов дъмп -> изпразване -> възстановяване) и стъпка 2 (проверка). Ако в новата база
   вече има данни от репетиция, най-чисто е да я създадете наново (рецептата е в секция "Връщане" долу).
3. Пуснете миграцията на снимките: `deploy/migrate-r2-to-local.md` (сваля R2 обектите на диска).
4. Пробна резервация + имейл. Следете: `docker logs -f wheelylove-app`.

## Връщане (rollback)

- Neon е непроменен по време на цялата процедура - старите данни винаги са там.
- Празна нова база (за ново начало), ако репетицията е объркана:

```bash
docker exec wheelylove-db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "TRUNCATE sports, instructors, class_sessions, gallery_items RESTART IDENTITY CASCADE"'
# или напълно нова схема:
docker exec wheelylove-db sh -c 'psql -U "$POSTGRES_USER" -d postgres -c "DROP DATABASE \"$POSTGRES_DB\" WITH (FORCE)" -c "CREATE DATABASE \"$POSTGRES_DB\""'
APP_TAG=$(grep ^APP_TAG= /srv/wheelylove/state/tag.env | cut -d= -f2) \
  docker compose -p wheelylove -f /srv/wheelylove/current/deploy/docker-compose.yml \
  --env-file /srv/wheelylove/.env --env-file /srv/wheelylove/state/tag.env run --rm migrate
```

## След успешно прехвърляне

- Пазете Neon ~14 дни, после го изключете; изтрийте `NEON_URL` от сесията (`unset NEON_URL`) и дъмпа
  `neon-*.dump` когато вече не ви трябва (съдържа лични данни на клиенти).
- Ротацията на архивите (14 дни) трие и `neon-*.dump` - ако го искате по-дълго, преместете го извън `backups/`.
