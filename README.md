# Gamified To-Do App (RPG Quest Log)

MVP v1 scope: Task CRUD, XP/leveling, streaks with forgiveness shield, 8 starter achievements, sound cues.
See team discussion for full spec (theme, palette, event contract, sound cue mapping).

## Stack
React + Vite + Electron. Single engine module (`/src/engine`) owns persistence/logic in the
Electron main process; UI (`/src/components`) talks to it over IPC.

## Branches
- `engine-m1` — @game-logic-engineer: Task CRUD + XP/streak/achievement engine + event emitter
- `ui-m1` — @frontend-engineer: Task list/add/edit/delete/complete UI + IPC client, local persistence display
- merge target: `develop`

## Run (once develop has both merged)
    npm install
    npm run dev
