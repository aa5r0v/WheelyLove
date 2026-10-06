# 10. Файлове: качвания, съхранение, архиви

## 1. Какво е внимателно тук

Снимките и видеата на галерията (и бъдещите снимки на инструкторите) НЕ са в
базата и НЕ са в облак (R2 беше премахнат — наблюдавано от координатора,
2026-10-06: възстановените 5 оригинални снимки са файлове `UUID.webp` в
uploads, без зависимост от R2). Те са файлове на диска на VPS-а.

## 2. Животът на един файл (`src/lib/storage.ts`)

1. Качване само от админ (server action `uploadGalleryItem` + nginx
   предпроверка за 55 MB само на `/admin/gallery`).
2. Съдържанието се прочита в паметта и типът се разпознава по **magic bytes**
   (JPEG/PNG/WebP/MP4 — `:28-50`); клиентският MIME не се вярва.
3. Лимити: **снимки 8 MB, видео 50 MB** (`:8-9`).
4. Име: `<randomUUID>.<ext>` — неугадимо, без изпълними разширения.
5. Запис: атомично (temp файл + `rename` в същата папка, `:66-85`).
6. Публичен URL: `/uploads/<uuid>.<ext>` → nginx го раздава директно от
   диска (`deploy/nginx/wheelylove.conf:101-117`): само 4-те разширения,
   без autoindex, `Content-Security-Policy: default-src 'none'; sandbox`,
   дълъг cache.
7. Изтриване: през админа; изтрива се реда в базата И файлът; пътят се
   разрешава само ако е вътре в `UPLOAD_DIR` с валидно UUID име
   (`resolveUploadPath`, `:101-109`) — не може да се подаде произволен път.

Продукционни пътища: в контейнера `/data/uploads` (env `UPLOAD_DIR`), на
хоста `/srv/wheelylove/uploads` (bind mount, собственик uid 10001 —
`deploy/docker-compose.yml:37-47`). **Disk-ът е ограничен (6 GB loop)** —
следете `df -h /srv/wheelylove` (`deploy/README.md:261`).

## 3. Нощен архив (backups)

`deploy/scripts/backup.sh` + cron реда `deploy/cron/wheelylove-backup`
(всеки ден 02:17 server time):

1. `pg_dump` (custom формат) на базата;
2. `tar.gz` на `/srv/wheelylove/uploads`;
3. и двата в `/srv/wheelylove/backups/` с UTC времеви печат;
4. ротация: по-стари от **14 дни** се трият, но САМО след успешен нов архив
   (dumpt-ът и tar-ът трябва да са непразни — `backup.sh:31-43`).

`deploy.sh` прави същите архиви с префикс `pre-deploy-` **преди всяка
миграция** (`deploy/deploy.sh:127-130`) — това е последната вица точка при
зле отишла миграция.

Ръчен архив на VPS:
```bash
bash /srv/wheelylove/deploy/scripts/backup.sh && ls -lh /srv/wheelylove/backups | tail -4
```

## 4. Архивите са НА СЪЩИЯ диск — задължително копие навън

Loop дискът (6 GB) държи данни + uploads + архиви. При загуба на машината се
губи всичко. `deploy/README.md:262-263` изрично изисква външно копие
(напр. `rclone`/`rsync` към друго хранилище) — **не е включено в пакета**;
вж. чеклиста в [18-checklisti.md](18-checklisti.md).

## 5. Възстановяване

- **База** (ПРЕЗАПИСВА данните — само при решение „връщаме всичко“):
  ```bash
  docker stop wheelylove-app
  docker exec -i wheelylove-db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --no-acl' < /srv/wheelylove/backups/<файл>.dump
  docker start wheelylove-app
  ```
  (от `deploy/README.md:255-260`).
- **Качвания**:
  ```bash
  tar -xzf /srv/wheelylove/backups/<файл>-uploads.tar.gz -C /srv/wheelylove
  ```
- Разликата спрямо rollback на приложението (който НЕ пипа данните) — вж.
  [14-deploy-i-release.md](14-deploy-i-release.md) §6.

## 6. Проверка на архива (редовно!)

```bash
ls -lh /srv/wheelylove/backups | tail -6          # има ли ФРЕШЕН dump (днес) и tar
docker exec wheelylove-db sh -c 'pg_restore --list /dev/stdin' < /srv/wheelylove/backups/<файл>.dump | head
```

- Файлите са mode 600 (root) — четат се само с root.
- Ако нощният липсва: търси грешката в syslog (`logger -t wheelylove-backup`)
  и пусни ръчния архив (горе).
- Инциденти с uploads — вж. [15-incidenti.md](15-incidenti.md) §4.
