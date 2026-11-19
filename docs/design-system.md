# Inhub Workspace — Design System

**Status:** Draft v1.0  
**Design direction:** Experimental editorial utility  
**Reference methodology:** Techstars Startup Weekend Siliguri V1 website

---

## 1. Design intent

Inhub Workspace should feel like a thoughtfully art-directed product, not a generic admin template. Its visual methodology borrows from the V1 Startup Weekend website: experimental digital art, premium editorial composition, creative-technology references, strong typography, unexpected but disciplined layouts, and distinctive interaction details.

The methodology must be adapted to a productivity application. The website's expressive energy belongs in the product's identity, onboarding, workspace overview, empty states and selected moments. Task tables, forms, calendars, reports and settings must remain calm, predictable, legible and fast.

**Design principle:** expressive at the edges, disciplined at the centre.

## 2. Principles

1. **Editorial, not template-like.** Use confident typographic hierarchy, purposeful negative space and considered composition instead of repetitive cards.
2. **Controlled asymmetry.** Introduce asymmetric summary areas, varied content proportions and occasional overlap where it improves hierarchy. Do not make dense operational views irregular.
3. **Distinctive, not distracting.** Use a small number of signature visual motifs and restrained motion. The interface must never compete with the work.
4. **Information first.** Tables, task details, deadlines, ownership and status must be immediately scannable.
5. **Progressive disclosure.** Show essential information first; reveal secondary controls, metadata and advanced settings when needed.
6. **Functional motion.** Motion should explain state, hierarchy or navigation. Avoid animation for decoration alone.
7. **Consistency at scale.** Shared tokens and components must be used across every module.
8. **Accessible by default.** Colour is never the only status signal; keyboard, contrast, focus and reduced-motion support are required.

## 3. Visual language

### 3.1 Product character

- Modern, confident, intelligent, creative and operational.
- Premium editorial sensibility with restrained creative-technology cues.
- Strong typographic composition and precise alignment.
- Soft tonal surfaces, sharp information hierarchy and compact data controls.
- Occasional abstract, organic or generative forms for identity moments.

Avoid:

- Generic SaaS dashboard patterns with identical rounded cards everywhere.
- Excessive gradients, neon, glassmorphism or blur.
- Decorative 3D objects behind tables or forms.
- Repeated circles, pills and floating blobs as a substitute for hierarchy.
- Oversized headings on every operational screen.
- Forced Gen Z language, novelty cursors or scroll hijacking.
- Heavy GSAP/WebGL effects in task execution flows.

### 3.2 Provisional colour system

These values are a starting palette, not an approved existing brand kit. Preserve them as design tokens so the palette can be changed centrally after brand review.

| Token | Light theme | Dark theme | Usage |
|---|---|---|---|
| `canvas` | `#F5F5F1` | `#101216` | App background |
| `surface` | `#FFFFFF` | `#181C22` | Main panels |
| `surface-raised` | `#FFFFFF` | `#202630` | Menus, dialogs, popovers |
| `surface-muted` | `#ECEDE8` | `#252B34` | Secondary areas |
| `text-primary` | `#171A1F` | `#F3F4F2` | Main text |
| `text-secondary` | `#626A73` | `#A7B0BB` | Supporting text |
| `text-tertiary` | `#838B93` | `#7F8995` | Hints and metadata |
| `border` | `#E0E3DC` | `#303844` | Dividers and outlines |
| `accent` | `#526B35` | `#C6E47A` | Primary action and active accent |
| `accent-soft` | `#EAF1DC` | `#303B28` | Accent background |
| `info` | `#286A9B` | `#80C7F2` | Informational state |
| `success` | `#237B55` | `#70D6A4` | Success state |
| `warning` | `#9A6419` | `#F2C36E` | Warning state |
| `danger` | `#B23B3B` | `#FF8989` | Destructive/error state |

Colour requirements:

- Use semantic tokens, never hard-code one-off colours in feature components.
- Verify WCAG 2.2 AA contrast for text and interactive controls.
- Statuses must include text or an icon in addition to colour.
- Do not use the accent colour for every button, badge or link.
- Gradients are permitted only for selected identity or overview surfaces, not data tables.

## 4. Typography

### 4.1 Type families

- **Primary UI:** Geist Sans (or a metrically similar system sans-serif fallback).
- **Display accent:** Space Grotesk, used selectively for workspace titles, section introductions and milestone moments.
- **Monospaced data:** Geist Mono or a system monospace for IDs, timestamps, keyboard shortcuts and technical values.

