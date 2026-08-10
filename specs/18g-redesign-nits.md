# Spec 18g: redesign audit nits

Modify ONLY src/screens/WahooTable.tsx and WahooTable.css.

1. Die caption overflow: `.wh-die-caption` gets `max-width: 72px;
   overflow: hidden; text-overflow: ellipsis;` (keep nowrap) so long
   names ("Somebody (bot)") can't force horizontal scroll at 375px.
2. Unify the coordinate scales: the hole grid uses unit = paneW/16 but
   the cross SVG viewBox spans 17 units (-8.5..8.5) — change the
   viewBox to "-8 -8 16 16" so both pipelines share one scale exactly
   (shapes at ±7.75 still fit inside ±8), and add a one-line comment at
   the unit computation noting the SVG viewBox must match paneW/unit.

Verify: npx tsc -b --noEmit; npm test (671); npm run build. Report.
