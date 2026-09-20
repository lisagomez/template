# Icono de @tu-scope/dictado para la barra de Windows (area de notificacion) + boton FLOTANTE
# siempre visible. Se lanza desde WSL2 con `dictado dictar --icono` (a la vista: te lo dice
# antes) o solo, al iniciar sesion, con el .cmd que deja `dictado icono instala`. Que hace:
#   - pinta UN icono en la barra y UN boton flotante arrastrable, ambos con el color del
#     estado (gris = apagado/en espera, rojo = escuchando, ambar = transcribiendo);
#   - un CLICK en cualquiera manda la palabra `alternar` al dictado por TCP a 127.0.0.1:<Puerto>;
#   - si el dictado no esta corriendo y conoce la ruta (-RaizWsl), el click lo arranca
#     con wsl.exe y `npm run en-vivo`;
#   - lee del socket solo lineas `estado <nombre>` para colorearse;
#   - el boton se arrastra (posicion recordada en flotante.txt junto a este script) y se
#     oculta o vuelve desde el menu derecho.
# No lee el teclado, no escribe nada, no toca el portapapeles y no sale a internet.
# Un Mutex con nombre garantiza UN icono aunque se lance dos veces. Menu derecho: salir.
param(
  [int]$Puerto = 47124,
  [string]$RaizWsl = '',
  [string]$Distro = ''
)
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$mutex = New-Object System.Threading.Mutex($false, 'Local\DictadoIconoBarra')
if (-not $mutex.WaitOne(0)) { exit 0 }  # ya hay un icono: este sobra

function Nuevo-Icono([System.Drawing.Color]$color, [bool]$hueco = $false) {
  $bmp = New-Object System.Drawing.Bitmap(16, 16)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  if ($hueco) { $g.DrawEllipse((New-Object System.Drawing.Pen($color, 2)), 3, 3, 10, 10) }
  else { $g.FillEllipse((New-Object System.Drawing.SolidBrush($color)), 2, 2, 12, 12) }
  $g.Dispose()
  return [System.Drawing.Icon]::FromHandle($bmp.GetHicon())
}
$iconos = @{
  apagado       = Nuevo-Icono ([System.Drawing.Color]::FromArgb(110, 110, 110)) $true
  arrancando    = Nuevo-Icono ([System.Drawing.Color]::FromArgb(240, 180, 40)) $true
  inactivo      = Nuevo-Icono ([System.Drawing.Color]::FromArgb(150, 150, 150))
  escuchando    = Nuevo-Icono ([System.Drawing.Color]::FromArgb(220, 50, 50))
  transcribiendo = Nuevo-Icono ([System.Drawing.Color]::FromArgb(240, 160, 30))
  pegando       = Nuevo-Icono ([System.Drawing.Color]::FromArgb(240, 160, 30))
}
$textos = @{
  apagado       = 'Dictado: apagado (click para arrancar)'
  arrancando    = 'Dictado: arrancando...'
  inactivo      = 'Dictado: en espera (click para dictar)'
  escuchando    = 'Dictado: ESCUCHANDO (click para apagar)'
  transcribiendo = 'Dictado: transcribiendo...'
  pegando       = 'Dictado: pegando...'
}

$icono = New-Object System.Windows.Forms.NotifyIcon
$icono.Visible = $true
$script:cliente = $null
$script:flujo = $null
$script:escritor = $null
$script:resto = ''
$script:estado = ''

$coloresFlotante = @{
  apagado       = [System.Drawing.Color]::FromArgb(110, 110, 110)
  arrancando    = [System.Drawing.Color]::FromArgb(240, 180, 40)
  inactivo      = [System.Drawing.Color]::FromArgb(150, 150, 150)
  escuchando    = [System.Drawing.Color]::FromArgb(220, 50, 50)
  transcribiendo = [System.Drawing.Color]::FromArgb(240, 160, 30)
  pegando       = [System.Drawing.Color]::FromArgb(240, 160, 30)
}

