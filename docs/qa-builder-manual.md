# Builder — manual QA checklist

Run automated preview smoke first: `npm run test:smoke`.

## Core flows

1. **New project**: create a project, send a short product idea, complete plan clarifications (single + multi if shown), approve plan, wait for generate — Preview loads without bundle error toast.
2. **Switch project**: open project B, send a message, switch back to A — chat thread for each project is preserved (no blank reset).
3. **Version restore**: generate twice so History has v1 and v2; use Preview header version control to restore v1 — code and preview match v1; switch to v2 again.
4. **Plan multi + Other**: if planner emits a multi-select question, pick multiple options and optional custom text — confirm still generates; clarifications appear in downstream context.
5. **Quick polish**: from Preview, run Polish — layout updates without losing routes/cart logic.
6. **Supabase flag**: open Integrations, save URL + anon key, regenerate something that uses `createClient` — preview receives env vars (no keys in AI JSON).

## Preview UX

7. **Device frames**: mobile / tablet widths look correct; tooltips on toolbar icons explain viewport-only behavior.
8. **Sidebar**: with Supabase row expanded, main chat/preview columns do not sit under the sidebar (no horizontal overlap).
9. **Builder responsive**: shrink the browser width — Preview header buttons do not disappear; toolbar rows wrap/scroll instead of overlapping.
10. **Chat autoscroll**: send a message — the chat view scrolls to the newest bubble automatically (no manual scroll needed).
11. **Real status**: during plan/codegen, the loading status moves through request/parse states (no looping “final checks” carousel).
12. **New project empty state**: no “Replan” toggle until a preview exists (`hasGenerated`).
13. **Project list order**: newest activity (updatedAt) appears at the top.
14. **Preview header**: title badge must not cover the version dropdown; narrow widths wrap instead of overlapping.

## Edge regressions

12. **JSX comparisons**: app that shows “≤ / ≥” style copy still bundles (auto-fix path).
13. **External link**: Preview “open external” still works for valid bundles.
