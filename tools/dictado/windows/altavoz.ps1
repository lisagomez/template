# Altavoz de @tu-scope/dictado para Windows. Lo lanza `abreAltavozWindows` desde WSL2 con
# `powershell.exe` y le habla por stdin, una orden JSON por linea:
#   {"id":1,"op":"temporal"}                       devuelve la carpeta temporal de Windows (en base64 UTF-8)
#   {"id":2,"op":"suena","ruta":"C:\\...\\x.wav"}   reproduce el WAV y contesta cuando termina de sonar
# Responde una linea por orden: {"id":1,"ok":true,"b64":"..."} o {"id":2,"ok":true} o {"id":2,"ok":false,"error":"..."}.
# Existe porque el altavoz por el PulseAudio de WSLg suena a un cuarto de la velocidad real (medido
# el 2026-09-16: 6,9 s de audio tardaron 25-31 s), y desde Windows suena a tiempo real (7,0 s).
# No escucha nada mas que su stdin y no abre red. Se cierra cuando el stdin se cierra.
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function A-B64([string]$texto) { return [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($texto)) }

Write-Output '{"listo":true}'
while ($null -ne ($linea = [Console]::In.ReadLine())) {
  if ($linea.Trim().Length -eq 0) { continue }
  try {
    $orden = $linea | ConvertFrom-Json
    switch ($orden.op) {
      'temporal' {
        Write-Output ('{"id":' + $orden.id + ',"ok":true,"b64":"' + (A-B64 ([IO.Path]::GetTempPath())) + '"}')
      }
      'suena' {
        $reproductor = New-Object System.Media.SoundPlayer($orden.ruta)
        $reproductor.PlaySync()
        $reproductor.Dispose()
        Write-Output ('{"id":' + $orden.id + ',"ok":true}')
      }
      default { Write-Output ('{"id":' + $orden.id + ',"ok":false,"error":"orden desconocida"}') }
    }
  } catch {
    $msg = ($_.Exception.Message -replace '["\\]', ' ' -replace "[`r`n]", ' ')
    Write-Output ('{"id":0,"ok":false,"error":"' + $msg + '"}')
  }
}
