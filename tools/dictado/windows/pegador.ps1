# Pegador de @tu-scope/dictado para Windows. Lo lanza `creaPegadorWindows` desde WSL2 con
# `powershell.exe` y le habla por stdin, una orden JSON por linea:
#   {"id":1,"op":"pega","b64":"<texto en base64 UTF-8>"}   Set-Clipboard + Ctrl+V, y restaura el portapapeles
#   {"id":2,"op":"teclea","b64":"..."}                      SendKeys con el texto (no toca el portapapeles)
#   {"id":3,"op":"enter"}                                   pulsa Enter
#   {"id":4,"op":"lee"}                                     devuelve el portapapeles en base64
# Responde una linea por orden: {"id":1,"ok":true} o {"id":1,"ok":false,"error":"..."} o {"id":4,"ok":true,"b64":"..."}.
# No escucha nada mas que su stdin y no abre red. Se cierra cuando el stdin se cierra.
Add-Type -AssemblyName System.Windows.Forms
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Desde-B64([string]$b64) { return [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b64)) }
function A-B64([string]$texto) { return [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($texto)) }
function Escapa-SendKeys([string]$texto) {
  $sb = New-Object System.Text.StringBuilder
  foreach ($c in $texto.ToCharArray()) {
    switch ($c) {
      "`n" { [void]$sb.Append('{ENTER}') }
      "`r" { }
      default {
        if ('+^%~(){}[]'.Contains($c)) { [void]$sb.Append('{' + $c + '}') } else { [void]$sb.Append($c) }
      }
    }
  }
  return $sb.ToString()
}

Write-Output '{"listo":true}'
while ($null -ne ($linea = [Console]::In.ReadLine())) {
  if ($linea.Trim().Length -eq 0) { continue }
  try {
    $orden = $linea | ConvertFrom-Json
    switch ($orden.op) {
      'pega' {
        $texto = Desde-B64 $orden.b64
        $previo = $null
        try { $previo = Get-Clipboard -Raw -ErrorAction SilentlyContinue } catch { }
        Set-Clipboard -Value $texto
        [System.Windows.Forms.SendKeys]::SendWait('^v')
        if ($orden.restaura -and $null -ne $previo) { Start-Sleep -Milliseconds 250; Set-Clipboard -Value $previo }
        Write-Output ('{"id":' + $orden.id + ',"ok":true}')
      }
      'teclea' {
        $texto = Desde-B64 $orden.b64
        [System.Windows.Forms.SendKeys]::SendWait((Escapa-SendKeys $texto))
        Write-Output ('{"id":' + $orden.id + ',"ok":true}')
      }
      'enter' {
        [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
        Write-Output ('{"id":' + $orden.id + ',"ok":true}')
      }
      'lee' {
        $actual = ''
        try { $actual = Get-Clipboard -Raw -ErrorAction SilentlyContinue } catch { }
        if ($null -eq $actual) { $actual = '' }
        Write-Output ('{"id":' + $orden.id + ',"ok":true,"b64":"' + (A-B64 $actual) + '"}')
      }
      default { Write-Output ('{"id":' + $orden.id + ',"ok":false,"error":"orden desconocida"}') }
    }
  } catch {
    $msg = ($_.Exception.Message -replace '["\\]', ' ' -replace "[`r`n]", ' ')
    Write-Output ('{"id":0,"ok":false,"error":"' + $msg + '"}')
  }
}
