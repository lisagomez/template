# Tecla global de @tu-scope/dictado para Windows. Se lanza A LA VISTA desde WSL2 con
# `dictado dictar --tecla`, que te dice antes que hace: este script sondea UNA tecla
# (por defecto Ctrl derecho, 0xA3) cada 15 ms con GetAsyncKeyState y avisa a dictado, por TCP
# a 127.0.0.1:<Puerto>, cuando baja y cuando sube. No lee ninguna otra tecla, no escribe nada,
# no toca el portapapeles y no sale a internet. Ctrl+C aqui lo cierra.
param(
  [int]$Puerto = 47123,
  [int]$Tecla = 0xA3
)
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class Teclado {
  [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int vKey);
}
"@
$cliente = New-Object System.Net.Sockets.TcpClient
$cliente.Connect('127.0.0.1', $Puerto)
$flujo = $cliente.GetStream()
$escritor = New-Object System.IO.StreamWriter($flujo)
$escritor.AutoFlush = $true
Write-Host ("dictado: tecla global 0x{0:X} conectada a 127.0.0.1:{1}. Mantenla para dictar; dos toques = manos libres. Ctrl+C cierra." -f $Tecla, $Puerto)
$abajo = $false
try {
  while ($cliente.Connected) {
    $estado = ([Teclado]::GetAsyncKeyState($Tecla) -band 0x8000) -ne 0
    if ($estado -and -not $abajo) { $abajo = $true; $escritor.WriteLine('abajo') }
    elseif (-not $estado -and $abajo) { $abajo = $false; $escritor.WriteLine('arriba') }
    Start-Sleep -Milliseconds 15
  }
} finally {
  $escritor.Dispose(); $cliente.Close()
}