Use `next/font` where possible to avoid layout shifts and external font-loading dependencies. If the preferred font cannot be bundled, fall back gracefully.

### 4.2 Type scale

| Token | Size / line height | Typical use |
|---|---|---|
| `display` | 40–48 / 1.05 | Workspace overview hero only |
| `h1` | 30–36 / 1.15 | Page title |
| `h2` | 22–26 / 1.25 | Major section |
| `h3` | 17–20 / 1.3 | Panel or group title |
| `body-lg` | 16 / 1.5 | Introductory copy |
| `body` | 14 / 1.5 | Default interface text |
| `body-sm` | 13 / 1.45 | Table cells and secondary content |
| `caption` | 11–12 / 1.4 | Metadata and hints |
| `mono` | 12–13 / 1.45 | Identifiers and technical values |

Use sentence case. Reserve uppercase text for short labels, metadata and compact section markers. Do not use all caps for paragraphs or long button labels.

## 5. Layout and spacing

### 5.1 Grid

- Desktop app shell: fixed or collapsible left navigation, flexible main content and optional contextual right panel.
- Main content max width: approximately 1440 px for dashboards; task tables may use the available viewport.
- Use a 12-column conceptual grid for overview pages and responsive single-column layouts on narrow screens.
- Keep operational content aligned to a consistent left edge.
- Avoid horizontal scrolling at common laptop widths except in intentionally wide data tables, which must retain clear scroll affordance.

### 5.2 Spacing scale

Use a 4 px base scale:

`4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80`.

Prefer 8/16/24 px for routine component spacing. Do not introduce arbitrary one-off spacing values without a reason.

### 5.3 Density modes

Provide a comfortable default density. Consider a compact density option for task tables and audit logs after the base experience is stable. Density changes should affect row height and padding, not reduce readable font sizes below accessible limits.

## 6. Shape, elevation and borders

- Small controls: 6–8 px radius.
- Standard panels: 10–14 px radius.
- Large overview panels: 16–20 px radius, used selectively.
- Pills: only for compact statuses, filters or tags where the shape conveys a control/state.
- Prefer one-pixel borders and tonal separation over large shadows.
- Use shadows for menus, dialogs and floating surfaces, not every card.
- Do not put every dashboard metric inside an identical rounded rectangle. Use typographic metrics, dividers and varied groupings.

## 7. Signature visual motifs

The Startup Weekend V1 methodology can be expressed in this product through:

- A restrained abstract “signal” or “orbit” motif for loading, onboarding and empty states.
- Editorial page introductions with strong type and small metadata labels.
- Asymmetric overview compositions for priority work and team activity.
- Subtle contour, grid, noise or generative textures on selected identity surfaces only.
- Carefully art-directed illustrations rather than generic stock illustrations.

These motifs must not be used as background decoration behind dense content or compromise legibility.

## 8. Application shell and navigation

### 8.1 Desktop

- Left sidebar contains product identity, primary navigation, workspace switcher if multiple workspaces are enabled, and user/account controls.
- Main header contains breadcrumb/context, page title, search/command access and page-level actions.
- Right-side contextual panel may be used for task details, activity or filters, but must not permanently reduce working width without user control.
- Sidebar supports expanded and collapsed states with tooltips and accessible labels.

### 8.2 Mobile/tablet

- Sidebar collapses into a drawer or compact navigation.
- Primary actions remain reachable without hover.
- Tables become card/list representations where appropriate or offer controlled horizontal scrolling.
- Task detail and edit forms should use a full-screen sheet on narrow screens.

## 9. Core components

Build reusable, typed components with consistent variants and states.

### Navigation and layout

- `AppShell`
- `Sidebar`
- `WorkspaceSwitcher`
- `Breadcrumbs`
- `PageHeader`
- `CommandSearch` (future-ready)
- `ContextPanel`

### Data and work management

- `DataTable`
- `FilterBar`
- `SavedViewMenu` (future-ready)
- `TaskStatusBadge`
- `PriorityIndicator`
- `AssigneeAvatarGroup`
- `DueDateLabel`
- `KanbanColumn` and `TaskCard` (Module 2)
- `ActivityTimeline`
- `EmptyState`

### Forms and feedback