function Pon-Estado([string]$nombre) {
  if ($script:estado -eq $nombre) { return }
  $script:estado = $nombre
  $icono.Icon = $iconos[$nombre]
  $icono.Text = $textos[$nombre]
  if ($script:flotante) { $script:flotante.Invalidate() }
}
function Desconecta {
  if ($script:cliente) { $script:cliente.Close() }
  $script:cliente = $null; $script:flujo = $null; $script:escritor = $null; $script:resto = ''
  if ($script:estado -ne 'arrancando') { Pon-Estado 'apagado' }
}
function Conecta {
  try {
    $c = New-Object System.Net.Sockets.TcpClient
    $c.Connect('127.0.0.1', $Puerto)
    $script:cliente = $c
    $script:flujo = $c.GetStream()
    $script:escritor = New-Object System.IO.StreamWriter($script:flujo)
    $script:escritor.AutoFlush = $true
    Pon-Estado 'inactivo'  # el estado real llega en la primera linea
  } catch { Desconecta }
}
function Arranca-Dictado {
  if (-not $RaizWsl) {
    $icono.ShowBalloonTip(4000, 'Dictado', "El dictado no esta corriendo. Arrancalo desde WSL2 con 'npm run en-vivo'.", 'Info')
    return
  }
  Pon-Estado 'arrancando'
  $argumentos = @()
  if ($Distro) { $argumentos += @('-d', $Distro) }
  $argumentos += @('--', 'bash', '-lc', "cd '$RaizWsl' && npm run en-vivo")
  Start-Process -WindowStyle Hidden 'wsl.exe' -ArgumentList $argumentos
}

Pon-Estado 'apagado'
Conecta

function Click-Alternar {
  if ($script:escritor) {
    try { $script:escritor.WriteLine('alternar') } catch { Desconecta }
  } elseif ($script:estado -ne 'arrancando') {
    Arranca-Dictado
  }
}

$icono.add_MouseClick({
  if ($_.Button -eq [System.Windows.Forms.MouseButtons]::Left) { Click-Alternar }
})

$menu = New-Object System.Windows.Forms.ContextMenuStrip
[void]$menu.Items.Add('Apagar el dictado (y su motor)').add_Click({
  if ($RaizWsl) {
    $argumentos = @(); if ($Distro) { $argumentos += @('-d', $Distro) }
    $argumentos += @('--', 'bash', '-lc', "cd '$RaizWsl' && npm run en-vivo -- --parar")
    Start-Process -WindowStyle Hidden 'wsl.exe' -ArgumentList $argumentos
  }
  Desconecta
})
[void]$menu.Items.Add('Mostrar/ocultar el boton flotante').add_Click({
  if ($script:flotante.Visible) { $script:flotante.Hide() } else { $script:flotante.Show() }
})
[void]$menu.Items.Add('Quitar este icono').add_Click({ $icono.Visible = $false; [System.Windows.Forms.Application]::Exit() })
$icono.ContextMenuStrip = $menu

