# 12. Локална среда (Windows): setup, изолирани тестови бази, run-slot

## 1. Еднократна подготовка (Windows 10/11, Git Bash)

```powershell
# PowerShell — инструменти (проверка какво вече има):
node --version        # очаквано v22.x
npm --version
git --version
run-slot --version    # координационният инструмент (глобален npm пакет)
```

```bash
# Git Bash — репото и зависимостите:
cd /d/dev/Wheelylove
npm ci                # точните версии от package-lock.json
```

`.env.local` в корена (не се комитва; не го четете/показвайте):
```
DATABASE_URL=postgres://postgres@127.0.0.1:5440/wheelylove_bookings_test
BETTER_AUTH_SECRET=<произволен низ само за локални тестове>
BETTER_AUTH_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000
```
(Форматът на URL зависи от локалния Postgres — при trust без парола е горе;
при парола добавете `postgres:<ПАРОЛА>@`.)

## 2. Изолираните тестови бази (ЗАДЪЛЖИТЕЛНО)

На машината има локален Postgres на **порт 5440** (временно вдигнат за
паралелната работа на няколко агента; потребител `postgres`, trust) с базите:

| База | Предназначение (наблюдавано 2026-10-06) |
|---|---|
| `wheelylove_test` | браузърните QA тестове на друг агент |
| `wheelylove_codex_test` | unit тестовете на друг агент |
| `wheelylove_bookings_test` | **ползвайте тази** за вашите тестове |

⚠️ **Порт 5432 е СПОДЕЛЕН postgres — не го пипайте** (нито команди, нито
`.env.local` към него). Ако `.env.local` сочи към 5432, върнете го към
`127.0.0.1:5440/wheelylove_bookings_test` преди тестове.

Създаване на нова изолирана база (ако липсва):
```bash
psql -h 127.0.0.1 -p 5440 -U postgres -c "CREATE DATABASE wheelylove_bookings_test;"
npm run db:migrate && npm run db:seed
```
Пазачът `src/lib/test-db-guard.ts` спира тестовете, ако името на базата в
`DATABASE_URL` не свършва на `_test` — това е последната бариера срещу
„тестове върху продукция“ (включително през SSH тунел, който също изглежда
като localhost — коментарът в самия файл).

## 3. Дневна работа

```bash
# разработка
npm run dev                        # http://localhost:3000

# проверка (преди всеки commit / release)
npx tsc --noEmit                   # типове
npm run lint                       # eslint
npm test                           # всички тестове (виж 13)

# миграции/схема
npm run db:generate                # нова миграция от schema.ts
npm run db:migrate                 # прилагане
```

## 4. run-slot: защо и как

На тази Windows машина вървят понякога няколко процеса/агенти наведнъж.
`run-slot` (глобален npm инструмент, `C:\Users\antho\AppData\Roaming\npm\run-slot`)
разделя „слотове“ за тежки команди (RAM прагове, максимум едновременно):

```bash
run-slot --status                  # кой държи кой слот, свободна RAM
run-slot -- npm run dev            # dev server в свободен слот
run-slot -- npm test               # тестовете в слот
```

- Прагове: `RUN_SLOT_MAX=3`, `RUN_SLOT_MIN_FREE_MB=4096` (наблюдавани
  стойности на 2026-10-06); командата изчаква слот, ако RAM е под прага.
- В PowerShell винаги пишете `run-slot -- <команда>` (PowerShell поглъща
  първия `--` при ps1 — помощта на самия инструмент го обяснява).
- Това е инструмент на РАБОТНАТА станция — на Linux/VPS го няма и не е нужен.

## 5. Windows срещу Linux — таблица за превод

| Действие | Windows (Git Bash / PowerShell) | Linux (VPS) |
|---|---|---|
| Run server | `npm run dev` / `run-slot -- npm run dev` | не се прави на VPS (там е Docker) |
| Тестове | `npm test` (чрез `run-slot` при натоварване) | не се изпълняват на VPS |
| Архив | — (само на VPS) | `bash /srv/wheelylove/deploy/scripts/backup.sh` |
| Deploy | `git archive` + `scp` (от вашия компютър) | `bash /srv/wheelylove/deploy/deploy.sh /tmp/<файл>.tar.gz` |
| Пътени сепаратори | `\` (в PowerShell), `/` (в Git Bash) | `/` |
| Променлива в команда | `$env:NAME="v"` (PS) / `NAME=v cmd` (bash) | `NAME=v cmd` |
| Проверка на порт | `netstat -ano \| findstr :3000` | `ss -ltnp \| grep 3000` |
| Процес по PID | `tasklist /FI "PID eq <pid>"` | `ps -p <pid>` |

Git Bash преписва Windows пътища: `/d/dev/Wheelylove` = `D:\dev\Wheelylove`.

## 6. Внимавайте при паралелна работа (няколко агента/процеса)

- Един dev server на порт; втори — с `-- --port 3100` (пример:
  `.codex-preview.ps1` така прави preview на 3100).
- **`npm run build` в главното дърво** през писък: build-ът реконструира
  `.next/`, което чупи вървящия `next dev`. Правете build в копие на дървото
  (без `node_modules`+`.next`), или спрете dev-а първо (вж. [13 §5](13-testove-i-proverki.md)).
- Не редактирайте `.env.local`, докато друг процес го ползва — сменяйте
  само когато нищо не върви.
- Други агенти оставят работни файлове в корена (`.codex-*`, `.glm-*`) — не
  ги трийте, не ги комитвайте.
