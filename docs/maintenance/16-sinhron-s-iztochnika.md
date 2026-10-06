# 16. Синхрон на кода: GitHub, локални комити, release архиви

## 1. Кой откъде идва (снимка 2026-10-06, от координатора)

- **GitHub**: публичното репо `adelina-design/Wheelylove` (main). Локалният branch `review/adelina-wheelylove` се подготвя за push и преглед от Аделина. **Не допускайте, че origin е актуалният източник** —
  работното копие `D:\dev\Wheelylove` (клон `review/adelina-wheelylove`) е
  „снимката на истината“, плюс пуснатите release-и на VPS.
- Продукцията получава код САМО чрез `git archive HEAD` архиви (вж. [14](14-deploy-i-release.md))
  — никакъв pull на VPS.
- На VPS: `current` symlink-ва към `releases/<последен-ид>`; в
  `state/tag.env` е текущият таг (ден-време + SHA). Така може да се провери
  какво Е на живо дори при изостанал origin.

## 2. Проверка „какво всъщност върви“ (на VPS, read-only)

```bash
cat /srv/wheelylove/state/tag.env                    # APP_TAG=20261006-153700-b2125f3
readlink /srv/wheelylove/current                     # releases/<същият ид>
ls -1t /srv/wheelylove/releases/ | head              # историята на releases
docker images wheelylove-app                         # образите (current + prev се пазят)
```
Идът завършва с първите 7 знака на git SHA → директна връзка с репото.

## 3. Локален git статус (снимка 2026-10-06)

```bash
git -C /d/dev/Wheelylove log --oneline -5
# b2125f3 (последен пуснат) — админ инструктори/резервации
# 5af7837, 1103693, cd61c5c, 019037a
git status --short   # прегледай промените преди commit/push
```
Промените за преглед се качват отделно в branch-а на Аделина; production deploy-ът вече е приключил. Всички
`.glm-*`/`.codex-*` файлове в корева са работни материали на агентите — не
се комитват.

## 4. Как се синхронизират production и GitHub

1. Локално: branch `review/adelina-wheelylove` → commit → проверки (13 §8).
2. `git archive HEAD` → scp → `deploy.sh` (14 §2) пуска отделно одобрения
   код на VPS; release-ите носят своя SHA в името.
3. Качи `review/adelina-wheelylove` в origin и отвори PR към `main` за преглед.
   GitHub branch и production deploy са отделни стъпки.

## 5. Синхрон „на живо“ ↔ „локално“ ↔ „GitHub“ (препоръчителен ритуал)

```bash
# 1) какво е на живо:
ssh <user>@164.138.216.72 'cat /srv/wheelylove/state/tag.env'
# 2) има ли локалния SHA:
git -C /d/dev/Wheelylove log --oneline -3
# 3) разлика с origin:
git fetch origin && git log --oneline origin/main..HEAD   # напред от origin
git log --oneline HEAD..origin/main                       # зад origin (чужди промени!)
```
Ако origin е НАПРЕД локално (друг е комитвал) — НЕ правете deploy от
локалното HEAD; първо rebase/merge и пълни локални проверки.

## 6. Аварии в синхронизацията

| Симптом | Действие |
|---|---|
| push 403 | не насилвайте; правете release от `git archive` (работещият път); уведомете собственика на репото |
| deploy спря на „release is missing …“ | архивът не съдържаDockerfile/package-lock/drizzle — правете архива от репо-корена с `git archive HEAD` (не ръчен `tar` на папката) |
| забравен commit → пуснат е архив без последните промени | направете нов commit + нов release; идът на release носи SHA за проверка |
| разминаване на схема/миграции | `npm run db:generate` локално; ако журнала на VPS има чакащи миграции, deploy-ът ги прилага автоматично следващия път |
| тестовете минават локално, но не и на друга машина | най-често env: DATABASE_URL към грешна база / липсващ BETTER_AUTH_URL (13 §5) |

## 7. Кои файлове КУДЕ живеят (за да не се губят)

- Код: git (локално + origin + release архивите на VPS).
- Секрети: само в env файловете (никога в git) — [11](11-env-promenlivi.md).
- Данни: само на VPS (pgdata + uploads) + архивите — [10](10-faylove-i-arhivi.md).
- Състояние на деплой: `/srv/wheelylove/state/*.env` и `releases/`.
- Документация: `docs/maintenance/` (в git, заедно с кода).
