param([switch]$Persist)
$ErrorActionPreference = 'Stop'
$repository = Split-Path $PSScriptRoot -Parent
$toolRoot = Join-Path $repository '.tools\android'
$jdk = Get-ChildItem $toolRoot -Directory -Filter 'jdk-17*' -ErrorAction SilentlyContinue |
  Where-Object { Test-Path (Join-Path $_.FullName 'bin\javac.exe') } |
  Sort-Object Name -Descending | Select-Object -First 1
if (!$jdk) { throw 'Verified JDK 17 is not installed under .tools/android.' }
$sdk = Join-Path $toolRoot 'sdk'
if (!(Test-Path "$sdk\cmdline-tools\19.0\bin\sdkmanager.bat")) {
  throw 'Verified Android command-line tools 19.0 are not installed.'
}
$settings = @{
  JAVA_HOME = $jdk.FullName
  ANDROID_HOME = $sdk
  ANDROID_SDK_ROOT = $sdk
  GRADLE_USER_HOME = (Join-Path $toolRoot 'gradle')
  ANDROID_AVD_HOME = (Join-Path $toolRoot 'avd')
}
foreach ($entry in $settings.GetEnumerator()) {
  [Environment]::SetEnvironmentVariable($entry.Key, $entry.Value, 'Process')
  if ($Persist) { [Environment]::SetEnvironmentVariable($entry.Key, $entry.Value, 'User') }
}
$paths = @("$($jdk.FullName)\bin", "$sdk\platform-tools", "$sdk\cmdline-tools\19.0\bin",
  "$sdk\emulator", "$toolRoot\maestro\bin")
$cmake = Join-Path $toolRoot 'cmake-3.22.1-verified-manual\bin'
if (Test-Path (Join-Path $cmake 'cmake.exe')) { $paths += $cmake }
$env:PATH = ($paths + ($env:PATH -split ';' | Where-Object { $_ -and $_ -notin $paths })) -join ';'
if ($Persist) {
  $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
  $updatedPath = ($paths + ($userPath -split ';' | Where-Object { $_ -and $_ -notin $paths })) -join ';'
  [Environment]::SetEnvironmentVariable('Path', $updatedPath, 'User')
}
Write-Output 'HSM JDK17, Android SDK, Gradle and Maestro paths activated.'
