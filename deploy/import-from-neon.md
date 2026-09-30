# Пренасяне на данните от Neon към новата база (Postgres 17 в контейнера)

Neon НЕ се пипа и НЕ се трие по време на процедурата - то е вашата резервна точка за връщане.
Всичко се пуска на VPS като root. Пароли не се пишат в командния ред (само имена на променливи).

## Защо "първо схема от миграциите, после само данни"

Досега схемата в Neon е правена с `db:push`, а не с миграции. Ако възстановите пълен дъмп (схема + данни)
и после пуснете `migrate`, drizzle ще се опита да създаде таблици, които вече съществуват, и ще гръмне с
"already exists". Затова препоръчителният ред е:

1. празна база -> `migrate` създава схемата (от `./drizzle`);
2. после само ДАННИ от Neon (`--data-only`).

(Ако все пак искате пълен дъмп - схема + данни - таблицата с миграциите няма да съдържа записи и `migrate`
ще гръмне. Не го правете; ако вече сте го направили: изтрийте базата - стъпка "Връщане" по-долу - и почнете отначало.)

## Подготовка

- Стекът е инсталиран (`install.sh`) и има поне един успешен `deploy.sh` (значи схемата вече е създадена от
  `migrate`, а контейнерите `wheelylove-db` и `wheelylove-app` работят).
- Вземете от Neon НЕПУЛИРАНАТА ("direct", без `-pooler` в хоста) връзка. Запазете я само в променлива на текущата
  сесия (не във файл):

```bash
read -rs NEON_URL      # поставете връзката и натиснете Enter (не се показва); пример: postgres://user:pass@ep-xxx.neon.tech/db?sslmode=require
export NEON_URL
```

## 1. Репетиция (сайтът още сочи към Neon - нищо не се чупи)

```bash
TS=$(date -u +%Y%m%dT%H%M%SZ)
# pg_dump от образа postgres:17 (версията му трябва да е >= версията на Neon). NEON_URL се предава по име, не по стойност.
docker run --rm -e NEON_URL postgres:17-alpine \
  sh -c 'pg_dump "$NEON_URL" --data-only --no-owner --no-acl --format=custom' \
  > /srv/wheelylove/backups/neon-$TS.dump
ls -lh /srv/wheelylove/backups/neon-$TS.dump          # очаквано: ненулев размер (обикновено малък, KB-MB)
chmod 600 /srv/wheelylove/backups/neon-$TS.dump
```

Възстановяване в контейнера (потребителят от контейнера е суперпотребител, затова `--disable-triggers` работи и
външните ключове не пречат на реда):

```bash
docker exec -i wheelylove-db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --data-only --disable-triggers --no-owner --no-acl --exit-on-error' \
  < /srv/wheelylove/backups/neon-$TS.dump
echo "exit code: $?"                                   # очаквано: 0
```

Ако в новата база вече има данни от предишна репетиция, най-чисто е да я създадете наново (рецептата е в
секция "Връщане" долу: DROP/CREATE DATABASE + `migrate`), преди да възстановявате отново.

## 2. Проверка

Броят редове по таблици трябва да съвпада със Neon:

```bash
Q="SELECT relname, n_live_tup FROM pg_stat_user_tables ORDER BY relname;"   # приблизително; за точно: SELECT count(*) FROM <таблица>
echo "--- Neon";  docker run --rm -e NEON_URL postgres:17-alpine sh -c 'psql "$NEON_URL" -At -c "SELECT count(*) FROM bookings" -c "SELECT count(*) FROM class_sessions" -c "SELECT count(*) FROM sports"'
echo "--- Нова"; docker exec wheelylove-db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -c "SELECT count(*) FROM bookings" -c "SELECT count(*) FROM class_sessions" -c "SELECT count(*) FROM sports"'
```

(Заменете имената на таблиците с реалните от `src/db/schema.ts`, ако се различават.) Проверете и че
последователностите (sequences) са продължили от правилната стойност - дъмпът ги пренася; тест: направете
пробна резервация на новия сайт и вижте, че няма грешка "duplicate key".

## 3. Окончателно прехвърляне (кратък прозорец без записи)

1. Кажете на студиото да не правят резервации ~10 минути (или поставете Neon в режим само за четене).
2. Повторете стъпка 1 (нов дъмп -> изпразване -> възстановяване) и стъпка 2 (проверка).
3. Превключете: Cloudflare DNS на домейна към `164.138.216.72` (proxied), обновете
   `NEXT_PUBLIC_APP_URL` в `/srv/wheelylove/.env` -> нов `deploy.sh` (адресът е в билда).
4. Обновете външните услуги: Stripe webhook към `https://<адрес>/api/webhooks/stripe` (нов `STRIPE_WEBHOOK_SECRET`
   в `.env`), Clerk (разрешени домейни/production instance за новия адрес).
5. Пробна резервация + плащане + имейл/SMS. Следете: `docker logs -f wheelylove-app`.

## Връщане (rollback)

- До стъпка 3.3 нищо не е променено за живите потребители: Neon е непроменен и сайтът още работи от него.
- След превключването: върнете DNS към стария хост/Vercel. Neon пази старите данни; резервациите, направени след
  превключването, са само в новата база (вземете ги с нов `pg_dump` от `wheelylove-db`, ако трябва да се върнат).
- Празна нова база (за ново начало), ако репетицията е объркана:

```bash
docker exec wheelylove-db sh -c 'psql -U "$POSTGRES_USER" -d postgres -c "DROP DATABASE \"$POSTGRES_DB\" WITH (FORCE)" -c "CREATE DATABASE \"$POSTGRES_DB\""'
# после схемата се създава наново от миграциите:
APP_TAG=$(grep ^APP_TAG= /srv/wheelylove/state/tag.env | cut -d= -f2) \
  docker compose -p wheelylove -f /srv/wheelylove/current/deploy/docker-compose.yml \
  --env-file /srv/wheelylove/.env --env-file /srv/wheelylove/state/tag.env run --rm migrate
```

## След успешно прехвърляне

- Пазете Neon ~14 дни, после го изключете; изтрийте `NEON_URL` от сесията (`unset NEON_URL`) и дъмпа
  `neon-*.dump` когато вече не ви трябва (съдържа лични данни на клиенти).
- Ротацията на архивите (14 дни) трие и `neon-*.dump` - ако го искате по-дълго, преместете го извън `backups/`.
