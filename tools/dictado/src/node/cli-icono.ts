/**
 * `dictado icono instala|quita`: deja (o retira) el icono de la barra para que arranque solo
 * al iniciar sesion en Windows. No toca el registro ni pide permisos: copia
 * `windows/icono-barra.ps1` a `%LOCALAPPDATA%\dictado\` —PowerShell no siempre acepta `-File`
 * en `\\wsl.localhost\...`, y una copia local sobrevive aunque WSL este apagado— y deja un
 * `.cmd` de dos lineas en la carpeta Inicio del usuario. Anclarlo a la barra a mano es cosa
 * del humano: Windows no deja anclar por programa, y esta bien que asi sea.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PUERTO_ICONO } from './icono.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const RUTA_ICONO_PS1 = join(RAIZ, 'windows', 'icono-barra.ps1');

/** Expande una variable de entorno DE WINDOWS y devuelve su ruta como ruta WSL. */
export function carpetaWindows(variable: string): { windows: string; wsl: string } {
  const windows = execFileSync('cmd.exe', ['/c', `echo %${variable}%`], { cwd: '/mnt/c', encoding: 'utf8' }).trim();
  if (!windows || windows.includes('%')) throw new Error(`no pude leer %${variable}% del lado Windows`);
  const wsl = execFileSync('wslpath', ['-u', windows], { encoding: 'utf8' }).trim();
  return { windows, wsl };
}

/** Copia `icono-barra.ps1` al lado Windows y devuelve su ruta ALLI (para `-File`). */
export function copiaIconoAWindows(): { windows: string; wsl: string } {
  const local = carpetaWindows('LOCALAPPDATA');
  const carpeta = join(local.wsl, 'dictado');
  mkdirSync(carpeta, { recursive: true });
  copyFileSync(RUTA_ICONO_PS1, join(carpeta, 'icono-barra.ps1'));
  return { windows: `${local.windows}\\dictado\\icono-barra.ps1`, wsl: join(carpeta, 'icono-barra.ps1') };
}

export function ordenIcono(posicionales: readonly string[]): void {
  const que = posicionales[0] ?? '';
  const local = carpetaWindows('LOCALAPPDATA');
  const inicio = carpetaWindows('APPDATA');
  const carpetaCmd = join(inicio.wsl, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
  const rutaCmd = join(carpetaCmd, 'dictado-icono.cmd');
  const carpetaPs1 = join(local.wsl, 'dictado');
  const rutaPs1 = join(carpetaPs1, 'icono-barra.ps1');

  if (que === 'instala') {
    copiaIconoAWindows();
    const distro = process.env['WSL_DISTRO_NAME'] ?? '';
    const cmd = [
      '@echo off',
      `start "" powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%LOCALAPPDATA%\\dictado\\icono-barra.ps1" -Puerto ${PUERTO_ICONO} -RaizWsl "${RAIZ}" -Distro "${distro}"`,
      '',
    ].join('\r\n');
    writeFileSync(rutaCmd, cmd);
    execFileSync('cmd.exe', ['/c', `${inicio.windows}\\Microsoft\\Windows\\Start Menu\\Programs\\Startup\\dictado-icono.cmd`], { cwd: '/mnt/c' });
    console.log(`icono instalado y lanzado. Aparece en el area de notificacion (junto al reloj):`);
    console.log(`  gris = apagado o en espera · rojo = escuchando · ambar = transcribiendo`);
    console.log(`  un click lo enciende o lo apaga; si el dictado no corre, el click lo arranca.`);
    console.log(`Arrancara solo en cada inicio de sesion (${rutaCmd}).`);
    console.log(`Para tenerlo SIEMPRE visible: arrastra el icono desde la flecha ^ del area de notificacion a la barra.`);
    console.log(`Tras actualizar la herramienta, repite: dictado icono instala`);
    return;
  }
  if (que === 'quita') {
    rmSync(rutaCmd, { force: true });
    rmSync(rutaPs1, { force: true });
    console.log('icono desinstalado del inicio de sesion. Si sigue visible, menu derecho sobre el → «Quitar este icono».');
    return;
  }
  console.log('uso: dictado icono instala | quita');
}