# ── Boton flotante: un circulo siempre encima, arrastrable; un click = el mismo alternar. ──
$rutaFlotante = Join-Path $PSScriptRoot 'flotante.txt'
$script:flotante = New-Object System.Windows.Forms.Form
$flotante = $script:flotante
$flotante.FormBorderStyle = 'None'
$flotante.TopMost = $true
$flotante.ShowInTaskbar = $false
$flotante.StartPosition = 'Manual'
$flotante.Size = New-Object System.Drawing.Size(46, 46)
$flotante.BackColor = [System.Drawing.Color]::Magenta
$flotante.TransparencyKey = [System.Drawing.Color]::Magenta
$area = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
$flotante.Location = New-Object System.Drawing.Point(($area.Right - 70), ($area.Bottom - 110))
if (Test-Path $rutaFlotante) {
  $partes = (Get-Content $rutaFlotante -First 1) -split ','
  if ($partes.Count -eq 2) {
    $x = [Math]::Min([Math]::Max([int]$partes[0], $area.Left), $area.Right - 46)
    $y = [Math]::Min([Math]::Max([int]$partes[1], $area.Top), $area.Bottom - 46)
    $flotante.Location = New-Object System.Drawing.Point($x, $y)
  }
}
$flotante.add_Paint({
  $g = $_.Graphics
  $g.SmoothingMode = 'AntiAlias'
  $color = $coloresFlotante[$script:estado]
  if (-not $color) { $color = $coloresFlotante['apagado'] }
  $g.FillEllipse((New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(235, 30, 30, 30))), 2, 2, 41, 41)
  if ($script:estado -in @('apagado', 'arrancando')) {
    $g.DrawEllipse((New-Object System.Drawing.Pen($color, 4)), 12, 12, 21, 21)
  } else {
    $g.FillEllipse((New-Object System.Drawing.SolidBrush($color)), 11, 11, 23, 23)
  }
  $g.DrawEllipse((New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(90, 255, 255, 255), 1.5)), 2, 2, 41, 41)
})
$script:arrastre = $null
$script:seMovio = $false
$flotante.add_MouseDown({
  if ($_.Button -eq [System.Windows.Forms.MouseButtons]::Left) {
    $script:arrastre = @{ raton = [System.Windows.Forms.Cursor]::Position; forma = $flotante.Location }
    $script:seMovio = $false
  }
})
$flotante.add_MouseMove({
  if (-not $script:arrastre) { return }
  $ahora = [System.Windows.Forms.Cursor]::Position
  $dx = $ahora.X - $script:arrastre.raton.X
  $dy = $ahora.Y - $script:arrastre.raton.Y
  if ([Math]::Abs($dx) -gt 5 -or [Math]::Abs($dy) -gt 5) { $script:seMovio = $true }
  if ($script:seMovio) {
    $flotante.Location = New-Object System.Drawing.Point(($script:arrastre.forma.X + $dx), ($script:arrastre.forma.Y + $dy))
  }
})
$flotante.add_MouseUp({
  if ($_.Button -ne [System.Windows.Forms.MouseButtons]::Left) { return }
  if ($script:seMovio) { Set-Content -Path $rutaFlotante -Value "$($flotante.Location.X),$($flotante.Location.Y)" }
  else { Click-Alternar }
  $script:arrastre = $null
})
$flotante.ContextMenuStrip = $menu
$flotante.Show()

# Cada 150 ms: leer estados pendientes. Cada vuelta sin conexion: reintentar (el dictado pudo
# arrancar o reiniciarse); asi el icono sobrevive a la vida y muerte del pipeline.
$reloj = New-Object System.Windows.Forms.Timer
$reloj.Interval = 150
$script:ticksSinConexion = 0
$script:ticksArrancando = 0
$reloj.add_Tick({
  if (-not $script:flujo) {
    $script:ticksSinConexion++
    if ($script:estado -eq 'arrancando') {
      $script:ticksArrancando++
      if ($script:ticksArrancando -ge 600) { $script:ticksArrancando = 0; Pon-Estado 'apagado' }  # ~90 s sin conectar: no arranco
    } else { $script:ticksArrancando = 0 }
    if ($script:ticksSinConexion -ge 14) { $script:ticksSinConexion = 0; Conecta }  # ~2 s
    return
  }
  try {
    # Un cierre del otro lado NO enciende DataAvailable ni apaga .Connected (solo refleja la
    # ultima operacion): el EOF se detecta con Poll(lectura) + 0 bytes disponibles.
    $s = $script:cliente.Client
    if ($s.Poll(0, [System.Net.Sockets.SelectMode]::SelectRead) -and $s.Available -eq 0) { Desconecta; return }
    while ($script:flujo.DataAvailable) {
      $b = New-Object byte[] 512
      $n = $script:flujo.Read($b, 0, $b.Length)
      if ($n -le 0) { Desconecta; return }
      $script:resto += [System.Text.Encoding]::UTF8.GetString($b, 0, $n)
      while (($corte = $script:resto.IndexOf("`n")) -ne -1) {
        $linea = $script:resto.Substring(0, $corte).Trim()
        $script:resto = $script:resto.Substring($corte + 1)
        if ($linea -match '^estado (\w+)$' -and $textos.ContainsKey($Matches[1])) { Pon-Estado $Matches[1] }
      }
    }
    if (-not $script:cliente.Connected) { Desconecta }
  } catch { Desconecta }
})
$reloj.Start()

try {
  [System.Windows.Forms.Application]::Run()
} finally {
  $reloj.Stop(); $icono.Visible = $false; $icono.Dispose(); Desconecta; $mutex.ReleaseMutex()
}
