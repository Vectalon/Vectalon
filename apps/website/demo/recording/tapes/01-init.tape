# 01 - init: reset to a virgin project, then initialize the 19-screen Expo app
Output "clips/01-init.mp4"
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
Type "rm -rf .vectalon"
Enter
Sleep 600ms
Type "node ../../../../packages/rn/bin/rn-vectalon.js init --model local"
Enter
Sleep 3500ms
Type "ls -la .vectalon"
Enter
Sleep 2000ms
Sleep 3s
