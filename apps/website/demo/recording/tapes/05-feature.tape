# 05 - feature: the captured paper trail from "create a login screen with email password"
Output "clips/05-feature.mp4"
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
Type "ls docs/vectalon/feature-development/"
Enter
Sleep 1200ms
Type 'node -e "const s=JSON.parse(require(\"fs\").readFileSync(\"docs/vectalon/feature-development/create-a-login-screen-with-email-passwor-mslv1jnj/workflow-state.json\",\"utf-8\")); console.log(\"status:\", s.status); console.log(s.phases.map(p=>p.id+\":\"+p.status).join(\" \"))"'
Enter
Sleep 2200ms
Type "head -16 docs/vectalon/feature-development/create-a-login-screen-with-email-passwor-mslv1jnj/implementation.md"
Enter
Sleep 1800ms
Type "ls src/screens src/hooks src/services"
Enter
Sleep 1500ms
Sleep 3s
