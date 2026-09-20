# Abre el camino de red para dictar desde el celular: el telefono (misma wifi) debe llegar al
# Next que corre DENTRO de WSL2, y Windows no reenvia ese puerto solo. Este script — que se
# corre UNA vez en PowerShell COMO ADMINISTRADOR — hace exactamente dos cosas y nada mas:
#   1. portproxy: el puerto <Puerto> de Windows reenvia al mismo puerto de la IP de WSL2;
#   2. regla de firewall de ENTRADA para ese puerto, solo redes privadas.
# -Quitar deshace ambas. No toca nada mas del firewall ni de la red.
param(
  [int]$Puerto = 3000,
  [switch]$Quitar
)
$esAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $esAdmin) { Write-Error 'correlo en PowerShell como Administrador'; exit 1 }

$regla = "Dictado movil $Puerto"
if ($Quitar) {
  netsh interface portproxy delete v4tov4 listenport=$Puerto listenaddress=0.0.0.0 | Out-Null
  Remove-NetFirewallRule -DisplayName $regla -ErrorAction SilentlyContinue
  Write-Output "camino cerrado: portproxy y regla '$regla' quitados"
  exit 0
}

$ipWsl = (wsl hostname -I).Trim().Split(' ')[0]
if (-not $ipWsl) { Write-Error 'no pude leer la IP de WSL2 (wsl hostname -I)'; exit 1 }
netsh interface portproxy delete v4tov4 listenport=$Puerto listenaddress=0.0.0.0 2>$null | Out-Null
netsh interface portproxy add v4tov4 listenport=$Puerto listenaddress=0.0.0.0 connectport=$Puerto connectaddress=$ipWsl | Out-Null
if (-not (Get-NetFirewallRule -DisplayName $regla -ErrorAction SilentlyContinue)) {
  New-NetFirewallRule -DisplayName $regla -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Puerto -Profile Private | Out-Null
}
# La regla es de perfil PRIVADO: si la wifi esta como PUBLICA, no aplica y el telefono no
# llega aunque el portproxy este bien (vivido el 2026-09-20). Se avisa y se ofrece marcarla
# privada — es lo correcto para una red de casa y deja el puerto cerrado en redes publicas de verdad.
$publicas = Get-NetConnectionProfile | Where-Object { $_.NetworkCategory -eq 'Public' }
foreach ($p in $publicas) {
  Write-Warning "la red '$($p.Name)' esta como PUBLICA: la regla de firewall (privada) NO aplica y el telefono no llegara."
  Write-Output "  para arreglarlo (red de casa): Set-NetConnectionProfile -Name '$($p.Name)' -NetworkCategory Private"
}

$ipLan = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notmatch 'Loopback|vEthernet' -and $_.IPAddress -notlike '169.*' } | Select-Object -First 1).IPAddress
Write-Output "camino abierto: Windows:$Puerto → WSL2 $ipWsl`:$Puerto (solo redes privadas)"
Write-Output "en el telefono (misma wifi): https://$ipLan`:$Puerto/dictar"
Write-Output "OJO: la IP de WSL2 cambia al reiniciar; si el cel deja de llegar, vuelve a correr este script."
