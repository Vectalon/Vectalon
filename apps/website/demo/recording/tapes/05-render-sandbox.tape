# 05 - sandbox + Metro-aware render: isolated exec, then compile-and-render.
#      First take surfaces the missing-dependency load error (self-correcting),
#      second take is the green render tree.
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
Type 'node ../../../../packages/rn/bin/rn-vectalon.js sandbox -- node -e "console.log(\"2 + 2 =\", 2 + 2)"'
Enter
Sleep 2500ms
Type "node ../../../../packages/rn/bin/rn-vectalon.js render --entry src/screens/AddGreetCommandScreen.tsx"
Enter
Sleep 2500ms
Type "node ../../../../packages/rn/bin/rn-vectalon.js render --entry src/demo-entry.tsx --file src/screens/AddGreetCommandScreen.tsx,src/hooks/useAddGreetCommand.ts,src/services/AddGreetCommandApi.ts"
Enter
Sleep 4000ms
Sleep 3s
