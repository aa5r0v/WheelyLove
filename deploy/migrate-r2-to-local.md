# Миграция на снимките от Cloudflare R2 към локалния диск

Еднократна процедура след `deploy/import-from-neon.md` (или винаги, когато в базата има URL-и, сочещи
към R2). Скриптът `scripts/migrate-r2-to-local.ts`:

- намира всички абсолютни `http(s)://` URL-и в `gallery_items.url` и `instructors.photo_url`;
- сваля всеки файл с обикновен HTTPS GET;
- валидира го точно като интерактивно качване (истински тип по magic bytes, 8 MB за снимки / 50 MB за видео);
- записва го в `UPLOAD_DIR` (атомарно, UUID име) и преписва URL-а в базата на `/uploads/<uuid>.<ext>`.

Идемпотентен е: редове, които вече сочат `/uploads/...`, се пропускат. Пуска се сух (dry-run) по подразбиране.

## Стъпки (на вашия компютър, D:\dev\Wheelylove)

`UPLOAD_DIR` по подразбиране е `/data/uploads` - локално задайте временна папка и после прехвърлете
файловете на сървъра (или пуснете скрипта директно на VPS през SSH тунел към базата - няма значение,
важното е файловете да се окажат в `/srv/wheelylove/uploads` с собственик 10001:10001).

```bash
# 1. Преглед (НИЩО не се записва - нито файлове, нито база):
DATABASE_URL="postgres://wheely:<ПАРОЛА>@127.0.0.1:5432/wheelylove" \
UPLOAD_DIR=/tmp/wl-uploads \
npx tsx scripts/migrate-r2-to-local.ts

# 2. Реално изпълнение (сваля + записва + преписва базата):
DATABASE_URL="postgres://wheely:<ПАРОЛА>@127.0.0.1:5432/wheelylove" \
UPLOAD_DIR=/tmp/wl-uploads \
npx tsx scripts/migrate-r2-to-local.ts --apply

# 3. Качете файловете на сървъра (ако сте ги свалили локално):
scp -i <ключ> /tmp/wl-uploads/* root@164.138.216.72:/srv/wheelylove/uploads/
ssh root@164.138.216.72 'chown 10001:10001 /srv/wheelylove/uploads/* && chmod 644 /srv/wheelylove/uploads/*'
```

R2 bucket-ът трябва да е публично четим (беше - галерията работеше от него). Ако не е: свалете
снимките с `rclone` / `aws s3 sync` в папка и пуснете скрипта с локален мини-HTTP сървър пред тях, или
добавете временен public достъп.

## Проверка

- `npx tsx scripts/migrate-r2-to-local.ts` (пак dry-run) трябва да докладва "0 биха мигрирали";
- галерията и страниците на инструкторите показват снимките (URL-ите вече са `/uploads/...`);
- `ls /srv/wheelylove/uploads | head` показва UUID-имената; nginx ги раздава (виж deploy/README.md, т. 8а).

Скриптът има тестове с mock на `fetch` (`scripts/migrate-r2-to-local.test.ts`) - свалените файлове
минават през същата валидация като качванията от админа.
