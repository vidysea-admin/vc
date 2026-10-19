# Offline TTS for the A10 synthetic crisis clips (D-100/D-101, B13: synthetic audio only, no network, no cloud TTS).
# Uses the Windows OneCore voices installed on this machine through Windows.Media.SpeechSynthesis.
# Input : -Jobs  a UTF-8 JSON file: [{ "id": "crisis-01", "voice": "Microsoft David", "text": "..." }, ...]
#         -OutDir where the raw WAV files (<id>.wav, as the engine writes them) and status.json go.
# Output: <id>.wav per job whose voice exists; status.json = { voices: [...installed], results: [{ id, ok, voice, error }] }.
# Called by gen-live-audio.ts (pnpm --filter @vc/engine gen:live-audio); it does not resample or trim.
param(
  [Parameter(Mandatory = $true)][string]$Jobs,
  [Parameter(Mandatory = $true)][string]$OutDir
)
$ErrorActionPreference = 'Stop'
[Windows.Media.SpeechSynthesis.SpeechSynthesizer, Windows.Media.SpeechSynthesis, ContentType = WindowsRuntime] | Out-Null
Add-Type -AssemblyName System.Runtime.WindowsRuntime

$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
  })[0]
function Await($op, [Type]$type) {
  $task = $asTask.MakeGenericMethod($type).Invoke($null, @($op))
  $task.Wait(-1) | Out-Null
  return $task.Result
}

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$jobList = Get-Content -Raw -Encoding UTF8 -LiteralPath $Jobs | ConvertFrom-Json
$all = [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices
$results = @()
foreach ($job in $jobList) {
  $voice = $all | Where-Object { $_.DisplayName -eq $job.voice } | Select-Object -First 1
  if (-not $voice) {
    $results += [pscustomobject]@{ id = $job.id; ok = $false; voice = $job.voice; error = 'voice not installed' }
    continue
  }
  try {
    $synth = New-Object Windows.Media.SpeechSynthesis.SpeechSynthesizer
    $synth.Voice = $voice
    $stream = Await ($synth.SynthesizeTextToStreamAsync([string]$job.text)) ([Windows.Media.SpeechSynthesis.SpeechSynthesisStream])
    $reader = [System.IO.WindowsRuntimeStreamExtensions]::AsStreamForRead($stream)
    $file = [System.IO.File]::Create((Join-Path $OutDir ($job.id + '.wav')))
    try { $reader.CopyTo($file) } finally { $file.Dispose(); $reader.Dispose(); $stream.Dispose() }
    $results += [pscustomobject]@{ id = $job.id; ok = $true; voice = $job.voice; error = $null }
  } catch {
    $results += [pscustomobject]@{ id = $job.id; ok = $false; voice = $job.voice; error = $_.Exception.Message }
  }
}
$status = [pscustomobject]@{ voices = @($all | ForEach-Object { $_.DisplayName + ' (' + $_.Language + ')' }); results = $results }
$json = $status | ConvertTo-Json -Depth 5
[System.IO.File]::WriteAllText((Join-Path $OutDir 'status.json'), $json, (New-Object System.Text.UTF8Encoding($false)))
