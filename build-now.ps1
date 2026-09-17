cd C:\Users\jjard\empire-os
Remove-Item -Recurse -Force packages\core\dist -ErrorAction SilentlyContinue
pnpm build
