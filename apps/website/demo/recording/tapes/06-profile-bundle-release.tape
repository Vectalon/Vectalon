# 06 - profile + bundle + release: Hermes runtime analysis, budget gate, release plan
Output "clips/06-profile-bundle-release.mp4"
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
Type "node ../../../../packages/rn/bin/rn-vectalon.js profile --profile ../login-app/app.cpuprofile"
Enter
Sleep 3000ms
Type "node ../../../../packages/rn/bin/rn-vectalon.js bundle --static"
Enter
Sleep 3000ms
Type "node ../../../../packages/rn/bin/rn-vectalon.js release"
Enter
Sleep 3500ms
Sleep 3s
