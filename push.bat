@echo off
setlocal
cd /d "%~dp0"
echo == Pushing to git@github.com:Hackercds/HTML-KING.git ==

REM If remote main has commits we don't (e.g. GitHub default README),
REM pull --rebase so our commit sits on top. Safe; no force-push.
git fetch origin main 2>nul
git rev-parse --verify origin/main >nul 2>&1
if not errorlevel 1 (
  git rev-parse --verify HEAD >nul 2>&1
  if not errorlevel 1 (
    git merge-base --is-ancestor origin/main HEAD >nul 2>&1
    if errorlevel 1 (
      echo Remote has new commits, rebasing local on top...
      git pull --rebase origin main
      if errorlevel 1 goto :err
    )
  )
)

git push -u origin main
if errorlevel 1 goto :err
echo.
echo 推送成功！
echo 去 https://github.com/Hackercds/HTML-KING/settings/pages 开 Pages
echo 等 1-2 分钟，访问 https://hackercds.github.io/HTML-KING/
exit /b 0

:err
echo.
echo 推送失败。如果上面看到 rebase 冲突，先:
echo   git rebase --abort
echo   或者把错误信息发给我看
exit /b 1
