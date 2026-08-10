# 05 - sandbox + Metro-aware render, filmed as the `render --file` fix before/after.
#      Beat 1: sandbox isolated exec (2 + 2).
#      Beat 2 (BEFORE): same render command on the pre-fix build — the comma list
#      spreads into characters -> "File not found: .../s" (driven by
#      scripts/render-broken.sh, which reverts the two fix hunks in dist, runs,
#      and always restores).
#      Beat 3 (AFTER): the same command on the fixed build — full render tree,
#      all 3 extra files compiled.
Output "clips/05-render-sandbox.mp4"
Set Width 1440
Set Height 900
Set FontSize 16
Set Padding 24
Set TypingSpeed 30ms
Set Shell bash

Type "cd ../cli-app"
Enter
Sleep 600ms
Type "export VECTALON_DEV_MODE=1"
Enter
Sleep 400ms

Type 'node ../../../../packages/rn/bin/rn-vectalon.js sandbox -- node -p "2+2"'
Enter
Sleep 2500ms

Type "echo '== BEFORE: v0.1.22 pre-fix — --file comma list =='"
Enter
Sleep 700ms
Type "bash ../recording/scripts/render-broken.sh"
Enter
Sleep 3000ms

Type "echo '== AFTER: fixed build — same command =='"
Enter
Sleep 700ms
Type 'node ../../../../packages/rn/bin/rn-vectalon.js render --entry src/demo-entry.tsx --file src/screens/AddGreetCommandScreen.tsx,src/hooks/useAddGreetCommand.ts,src/services/AddGreetCommandApi.ts'
Enter
Sleep 4000ms
Sleep 3s
