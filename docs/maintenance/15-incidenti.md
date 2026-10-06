# 15. Инциденти: runbooks

Обща първа помощ (винаги): запишете часа и какво сте забелязали; направете
snapshot на логовете (`docker logs --tail 200 wheelylove-app > /root/logs-$(date +%s).txt`);
не правете едновременно две промени. Всички команди тук са за VPS (root),
освен ако не пише друго.

## 1. Сайтът дава 502 / не отваря

1. Кой чупи ли какво:
   ```bash
   docker ps --filter name=wheelylove                 # app съществува ли и е healthy?
   docker inspect --format '{{.State.Health.Status}}' wheelylove-app
   curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:5610/   # директно приложението
   curl -sI https://wheelylove.net/ | head -5                        # през Cloudflare/nginx
   ```
2. **Приложението не отговаря на 5610**: `docker logs --tail 60
   wheelylove-app`. Още стартира (restart = ]healthy след ~40 s)? Изчакайте
   2 мин. Пак ли не: `bash /srv/wheelylove/deploy/rollback.sh` (връща
   предишния образ за секунди; миграциите остават — затова са обратно
   съвместими).
3. **5610 отговаря, сайта не**: nginx/Cloudflare. Проверете
   `tail -20 /var/log/nginx/wheelylove.error.log` и дали сертификатите
   съществуват (`ls -l /etc/ssl/cloudflare/`). Пипнете ли nginx конфиг —
   винаги `nginx -t` ПРЕДИ reload (иначе блокирате reload за всички сайтове
   на машината!).
4. **Cloudflare пада**: сайтът е недостъпен отвън, но локално на VPS всичко е
   живо — изчакайте Cloudflare статус страницата; нищо не рестартирайте.
5. deploy в момента? 5-20 s 502 е нормалното прекъсване (`deploy.sh:13`).

## 2. Писма не излизат / клиент не получил писмо

1. Търсете маркерите в лога на приложението:
   ```bash
   docker logs --since 24h wheelylove-app 2>&1 | grep '\[email:FAILED\]'
   bash /srv/wheelylove/deploy/scripts/check-email-failures.sh 24h; echo "exit=$?"
   ```
2. Има `[email:FAILED] … type=…` → SMTP relay/Gmail проблем:
   - Проверете изходящата връзка: `docker exec wheelylove-app wget -qO- --timeout=5 https://1.1.1.1 >/dev/null; echo $?` (0 = изходящата мрежа е ОК);
   - Google Admin → SMTP relay: позволен ли е само IP `164.138.216.72`,
     „Only addresses in my domains“ (подателят трябва да е `@purepoint.bg`);
   - Проверете DNS/TF10 промени по домейна.
3. НЯМА маркери → писмото не е се генерирало: правилно ли е минала
   резервацията (вижте в базата — ВНИМАТЕЛНО, само SELECT през
   `docker exec -it wheelylove-db psql -U wheelylove wheelylove -c 'SELECT …'`);
   напомнянията: `journalctl -u wheelylove-reminders -n 30 --no-pager`
   (очаквано `{"sent":N}`).
4. Рекунструкция: resend на потвърждение — потребителят сам от
   „Моите резервации“; напомняне не се праща ръчно (маркирано като изпратено
   при опит) — чака следващия прозорец.
5. Повтарящи се провали: сменете пътя — махнете `SMTP_HOST` (Resend) или
   обратно, после `docker compose up -d --force-recreate app` (през
   wrapper-а `compose` от `lib.sh`).

## 3. База данни: подозрение за повреда/зле отишла миграция

1. Симптоми: deploy-ът спря на стъпка миграция; приложеният лог вика DB
   errors; сайта дава 500 на всички страници с данни.
2. Състояние: `docker ps` (db healthy?); `docker logs --tail 50 wheelylove-db`.
3. Зле отишла МИГРАЦИЯ (данните са на Risk): спре приложението и
   възстановете `pre-deploy-*.dump` от момента на deploy-а (последна мярка —
   вж. [14 §6](14-deploy-i-release.md) за командите и какво се губи).
4. Повреда на диска: `df -h /srv/wheelylove`; loop дискът не е монтиран →
   `mount /srv/wheelylove` (иначе ЖИВОТНО важното правило на compose:
   `create_host_path:false` спира услугата вместо да пише на главния диск —
   `deploy/docker-compose.yml:41-47`).
5. Никога не трийте от pgdata на ръка; не рестартирайте docker daemon
   (споделен с чужди услуги).

## 4. Качвания: снимки/видео липсват или не се качват

1. Не се качват: над лимита ли са (снимка 8 MB / видео 50 MB)? Грешка от
   nginx (413/429)? — `tail -20 /var/log/nginx/wheelylove.error.log`.
   Големият лимит важи САМО за `/admin/gallery` (админ сесията трябва да е
   валидна — изтече ли, upload-ът отказва).
2. Липсват (404): `ls -lh /srv/wheelylove/uploads | tail` — файлът там ли е?
   Правилно ли е името в базата (`gallery_items.url` = `/uploads/<uuid>.<ext>`)?
3. Възстановяване на файл от архив: вж. [10 §5](10-faylove-i-arhivi.md).
4. Дискът пълен (loop 6 GB): по-стари архиви? По-стари releases
   (`/srv/wheelylove/releases`)? Големи видеа? — изчистете с rm на СВОИ
   папки само (`deploy.sh:173-183` трие автоматично при deploy).

## 5. „Всички часове изчезнаха“ / разписанието е празно

1. Проверете дали контейнерът на приложението е стар: sys-статус в
   `/admin` → часовете в `/admin/sessions` — в базата ли са?
2. Системната дата на VPS (`date`) — часовете са future-gated (миналият
   ден изчезва от прозореца от 14 дни).
3. Миграция „изяла“ данни? → §3 + restore.
4. Само за един инструктор: архивиран ли е — часовете му остават,
   но нови не се генерират (вж. [07 §6](07-raspisanie-i-vreme.md)).

## 6. Капацитет: „заети повече места от капацитета“

Това е бъг-симптом (инвариантът в [04 §2](04-baza-dannih.md) е нарушен —
напр. ръчна промяна по базата). Диагностика в тестова база:
```sql
SELECT s.id, s.capacity, s.booked_count,
  (SELECT count(*) FROM bookings b WHERE b.session_id = s.id
     AND b.status IN ('pending','confirmed')) AS real_active
FROM class_sessions s
WHERE s.booked_count <> (SELECT count(*) FROM bookings b
  WHERE b.session_id = s.id AND b.status IN ('pending','confirmed'));
```
За продукция: НЕ поправяйте на живо с UPDATE без анализ; уведомете
разработчика. Възстановяване от архив само при големи щети.

## 7. Компрометирани акаунти / спам

- Подозрение за чужда сесия: всички активни сесии на потребителя се
  прекратяват с password reset (той сам) или с роля-скрипт (set-admin /
  unlink на инструктор — и двата изтриват сесии + парола).
- brute-force: nginx rate limit + Better Auth limiter вече бавят; при вълна —
  Cloudflare WAF/rate правила (извън този пакет).
- `rate_limit` таблицата е на Better Auth — не я трийте ръчно.
