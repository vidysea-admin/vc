@(Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CreationDate -lt [datetime]'2026-10-25T09:08:00' }).Count
