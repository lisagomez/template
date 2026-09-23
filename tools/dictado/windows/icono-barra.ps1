# Icono de @tu-scope/dictado para la barra de Windows (area de notificacion) + la PILDORA
# flotante siempre visible, abajo al centro (la de sflow, MIT, (c) Daniel Carreon: mismas
# medidas). Se lanza desde WSL2 con `dictado dictar --icono` (a la vista: te lo dice antes) o
# solo, al iniciar sesion, con el .cmd que deja `dictado icono instala`. Que hace:
#   - pinta UN icono en la barra con el color del estado (gris = apagado/en espera, rojo =
#     escuchando, ambar = transcribiendo);
#   - pinta la pildora: en reposo, 34x34 con el logo; escuchando, 100x34 con 20 barras que
#     siguen la voz; procesando, 52x34 con puntos girando; hecho, palomita verde; error, X roja
#     (los dos ultimos se van solos: lo decide el dictado, aqui solo se pinta lo que llega);
#   - un CLICK en cualquiera manda la palabra `alternar` al dictado por TCP a 127.0.0.1:<Puerto>;
#   - si el dictado no esta corriendo y conoce la ruta (-RaizWsl), el click lo arranca
#     con wsl.exe y `npm run en-vivo`;
#   - lee del socket lineas `estado <nombre>`, `pildora <visual>` y `barras <20 enteros>`; lo
#     que no entiende lo ignora;
#   - la pildora se arrastra (posicion recordada en flotante.txt junto a este script) y se
#     oculta o vuelve desde el menu derecho; «Abrir historial» abre /historial (buscar, corregir,
#     borrar, exportar) o, sin la app, `dictado historial` en una terminal.
# No lee el teclado, no escribe nada (salvo su posicion y, con -Medir, un registro de cuadros y
# capturas de si misma), no toca el portapapeles y no sale a internet.
# Un Mutex con nombre garantiza UN icono aunque se lance dos veces. Menu derecho: salir.
param(
  [int]$Puerto = 47124,
  [string]$RaizWsl = '',
  [string]$Distro = '',
  [string]$Historial = 'http://localhost:3000/historial',
  [switch]$Medir
)
# Medidas de la pildora (las de sflow).
$ANCHO_IDLE = 34; $ANCHO_ESCUCHANDO = 100; $ANCHO_ESTADO = 52; $ALTO = 34; $RADIO = 17
$OPACIDAD = 0.90; $MARGEN_ABAJO = 14; $LOGO = 22; $NUM_BARRAS = 20
$MS_CUADRO = 25   # el Timer de WinForms va a saltos de ~15,6 ms: 25 → ~31 cuadros/s (16 → ~39, 33 → ~21; medido el 2026-09-20)
$MS_REPOSO = 100  # sin nada que animar, el reloj se relaja: menos CPU en espera
$script:registro = if ($Medir) { Join-Path $PSScriptRoot 'pildora-medicion.txt' } else { $null }
function Anota([string]$linea) { if ($script:registro) { Add-Content -Path $script:registro -Value ("{0} {1}" -f [DateTimeOffset]::Now.ToUnixTimeMilliseconds(), $linea) } }
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
# DPI: sin esto Windows escala la ventana a ciegas (borrosa) y las coordenadas de pantalla no
# casan con las fisicas (las capturas salian de otro sitio, medido el 2026-09-20). Se declara el
# proceso consciente del DPI y se escalan a mano las medidas logicas de sflow.
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class Dpi {
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern uint GetDpiForSystem();
}
"@
[void][Dpi]::SetProcessDPIAware()
$ESCALA = [Math]::Max(1.0, [Dpi]::GetDpiForSystem() / 96.0)
$px = { param([double]$logico) [int][Math]::Round($logico * $ESCALA) }

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
$script:visual = 'apagado'      # idle | escuchando | procesando | hecho | error | apagado | arrancando
$script:barras = New-Object 'int[]' $NUM_BARRAS
$script:colaBarras = New-Object System.Collections.Generic.Queue[int[]]   # llegan a rafagas (un cuadro por 32 ms de audio, en trozos de ~128 ms): se pintan de uno en uno
$script:fase = 0                # para los puntos que giran
$script:cuadrosPintados = 0
$script:capturasHechas = @{}

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
  Anota "estado $nombre"
  # Sin dictado, la pildora lo dice ella (apagado/arrancando); con dictado manda `pildora`.
  if ($nombre -in @('apagado', 'arrancando')) { Pon-Visual $nombre }
  elseif ($script:visual -in @('apagado', 'arrancando')) { Pon-Visual 'idle' }
}
function Pon-Visual([string]$nombre) {
  if ($script:visual -eq $nombre) { return }
  $anterior = $script:visual
  $script:visual = $nombre
  Anota "pildora $nombre"
  # Con -Medir, al apagarse el dictado tras una sesion: una foto del menu (abierto por codigo) y listo.
  if ($script:registro -and $nombre -eq 'apagado' -and $anterior -ne 'arrancando' -and -not $script:capturasHechas.ContainsKey('menu')) { $script:capturasHechas['menu'] = $true; $script:menuPendiente = 12 }
  if ($nombre -ne 'escuchando') { for ($i = 0; $i -lt $NUM_BARRAS; $i++) { $script:barras[$i] = 0 } }
  if ($script:flotante) { Ajusta-Pildora; $script:flotante.Invalidate() }
}
function Ancho-De([string]$visual) {
  $logico = switch ($visual) { 'escuchando' { $ANCHO_ESCUCHANDO } 'procesando' { $ANCHO_ESTADO } 'hecho' { $ANCHO_ESTADO } 'error' { $ANCHO_ESTADO } default { $ANCHO_IDLE } }
  return (& $px $logico)
}
# La pildora crece hacia la derecha desde su borde izquierdo si esta anclada por el usuario;
# abajo al centro (sin posicion guardada) crece simetrica para seguir centrada.
function Ajusta-Pildora {
  $f = $script:flotante
  $ancho = Ancho-De $script:visual
  if ($f.Width -eq $ancho) { return }
  if ($script:centrada) { $f.Left = $f.Left + [int](($f.Width - $ancho) / 2) }
  $f.Width = $ancho
  $f.Region = Region-Redonda $ancho (& $px $ALTO)
}
function Region-Redonda([int]$w, [int]$h) {
  $ruta = New-Object System.Drawing.Drawing2D.GraphicsPath
  $ruta.AddArc(0, 0, $h, $h, 90, 180); $ruta.AddArc($w - $h, 0, $h, $h, 270, 180); $ruta.CloseFigure()
  return New-Object System.Drawing.Region($ruta)
}
function Desconecta {
  if ($script:cliente) { $script:cliente.Close() }
  $script:cliente = $null; $script:flujo = $null; $script:escritor = $null; $script:resto = ''
  if ($script:estado -ne 'arrancando') { Pon-Estado 'apagado' }
}
# Conectar sin bloquear: por el puente localhost de WSL2 un Connect a un puerto sin nadie puede
# tardar segundos, y con el reloj a cuadro eso congelaba la pildora (medido el 2026-09-20). Se
# empieza aqui y se termina en un tick posterior cuando el intento acabo.
$script:conectando = $null
function Conecta {
  if ($script:conectando) { return }
  try {
    $c = New-Object System.Net.Sockets.TcpClient
    $script:conectando = @{ c = $c; ar = $c.BeginConnect('127.0.0.1', $Puerto, $null, $null) }
  } catch { $script:conectando = $null }
}
function Termina-Conexion {
  if (-not $script:conectando -or -not $script:conectando.ar.IsCompleted) { return }
  $c = $script:conectando.c; $ar = $script:conectando.ar; $script:conectando = $null
  try {
    $c.EndConnect($ar)
    $script:cliente = $c
    $script:flujo = $c.GetStream()
    $script:escritor = New-Object System.IO.StreamWriter($script:flujo)
    $script:escritor.AutoFlush = $true
    Pon-Estado 'inactivo'  # el estado real llega en la primera linea
  } catch { try { $c.Close() } catch {} }
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
[void]$menu.Items.Add('Abrir historial').add_Click({
  # La pagina /historial (buscar, corregir, borrar, exportar) si la app responde; si no, el historial en una terminal.
  $responde = $false
  try { $r = Invoke-WebRequest -Uri ($Historial -replace '/historial.*$', '/api/laboratorio/estado') -UseBasicParsing -TimeoutSec 2; $responde = ($r.StatusCode -eq 200) } catch { $responde = $false }
  if ($responde) { Start-Process $Historial }
  elseif ($RaizWsl) {
    $argumentos = @(); if ($Distro) { $argumentos += @('-d', $Distro) }
    $argumentos += @('--', 'bash', '-lc', "cd '$RaizWsl' && node dist/node/cli.js historial; echo; read -p 'Enter para cerrar'")
    Start-Process 'wsl.exe' -ArgumentList $argumentos
  } else { $icono.ShowBalloonTip(4000, 'Dictado', 'La app no responde y no conozco la ruta del dictado.', 'Info') }
})
[void]$menu.Items.Add('Ajustes').add_Click({
  # La pagina /ajustes (misma app que el historial): motor, tecla, pegado, audio, sonidos. Si la app no responde, la terminal.
  $ajustes = $Historial -replace '/historial.*$', '/ajustes'
  $responde = $false
  try { $r = Invoke-WebRequest -Uri ($Historial -replace '/historial.*$', '/api/laboratorio/estado') -UseBasicParsing -TimeoutSec 2; $responde = ($r.StatusCode -eq 200) } catch { $responde = $false }
  if ($responde) { Start-Process $ajustes }
  elseif ($RaizWsl) {
    $argumentos = @(); if ($Distro) { $argumentos += @('-d', $Distro) }
    $argumentos += @('--', 'bash', '-lc', "cd '$RaizWsl' && node dist/node/cli.js ajustes; echo; read -p 'Enter para cerrar'")
    Start-Process 'wsl.exe' -ArgumentList $argumentos
  } else { $icono.ShowBalloonTip(4000, 'Dictado', 'La app no responde y no conozco la ruta del dictado.', 'Info') }
})
# Oculta se RECUERDA (pildora-oculta.txt junto a este script): sin eso volvia en cada arranque.
[void]$menu.Items.Add('Mostrar/ocultar la pildora').add_Click({
  if ($script:flotante.Visible) { $script:flotante.Hide(); Set-Content -Path $rutaOculta -Value 'oculta' }
  else { $script:flotante.Show(); Remove-Item -Path $rutaOculta -ErrorAction SilentlyContinue }
})
[void]$menu.Items.Add('Quitar este icono').add_Click({ $icono.Visible = $false; [System.Windows.Forms.Application]::Exit() })
$icono.ContextMenuStrip = $menu

# ── La pildora: un ovalo siempre encima, abajo al centro (o donde la dejes), con el logo, las
# barras, los puntos, la palomita o la X segun lo que diga el dictado. Un click = alternar. ──
$rutaFlotante = Join-Path $PSScriptRoot 'flotante.txt'
$rutaOculta = Join-Path $PSScriptRoot 'pildora-oculta.txt'
$script:flotante = New-Object System.Windows.Forms.Form
$flotante = $script:flotante
$flotante.FormBorderStyle = 'None'
$flotante.TopMost = $true
$flotante.ShowInTaskbar = $false
$flotante.StartPosition = 'Manual'
$ALTO_PX = & $px $ALTO
$flotante.Size = New-Object System.Drawing.Size((& $px $ANCHO_IDLE), $ALTO_PX)
$flotante.BackColor = [System.Drawing.Color]::FromArgb(28, 28, 30)
$flotante.Opacity = $OPACIDAD
$flotante.Region = Region-Redonda (& $px $ANCHO_IDLE) $ALTO_PX
$flotante.GetType().GetProperty('DoubleBuffered', [System.Reflection.BindingFlags]'Instance,NonPublic').SetValue($flotante, $true, $null)
$area = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
$script:centrada = $true
$flotante.Location = New-Object System.Drawing.Point([int]($area.Left + ($area.Width - (& $px $ANCHO_IDLE)) / 2), ($area.Bottom - $ALTO_PX - (& $px $MARGEN_ABAJO)))
if (Test-Path $rutaFlotante) {
  $partes = (Get-Content $rutaFlotante -First 1) -split ','
  if ($partes.Count -eq 2) {
    $x = [Math]::Min([Math]::Max([int]$partes[0], $area.Left), $area.Right - (& $px $ANCHO_ESCUCHANDO))
    $y = [Math]::Min([Math]::Max([int]$partes[1], $area.Top), $area.Bottom - $ALTO_PX)
    $flotante.Location = New-Object System.Drawing.Point($x, $y)
    $script:centrada = $false
  }
}
$pincelFondo = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(28, 28, 30))
$plumaBorde = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(70, 255, 255, 255), 1)
$colorLogo = @{ idle = [System.Drawing.Color]::FromArgb(200, 200, 205); apagado = [System.Drawing.Color]::FromArgb(110, 110, 110); arrancando = [System.Drawing.Color]::FromArgb(240, 180, 40) }
$colorBarras = [System.Drawing.Color]::FromArgb(230, 60, 60)
$colorPuntos = [System.Drawing.Color]::FromArgb(240, 160, 30)
$colorHecho = [System.Drawing.Color]::FromArgb(60, 200, 90)
$colorError = [System.Drawing.Color]::FromArgb(230, 60, 60)
# Pinceles y plumas una sola vez: crearlos en cada cuadro es lo que mas CPU comia (medido).
$pincelBarras = New-Object System.Drawing.SolidBrush($colorBarras)
$pincelesPuntos = @((New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(110, $colorPuntos))), (New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, $colorPuntos))))
$plumaHecho = New-Object System.Drawing.Pen($colorHecho, 3); $plumaHecho.StartCap = 'Round'; $plumaHecho.EndCap = 'Round'; $plumaHecho.LineJoin = 'Round'
$plumaError = New-Object System.Drawing.Pen($colorError, 3); $plumaError.StartCap = 'Round'; $plumaError.EndCap = 'Round'
$pincelesLogo = @{}; foreach ($k in $colorLogo.Keys) { $pincelesLogo[$k] = @{ pincel = (New-Object System.Drawing.SolidBrush($colorLogo[$k])); pluma = (New-Object System.Drawing.Pen($colorLogo[$k], 2)) } }
function Pinta-Logo([System.Drawing.Graphics]$g, [int]$x, [int]$y, [string]$clave) {
  # Un microfono de 22 px: capsula redondeada, arco y pie. Es el «logo» del dictado.
  $pincel = $pincelesLogo[$clave].pincel
  $pluma = $pincelesLogo[$clave].pluma
  $g.FillRectangle($pincel, $x + 8, $y + 1, 6, 11)
  $g.FillEllipse($pincel, $x + 8, $y - 1, 6, 5); $g.FillEllipse($pincel, $x + 8, $y + 9, 6, 5)
  $g.DrawArc($pluma, $x + 5, $y + 5, 12, 12, 0, 180)
  $g.DrawLine($pluma, $x + 11, $y + 17, $x + 11, $y + 20); $g.DrawLine($pluma, $x + 7, $y + 20, $x + 15, $y + 20)
}
$flotante.add_Paint({
  $g = $_.Graphics
  $g.SmoothingMode = 'AntiAlias'
  $g.ScaleTransform($ESCALA, $ESCALA)   # se dibuja en las medidas logicas de sflow
  $w = [int]($flotante.Width / $ESCALA)
  $g.FillRectangle($pincelFondo, 0, 0, $w, $ALTO)
  $g.DrawArc($plumaBorde, 0, 0, $ALTO - 1, $ALTO - 1, 90, 180); $g.DrawArc($plumaBorde, $w - $ALTO, 0, $ALTO - 1, $ALTO - 1, 270, 180)
  $g.DrawLine($plumaBorde, $RADIO, 0, $w - $RADIO, 0); $g.DrawLine($plumaBorde, $RADIO, $ALTO - 1, $w - $RADIO, $ALTO - 1)
  $v = $script:visual
  $medio = [int]($ALTO / 2)
  switch ($v) {
    'escuchando' {
      # 20 barras de 3 px con 1 px de hueco, centradas verticalmente; altura 2..28 px segun 0-100.
      $x0 = [int](($w - ($NUM_BARRAS * 4 - 1)) / 2)
      for ($i = 0; $i -lt $NUM_BARRAS; $i++) {
        $h = 2 + [int](26 * $script:barras[$i] / 100)
        $g.FillRectangle($pincelBarras, $x0 + $i * 4, $medio - [int]($h / 2), 3, $h)
      }
    }
    'procesando' {
      # Tres puntos que giran: el mas brillante avanza con la fase (30 grados por cuadro de 50 ms en sflow; aqui por cuadro).
      $vivo = [int]($script:fase / 3) % 3
      for ($k = 0; $k -lt 3; $k++) {
        $g.FillEllipse($pincelesPuntos[[int]($k -eq $vivo)], [int]($w / 2) - 11 + $k * 8, $medio - 3, 6, 6)
      }
    }
    'hecho' {
      $cx = [int]($w / 2)
      $g.DrawLines($plumaHecho, [System.Drawing.Point[]]@((New-Object System.Drawing.Point(($cx - 8), $medio)), (New-Object System.Drawing.Point(($cx - 2), ($medio + 6))), (New-Object System.Drawing.Point(($cx + 9), ($medio - 6)))))
    }
    'error' {
      $cx = [int]($w / 2)
      $g.DrawLine($plumaError, $cx - 6, $medio - 6, $cx + 6, $medio + 6); $g.DrawLine($plumaError, $cx + 6, $medio - 6, $cx - 6, $medio + 6)
    }
    default {
      $clave = if ($pincelesLogo.ContainsKey($v)) { $v } else { 'idle' }
      Pinta-Logo $g ([int](($w - $LOGO) / 2)) ([int](($ALTO - $LOGO) / 2)) $clave
    }
  }
  $script:cuadrosPintados++
  if ($script:registro -and $script:visual -ne 'apagado') {
    # Con -Medir: una captura de la propia pildora por visual (y dos distintas escuchando: cuadros 20 y 50).
    $script:cuadrosEscucha = if ($v -eq 'escuchando') { $script:cuadrosEscucha + 1 } else { 0 }
    $clave = if ($v -eq 'escuchando') { if ($script:cuadrosEscucha -eq 12) { 'escuchando-1' } elseif ($script:cuadrosEscucha -eq 40) { 'escuchando-2' } else { $null } } else { $v }
    if ($clave -and -not $script:capturasHechas.ContainsKey($clave)) { $script:capturasHechas[$clave] = $true; $script:capturaPendiente = $clave }
  }
})
function Captura-Pildora([string]$clave) {
  # Foto de la pantalla en la region de la pildora (mas un marco), para la evidencia. Solo con -Medir.
  try {
    $b = $flotante.Bounds; $margen = 8
    $bmp = New-Object System.Drawing.Bitmap(($b.Width + 2 * $margen), ($b.Height + 2 * $margen))
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.CopyFromScreen(($b.Left - $margen), ($b.Top - $margen), 0, 0, $bmp.Size)
    $g.Dispose()
    $bmp.Save((Join-Path $PSScriptRoot ("captura-{0}.png" -f $clave)), [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Anota "captura $clave"
  } catch { Anota "captura-fallo $clave $($_.Exception.Message)" }
}
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
  if ($script:seMovio) { $script:centrada = $false; Set-Content -Path $rutaFlotante -Value "$($flotante.Location.X),$($flotante.Location.Y)" }
  else { Click-Alternar }
  $script:arrastre = $null
})
$flotante.ContextMenuStrip = $menu
if (-not (Test-Path $rutaOculta)) { $flotante.Show() }

