# Reference Analysis

**Date:** 2026-11-19 · **Scope:** first execution task, step 2

## 1. design.webp

A neo-brutalist editorial landing page. What makes it work:

| Observation | How it was adapted for a work app |
|---|---|
| Very wide, very heavy grotesk headlines | Archivo at 125 % width, weight 800, used for page titles and identity moments only. Body text stays Geist for legibility. |
| A single word boxed in a bright fill with a black border and hard shadow ("Meet the [Makers]") | `.hl` highlighted-word box: auth headlines, Overview greeting. Never in tables or forms. |
| Tilted pill stickers | `.sticker`: role/scope label on the Overview hero and auth panel. |
| Hard offset shadows instead of soft blur | `.inked` and `shadow-hard` on dialogs, auth card, primary buttons, pop-ups. |
| Dotted paper background | `.dotgrid` on identity surfaces and empty states; never behind dense data. |
| Big black slabs with white type | The auth identity panel. |
| Playful illustrations | A custom Orbit motif and a "board sketch" of three work cards. Original drawings, not copied. |

What was **not** carried over: marketing-scale layouts, constant decoration, low-contrast tricks. Tables, forms and settings stay calm and dense.

## 2. Brand kit

- Colour Palette 1–4: `#39C463` green, `#000000`, `#FFFFFF`, `#8298AB` slate. These are the only brand colours in the UI; status colours (danger, warning, info) are functional and tuned to sit with them.
- Inhub E-Cell logo: navy `#103048`, cyan `#0090D8`. Used as supplied on a white plate (it is not legible on black). Its colours are kept as reserved tokens.
- TSWS logo: used in the auth panel's "Organising" strip with the on-light variant.
- Partner logos (TiE Siliguri, Inspiria, Google for Startups, Brex, GoDaddy Registry) stored in `public/partners/`; Inspiria and TiE are shown on the auth panel.

## 3. Contrast checks

Green `#39C463` on white fails AA for small text, so green text uses the derived `#167236`; the green fill always carries black text. Slate text uses `#4D6070`. Both themes pass AA for body text.
