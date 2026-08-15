# 07 - archive: the build plan for the Expo app (dry run — zero side effects)
Output "clips/07-archive.mp4"
Set Width 1440
Set Height 900
Set FontSize 16
Set Padding 24
Set TypingSpeed 30ms
Set Shell bash

Type "cd ../login-app"
Enter
Sleep 600ms
Type "export VECTALON_DEV_MODE=1"
Enter
Sleep 400ms
Type "node ../../../../packages/rn/bin/rn-vectalon.js archive --dry-run"
Enter
Sleep 4500ms
Sleep 3s
