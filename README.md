# Каскад

Сервис для кода и аналитики с проверяемым результатом:

**Gemini исполняет → автопроверки в sandbox → независимый Gemini review → финальное ревью Kimi → отдельная ветка и Pull Request.**

Автоматического merge нет. Исполнитель не получает произвольный shell: только чтение, запись, удаление и список файлов внутри рабочей директории. Проверки запускает отдельная система без API-ключей.

## GitHub Pages

Preview: **https://kopasofns-max.github.io/cascade-agent/**

Pages содержит только интерфейс. Без подключения backend там отключены polling и создание задач — никаких имитаций запуска моделей. Нажми **«Подключить API»** и укажи отдельно развёрнутый сервер. URL и необязательный токен доступа сохраняются только в `sessionStorage` текущей вкладки.

Деплой Pages выполняется из `.github/workflows/pages.yml`: type-check → tests → static build → Pages artifact. Для первого запуска в настройках репозитория **Settings → Pages → Source** должен быть выбран **GitHub Actions**.

## Что реализовано

- задачи для кода и аналитики, критерии приёмки и до трёх попыток;
- динамический каталог доступных Gemini/Kimi моделей без захардкоженных ID;
- отдельные роли executor / reviewer / final;
- структурированные вердикты `approve`, `rework`, `ask_user`, `reject`;
- история этапов, diff, логи проверок, токены и verdicts;
- изолированные проверки через Docker или Bubblewrap;
- установка Node-зависимостей без lifecycle scripts; сеть нужна только на установке;
- защита workspace от path traversal и выхода по symlink;
- создание ветки `cascade/task-{id}` и Pull Request через GitHub API;
- PWA, адаптивный интерфейс, статический Pages preview;
- опциональные `CASCADE_API_TOKEN` и allowlist `CORS_ORIGINS` для отдельного API.

## Запуск полного backend

Требования: **Node.js 22+, MySQL 8+, Git**. Для изоляции проверок — Docker (рекомендуется) или Linux + Bubblewrap.

```bash
npm ci
cp .env.example .env
# Заполни .env локально. Не отправляй его в GitHub и не вставляй ключи в Issues/чаты.
npm run db:push
npm run dev
```

Открой `http://localhost:3000`.

Production:

```bash
npm ci
npm run check
npm test
npm run build
npm start
```

Сервер слушает `PORT` или 3000 и отдаёт API вместе с production frontend. Для боевого развёртывания нужен VPS/хост с Docker и внешняя MySQL. Обычный static hosting для backend не подходит.

### Обязательные серверные настройки

| Переменная | Назначение |
|---|---|
| `DATABASE_URL` | MySQL для задач, этапов и ревью |
| `GEMINI_API_KEY` | Исполнитель и Gemini reviewer |
| `KIMI_API_KEY` | Финальный контролёр через OpenAI-compatible Kimi API |
| `GITHUB_TOKEN` | Push рабочей ветки и создание PR |
| `APP_ID`, `APP_SECRET` | Настройки application shell в production |

Встроенный Kimi gateway поддерживается только там, где платформа сама выдаёт `KIMI_AGENTGW_API_KEY` и `KIMI_AGENTGW_BASE_URL`. Для самостоятельного запуска используй `KIMI_API_KEY`.

Модели подтягиваются через `/models`. При необходимости роли можно закрепить через `EXECUTOR_MODEL`, `REVIEWER_MODEL`, `FINAL_MODEL`, например значением вида `gemini:model-id` или `kimi:model-id`.

## Отдельный backend для Pages

1. Разверни полный backend по инструкции выше.
2. Задай длинный случайный `CASCADE_API_TOKEN`.
3. В `CORS_ORIGINS` укажи точный origin Pages без пути:

```env
CASCADE_API_TOKEN=replace-with-a-long-random-string
CORS_ORIGINS=https://kopasofns-max.github.io
```

4. В Pages открой **«Подключить API»**, введи URL сервера и тот же токен доступа.

Токен API — не ключ Gemini или GitHub. Он только ограничивает доступ к задачам. Не публикуй backend без токена: любой посетитель иначе сможет создавать задачи и расходовать квоты владельца.

## Sandbox

По умолчанию `SANDBOX_NETWORK=false`. Для Node-проектов перед первой проверкой выполняется `npm ci --ignore-scripts --no-audit --no-fund` (или `npm install`, если нет lockfile) с сетью только на этот шаг. Тесты и build затем запускаются без сети. Установку можно отключить через `SANDBOX_INSTALL=false`.

Docker запускается с `cap-drop=ALL`, `no-new-privileges`, read-only root и лимитами CPU/RAM/PIDs. Bubblewrap очищает окружение и монтирует только workspace и системные read-only каталоги. Незнакомый код нельзя запускать вне такого контура.

## Проверки

```bash
npm run check       # TypeScript
npm test            # unit-тесты Git URL, redaction, sandbox detection, workspace guards
npm run build       # frontend + PWA + dist/boot.js
```

Unit-тесты не выдаются за E2E с моделями. Реальный запуск Gemini → Kimi → GitHub PR требует серверные ключи и отдельную проверку на тестовом репозитории. Merge всегда выполняет человек.
