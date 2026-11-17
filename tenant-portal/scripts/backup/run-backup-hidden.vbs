' Launches the Modus nightly backup with no visible window and passes its exit code to Task Scheduler.
Set sh = CreateObject("WScript.Shell")
rc = sh.Run("powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File ""C:\Modus-dev\db-backups\backup-modus.ps1""", 0, True)
WScript.Quit rc
