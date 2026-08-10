# Spec 18p2: the rail centers within itself — make it stretch first

.wh-table-card has align-items: flex-start, so .wh-rail collapses to
content height (247px) and its justify-content: center is a no-op.
Add `align-self: stretch` to `.wh-rail` in WahooTable.css (desktop
rules only — keep the narrow-screen collapse as is). Verify the fix
live-measurable: the rail's height should match the board pane's.
tsc/test/build. Report.
