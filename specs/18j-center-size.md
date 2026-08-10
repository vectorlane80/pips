# Spec 18j: shrink the Wahoo center hole

The center hole renders at 1.5 units vs 0.62 for track holes — user
finds it oversized. In src/screens/WahooTable.tsx (and WahooTable.css
if sizes live there): center diameter becomes 0.9 units; keep the brand
ring + soft glow exactly as-is (the ring is what marks it special).
Ensure the marble-in-center and center drop-target render within the
new size (marble 0.85 still fits; target ring scales to the hole).
Touch nothing else. Verify: tsc, npm test (673), build. Report.
