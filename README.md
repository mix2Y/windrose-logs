# Windrose Logs

Web-приложение для сбора и анализа логов игры Windrose.
Авторизация через корпоративный Azure AD, загрузка логов через MS Teams или веб-интерфейс.

## Стек

| Слой | Технология |
|---|---|
| Backend | ASP.NET Core 8 Web API |
| Background jobs | Hangfire + PostgreSQL |
| База данных | PostgreSQL 16 |
| Frontend | React 18 + TypeScript + Vite |
| UI | Tailwind CSS + shadcn/ui |
| Auth | Azure AD (MSAL) |
| Контейнеры | Docker + docker-compose |

## Быстрый старт (локально)

### 1. Поднять инфраструктуру

```bash
docker-compose up -d
```

Запустится PostgreSQL на `localhost:5432`.

### 2. Настроить Azure AD

В `src/WindroseLogs.API/appsettings.Development.json` заполнить:
```json
{
  "AzureAd": {
    "TenantId": "YOUR_TENANT_ID",
    "ClientId": "YOUR_CLIENT_ID"
  }
}
```

### 3. Запустить API

```bash
cd src/WindroseLogs.API
dotnet run
# → http://localhost:5000
# → Swagger: http://localhost:5000/swagger
# → Hangfire: http://localhost:5000/hangfire
```

Миграции применяются автоматически при старте.

### 4. Запустить Frontend

```bash
cd frontend
cp .env.local.template .env.local
# Заполнить VITE_AZURE_TENANT_ID и VITE_AZURE_CLIENT_ID
npm install
npm run dev
# → http://localhost:5173
```

## Структура проекта

```
windrose-logs/
├── src/
│   ├── WindroseLogs.Core/          # Domain models, interfaces
│   ├── WindroseLogs.Infrastructure/ # EF Core, Parser, Jobs
│   ├── WindroseLogs.API/           # Web API (controllers, auth)
│   └── WindroseLogs.Worker/        # (будущий отдельный воркер)
├── frontend/                       # React 18 + Vite
├── docker-compose.yml              # Локальная инфраструктура (Postgres + Redis)
├── docker-compose.prod.yml         # Production deployment
└── README.md
```

## Как работает парсинг логов

R5Check — многострочное событие в формате UE5:

```
[2026.03.17-09.15.19:035][759]R5LogCheck: Error: [-1:213759]
!!! R5Check happens !!!
    Condition: 'AttachComponent'
    Message:   No scene component with tag 'VoiceComponent'. ...
    Where:     UR5ScenarioTask_PlaySoundAttachedToActor::... [File.cpp:112]
[timestamp][frame]LogOutputDevice: Error: === FR5CheckDetails::PrintCallstackToLog ===
[timestamp][frame]LogOutputDevice: Error: [Callstack] 0x... Function [File.cpp:line]
```

Парсер (`R5LogParser`) работает как state machine:
- `Normal` → обычные строки
- `R5CheckBlock` → накапливает Condition / Message / Where
- `Callstack` → накапливает стек, flush при выходе из блока

Категоризация: `md5(EventType + Condition + Where)` → `EventSignature`.
Одна сигнатура = одна категория ошибки. Много `LogEvent` → одна `EventSignature`.

## Teams Bot

Команды (планируется Фаза 3):
- Прикрепить `.log` файл → автоматическая загрузка и обработка
- `/r5check all` → сводка всех категорий
- `/r5check popular` → топ-5 по частоте
- `/r5check unique` → уникальные (встречались 1 раз)

## CI/CD

GitHub Actions (планируется):
- Push в `main` → сборка Docker образов → push в `ghcr.io` → деплой на сервер по SSH
