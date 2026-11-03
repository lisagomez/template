import type { Config } from 'tailwindcss'
import animate from 'tailwindcss-animate'
import { MARCA } from './src/shared/marca/tokens.generado'

/**
 * Tema cableado a los tokens: los colores salen de variables CSS que GENERA `scripts/marca/genera.mjs`
 * (`src/app/marca.generada.css`) desde `.claude/design-systems/turno-25/tokens.json`. Cambiar la marca
 * es tocar los tokens y regenerar, no este archivo ni los componentes.
 *
 * Además de shadcn: `marca` (el naranja de Turno 25 y su variante suave para el resultado), los estados
 * (`exito`, `aviso`, `peligro`, `info`) y `sutil`. OJO: `accent` es el de shadcn (hover suave), no el
 * naranja de la marca, que aquí es `primary` y `marca`.
 */
const hsl = (v: string) => `hsl(var(--${v}) / <alpha-value>)`
const estado = (e: string) => ({ DEFAULT: hsl(e), suave: hsl(`${e}-suave`), texto: hsl(`${e}-texto`) })

const config: Config = {
  darkMode: ['class'],
  // mobile-native (Emil Kowalski) fix 1: `hover:` solo donde hay puntero; en el teléfono no se queda pegado tras tocar.
  future: { hoverOnlyWhenSupported: true },
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-sans)', ...MARCA.tipografia.sans.slice(1)],
        mono: ['var(--font-mono)', ...MARCA.tipografia.mono.slice(1)],
      },
      letterSpacing: {
        etiqueta: 'var(--t25-tracking-label)',
        nombre: 'var(--t25-tracking-nombre)',
        tight: 'var(--t25-tracking-tight)',
        display: 'var(--t25-tracking-display)',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      transitionTimingFunction: {
        DEFAULT: MARCA.movimiento.curvas.salida,
        out: MARCA.movimiento.curvas.salida,
        'in-out': MARCA.movimiento.curvas['entrada-salida'],
      },
      transitionDuration: {
        DEFAULT: MARCA.movimiento.duraciones.base,
        rapida: MARCA.movimiento.duraciones.rapida,
        base: MARCA.movimiento.duraciones.base,
        lenta: MARCA.movimiento.duraciones.lenta,
      },
      colors: {
        background: hsl('background'),
        foreground: hsl('foreground'),
        card: { DEFAULT: hsl('card'), foreground: hsl('card-foreground') },
        popover: { DEFAULT: hsl('popover'), foreground: hsl('popover-foreground') },
        primary: { DEFAULT: hsl('primary'), foreground: hsl('primary-foreground') },
        secondary: { DEFAULT: hsl('secondary'), foreground: hsl('secondary-foreground') },
        muted: { DEFAULT: hsl('muted'), foreground: hsl('muted-foreground') },
        accent: { DEFAULT: hsl('accent'), foreground: hsl('accent-foreground') },
        destructive: { DEFAULT: hsl('destructive'), foreground: hsl('destructive-foreground') },
        border: hsl('border'),
        input: hsl('input'),
        ring: hsl('ring'),
        marca: {
          DEFAULT: hsl('marca'), hover: hsl('marca-hover'), press: hsl('marca-press'), fg: hsl('marca-fg'),
          suave: hsl('marca-suave'), 'suave-fg': hsl('marca-suave-fg'), borde: hsl('marca-borde'),
        },
        sutil: hsl('texto-sutil'),
        'borde-fuerte': hsl('borde-fuerte'),
        exito: estado('exito'),
        aviso: estado('aviso'),
        peligro: estado('peligro'),
        info: estado('info'),
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [animate],
}

export default config
