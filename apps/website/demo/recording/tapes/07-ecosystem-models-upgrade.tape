# 07 - models + ecosystem + upgrade: model inventory, tooling catalog, upgrade plan
Output "clips/07-ecosystem-models-upgrade.mp4"
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
Type "node ../../../../packages/rn/bin/rn-vectalon.js models"
Enter
Sleep 1800ms
Type "node ../../../../packages/rn/bin/rn-vectalon.js ecosystem --category mcp"
Enter
Sleep 2500ms
Type "node ../../../../packages/rn/bin/rn-vectalon.js upgrade --to 0.76 --dry-run"
Enter
Sleep 3000ms
Sleep 3s