- `FormField`
- `Combobox` / user picker
- `DatePicker`
- `Textarea`
- `Dialog`
- `ConfirmationDialog`
- `Toast`
- `InlineAlert`
- `Skeleton`
- `ErrorState`

### Notifications

- `NotificationBell`
- `NotificationInbox`
- `NotificationItem`
- `NotificationPreferenceControl`

Each component must define hover, focus-visible, active, disabled, loading, error and empty states where relevant. Destructive actions require confirmation and clear consequence wording.

## 10. Interaction and motion

### 10.1 Motion principles

- Short, purposeful transitions; default 120–220 ms for local UI feedback.
- Page transitions should be subtle and must not delay navigation.
- Use spring motion sparingly for drawers, popovers and drag interactions.
- Avoid scroll hijacking, autoplay video and mandatory animated loading sequences.
- Respect `prefers-reduced-motion` and provide non-animated alternatives.

### 10.2 Interaction standards

- Every clickable element must have a clear action and keyboard support.
- Prefer visible labels over icon-only controls; icon-only controls require accessible names and tooltips.
- Use optimistic UI only when rollback/error handling is implemented.
- Show loading state for async actions and prevent duplicate submissions.
- Explain permission denial without leaking restricted data.
- Confirm destructive or irreversible operations.
- Keep focus within modal dialogs and return focus to the invoking control on close.

## 11. Data visualisation

- Charts should answer a clear operational question.
- Label axes and units; provide a table or accessible summary for important charts.
- Avoid 3D charts, decorative gauges and misleading truncated axes.
- Use the semantic status palette consistently.
- Do not imply individual performance rankings without an explicitly agreed measurement policy.

## 12. Accessibility and responsive quality

Target WCAG 2.2 AA.

- Full keyboard navigation.
- Visible focus indicator.
- Semantic headings and landmarks.
- Accessible names for icon buttons.
- Sufficient colour contrast.
- Form labels and actionable validation messages.
- Status is communicated by text/icon as well as colour.
- Reduced-motion support.
- Responsive testing at mobile, tablet, laptop and large desktop breakpoints.

## 13. Implementation guidance

- Implement tokens as CSS variables and map them into Tailwind configuration/utilities.
- Use a shared component library; avoid custom styling drift between modules.
- Use CSS for most layout and transitions; introduce animation libraries only when an interaction truly benefits.
- Do not bring over the public event website's heavy GSAP, Lenis, Three.js or WebGL stack by default. This is an operational application, not a marketing microsite.
- Keep the design system versioned. Any new colour, spacing, radius or typography token should be added here before use.

## 14. Acceptance checklist

- [ ] Light and dark themes use semantic tokens.
- [ ] Typography hierarchy is consistent.
- [ ] Shared app shell and navigation are responsive.
- [ ] Tables and forms are readable and keyboard accessible.
- [ ] Status and priority are not communicated by colour alone.
- [ ] Components define loading, empty, error and disabled states.
- [ ] Motion respects reduced-motion preferences.
- [ ] No unnecessary heavy animation or visual effects are used in work flows.
- [ ] Design motifs reflect the Startup Weekend V1 methodology without compromising productivity.
- [ ] Colour contrast and accessibility checks pass.

---

## Appendix A — Implementation record (Module 1, 2026-11-19)

This appendix records how the draft above was implemented. Where it differs from the draft, **this appendix wins**. The original draft is kept unchanged in `docs/supplied/design-system.md`.

### A.1 Brand tokens (official, from the supplied brand kit)

| Token | Value | Source | Use |
|---|---|---|---|
| `--brand-green` | `#39C463` | Color Palette 1–4 | Primary accent, highlighted-word box, focus of identity moments |
| `--brand-black` | `#000000` | Color Palette | Ink, hard shadows, primary buttons |
| `--brand-white` | `#FFFFFF` | Color Palette | Surfaces |
| `--brand-slate` | `#8298AB` | Color Palette | Secondary accent, Team Member role, quiet data |
| `--brand-navy` | `#103048` | Inhub E-Cell logo | Reserved for logo contexts |
| `--brand-cyan` | `#0090D8` | Inhub E-Cell logo | Reserved for logo contexts / info |
| `--accent-text` | `#167236` | Derived from green | Green text on light surfaces (AA contrast) |
| `--slate-ink` | `#4D6070` | Derived from slate | Slate text on light surfaces (AA contrast) |
| `--canvas` | `#F4F6F3` | Derived | App background |

