# Spec 18p: vertically center the Wahoo die rail (Oscar layout flag)

The left rail's content (die, caption, Roll, status) hugs the top of a
column that runs the board's full height, leaving a dead gutter below.
In WahooTable.css, make the rail a flex column with
`justify-content: center` against the board's height (keep the narrow-
screen collapse behavior unchanged). One-property-scale change; touch
nothing else. Verify tsc/test/build. Report.
