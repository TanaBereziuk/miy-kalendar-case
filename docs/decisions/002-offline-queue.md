# 002 · Never lose a change offline

**Date:** 16 Nov 2026 · **Status:** accepted

## Context
I plan on the phone in places with bad connection: the metro, the vet, the shop.
A code review showed that an edit made without connection could be lost after a reload. A calendar that loses a vet appointment is worse than no calendar.

## Decision
Every change to events and dishes goes through a queue on the device (`src/lib/outbox.ts`):
1. The change is shown in the UI immediately.
2. It's stored in the device queue.
3. The queue is sent when the connection returns, when the tab regains focus, and every 20 s.

## States designed for
| State | What the user sees |
|---|---|
| Saved | nothing, no noise |
| No connection | banner: "No connection. Changes are saved on this device and will be sent when the internet is back." |
| Server rejected a change | banner stays until dismissed: "Couldn't save one of the changes: the server didn't accept it. Check the last event or dish." |
| Returning to the tab | no re-login check, so a short network glitch doesn't throw the user out mid-edit |

Database limits (title length, cooking time range) are duplicated in the UI, so most rejections never happen.