All tokens live in `src/app/globals.css` (`:root`, `[data-theme=dark]`, and the Tailwind `@theme inline` block). Dark theme is implemented and selectable from the account menu (System / Light / Dark).

Logos are used exactly as supplied (`public/brand/`, `public/partners/`). The only processing was trimming transparent padding from `inhub-ecell.png` and a 312 px email copy; nothing is redrawn, recoloured or distorted.

### A.2 design.webp methodology, adapted

| Motif | Class | Where it is allowed |
|---|---|---|
| Highlighted word box | `.hl` | Auth headlines, Overview greeting, auth card titles |
| Tilted sticker | `.sticker` | Auth panel, Overview hero, error state |
| Dotted canvas | `.dotgrid` | Auth form side, Overview hero, empty states |
| Inked panel (hard offset shadow) | `.inked` | Dialogs, auth card, setup checklist |
| Tactile press | `.press` | Primary/secondary/danger buttons |
| Orbit illustration | `<Orbit>` | Empty states and loaders only |
| Icon tile | `.icon-tile` | Page titles, empty-state badges |

Type: **Archivo** at 125 % width, weight 800 (display), **Geist** (UI), **Geist Mono** (eyebrows, data).

### A.3 Motion — revised by the product owner

The draft (§2 rule 3, §10 and the "do not bring over GSAP / Lenis" line) asked for restrained motion without the event-site stack. On 2026-11-19 the product owner asked for **"smooth animations with Lenis, Framer Motion, GSAP and anime.js, more icons, and pop-ups instead of window.alert for success and errors."** That instruction supersedes the draft. Each library has one clear job so they never fight over the same element:

| Library | Version | Job | Files |
|---|---|---|---|
| Lenis | 1.3.27 | Smooth window scrolling, driven by GSAP's ticker; paused while a dialog is open; any `[data-lenis-prevent]` element (dialogs, menus, sidebar nav, drawer) scrolls natively | `components/motion/smooth-scroll.tsx` |
| Framer Motion | 14.14.0 | Page enter transition (`(app)/template.tsx`), staggered lists, panels rising into view, dialog spring, menus, mobile drawer, sliding active-nav indicator, toasts (enter/exit, swipe to dismiss, progress bar) | `components/motion/reveal.tsx`, `ui/dialog.tsx`, `ui/menu.tsx`, `ui/toast.tsx`, `shell/app-shell.tsx` |
| GSAP (+ @gsap/react) | 3.15.1 | Identity moments: headline rise with `.hl` sweep and sticker pop, metric count-ups, the login board sketch drawing in | `components/motion/gsap-fx.tsx` |
| anime.js | 4.5.0 | Micro-interactions: Orbit motif (orbiting satellite, breathing core, bobbing square), icon wiggle on page titles / empty states / unread bell, success-burst particles on success pop-ups | `components/motion/anime-fx.tsx` |
| CSS | — | Table rows rising in, bars growing (`.grow-x`), dialog backdrop fade, button icon nudge (`.nudge`) | `app/globals.css` |

Rules that still apply:

- **Reduced motion is honoured everywhere.** Lenis is not started, GSAP/anime.js effects return early, Framer Motion uses `MotionConfig reducedMotion="user"`, and CSS animations collapse to 0.01 ms.
- Motion never blocks input: durations are 120–900 ms, nothing loops except the Orbit motif and spinners.
- Text stays in the DOM while animating, so it is readable by screen readers and without JavaScript.

### A.4 Feedback: pop-ups, never browser dialogs

- `window.alert`, `window.confirm` and `window.prompt` are **not used anywhere** in the codebase.
- **Results** (success, error, warning, info) use `useToast()` from `components/ui/toast.tsx`: a tone icon, a title, the message, a countdown bar, pause on hover, swipe or × to dismiss. Errors stay 7 s, others 4.5 s.
- **Form and action errors** use `<FormError message>` which shows the inline alert *and* raises an error pop-up, so a failure is never missed even when the form is scrolled away.
- **Decisions** (revoke, deactivate, archive, role change) use `<ConfirmDialog>` with a plain-language consequence; its errors use `<FormError>` too.

### A.5 Icons

lucide-react throughout. Every page title has an icon tile, every section heading has an icon chip, every empty state has an icon badge, metrics carry an icon in their label, list rows carry a type icon and a chevron, and buttons carry a leading icon. Status and role badges always pair an icon with text (colour is never the only signal).
