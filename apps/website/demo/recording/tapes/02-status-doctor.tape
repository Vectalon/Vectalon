# 02 - status + doctor: the health screen and the toolchain report
Output "clips/02-status-doctor.mp4"
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
Type "node ../../../../packages/rn/bin/rn-vectalon.js status"
Enter
Sleep 3500ms
Type "node ../../../../packages/rn/bin/rn-vectalon.js doctor"
Enter
Sleep 4000ms
Sleep 3s