# Cada 33 ms (un cuadro): leer lo pendiente del socket (estado, pildora, barras) y repintar si
# algo cambio. Sin conexion, reintentar cada ~2 s: asi el icono sobrevive a la vida y muerte
# del pipeline. Con -Medir, cada segundo anota los cuadros pintados y la CPU del proceso.
$reloj = New-Object System.Windows.Forms.Timer
$reloj.Interval = $MS_CUADRO
$script:ticksMedicion = 0
$script:cpuAntes = (Get-Process -Id $PID).TotalProcessorTime
$script:bytesLeidos = 0
$script:ticksSinConexion = 0
$script:ticksArrancando = 0
$reloj.add_Tick({
  # El reloj corre a cuadro (25 ms) solo con algo que animar; en reposo, cada 100 ms.
  $activo = ($script:visual -in @('escuchando', 'procesando')) -or $script:menuPendiente -or $script:capturaPendiente -or ($script:colaBarras.Count -gt 0)
  $intervalo = if ($activo) { $MS_CUADRO } else { $MS_REPOSO }
  if ($reloj.Interval -ne $intervalo) { $reloj.Interval = $intervalo }
  if ($script:capturaPendiente) { $c = $script:capturaPendiente; $script:capturaPendiente = $null; Captura-Pildora $c }
  if ($script:menuPendiente) {
    $script:menuPendiente--
    if ($script:menuPendiente -eq 6) { $menu.Show($flotante, (New-Object System.Drawing.Point(0, -($menu.Items.Count * 24 + 12)))) }
    if ($script:menuPendiente -eq 0) {
      try {
        $r = $menu.Bounds; $bmp = New-Object System.Drawing.Bitmap(($r.Width + 16), ($r.Height + $ALTO + 32))
        $g = [System.Drawing.Graphics]::FromImage($bmp); $g.CopyFromScreen(($r.Left - 8), ($r.Top - 8), 0, 0, $bmp.Size); $g.Dispose()
        $bmp.Save((Join-Path $PSScriptRoot 'captura-menu.png'), [System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose(); Anota 'captura menu'
      } catch { Anota "captura-fallo menu $($_.Exception.Message)" }
      $menu.Close()
    }
  }
  if ($script:visual -eq 'procesando') { $script:fase++; if ($script:fase % 2 -eq 0) { $flotante.Invalidate() } }
  if ($script:registro) {
    if (-not $script:msMedicion) { $script:msMedicion = [DateTimeOffset]::Now.ToUnixTimeMilliseconds() }
    if ([DateTimeOffset]::Now.ToUnixTimeMilliseconds() - $script:msMedicion -ge 1000) {
      $script:msMedicion = [DateTimeOffset]::Now.ToUnixTimeMilliseconds()
      $cpu = (Get-Process -Id $PID).TotalProcessorTime
      Anota ("medida visual={0} cuadros={1} cpuMs={2} bytes={3}" -f $script:visual, $script:cuadrosPintados, [int]($cpu - $script:cpuAntes).TotalMilliseconds, $script:bytesLeidos)
      $script:cpuAntes = $cpu; $script:cuadrosPintados = 0; $script:bytesLeidos = 0
    }
  }
  if (-not $script:flujo) {
    Termina-Conexion
    if ($script:flujo) { return }
    $script:ticksSinConexion++
    if ($script:estado -eq 'arrancando') {
      $script:ticksArrancando++
      if ($script:ticksArrancando -ge 600) { $script:ticksArrancando = 0; Pon-Estado 'apagado' }  # ~90 s sin conectar: no arranco
    } else { $script:ticksArrancando = 0 }
    if ($script:ticksSinConexion -ge 20) { $script:ticksSinConexion = 0; Conecta }  # ~2 s a 100 ms por tick
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
      $script:bytesLeidos += $n
      $script:resto += [System.Text.Encoding]::UTF8.GetString($b, 0, $n)
      while (($corte = $script:resto.IndexOf("`n")) -ne -1) {
        $linea = $script:resto.Substring(0, $corte).Trim()
        $script:resto = $script:resto.Substring($corte + 1)
        if ($linea -match '^estado (\w+)$' -and $textos.ContainsKey($Matches[1])) { Pon-Estado $Matches[1] }
        elseif ($linea -match '^pildora (\w+)$') { Pon-Visual $Matches[1] }
        elseif ($linea.StartsWith('barras ')) {
          # A la cola: un cuadro por tick. Si se acumulan mas de 6 (~200 ms), se tiran los viejos.
          $partes = $linea.Substring(7).Split(' ')
          if ($partes.Count -eq $NUM_BARRAS) {
            $script:colaBarras.Enqueue([int[]]$partes)
            while ($script:colaBarras.Count -gt 6) { [void]$script:colaBarras.Dequeue() }
          }
        }
        # Cualquier otra linea: de una version mas nueva; se ignora.
      }
    }
    if ($script:colaBarras.Count -gt 0 -and $script:visual -eq 'escuchando') {
      $script:barras = $script:colaBarras.Dequeue()
      $flotante.Invalidate()
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
