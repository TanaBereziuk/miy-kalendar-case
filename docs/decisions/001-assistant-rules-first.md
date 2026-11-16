# 001 · Assistant: rules first, LLM later

**Date:** 16 Nov 2026 · **Status:** accepted

## Context
Adding events through the form takes 5–7 taps. Most of my entries are short and repetitive: "dance Mon and Wed 6–8", "vet on Thursday at 17:30", "remove yoga".
I wanted to add them with one phrase.

## Options
| | Rule-based parser | LLM (Claude API) |
|---|---|---|
| Cost | free | pay per request |
| Setup | none | API key, serverless function |
| Privacy | text never leaves the device | text sent to a provider |
| Coverage | the phrases I actually use | almost anything |
| Predictability | high | needs guardrails |

## Decision
Ship the rule-based parser (`src/assistant/parse.ts`) first. It covers weekdays in all grammatical cases, "weekdays/weekend", relative dates, time ranges, parts of the day, durations, repeats and "remove …".
It returns a typed `Plan`, and the UI only knows about `Plan`. An LLM can later return the same type from a serverless function, with the rules kept as a fallback.

## UX consequences
- Act immediately and offer **Undo** instead of a confirmation step. The reply lists exactly what was added, so mistakes are visible and cheap to revert.
- Example chips in the empty state teach the phrasing the parser understands.

## How we'll know it's time to switch
I keep rewriting phrases because they aren't understood, or I start wanting to ask for things that need judgement ("find a slot for the gym this week").
