import { create } from 'zustand'

/**
 * Andamio del estado de una feature (Zustand). `.template/` se copia entero al crear una
 * feature nueva, asi que este archivo es el punto de partida: renombra el store, cambia el
 * estado y borra lo que no uses.
 *
 * Zustand se usa para el estado que **varios componentes de la feature comparten** y que no
 * viene del servidor: un panel abierto, un filtro, un paso de asistente. Lo que vive en la
 * base NO se duplica aqui — eso lo traen los Server Components o `services/`, y tener la
 * misma verdad en dos sitios es como se desincroniza una UI.
 */
interface FeatureState {
  cargando: boolean
  error: string | null
  setCargando: (cargando: boolean) => void
  setError: (error: string | null) => void
  reinicia: () => void
}

const inicial = { cargando: false, error: null }

export const useFeatureStore = create<FeatureState>((set) => ({
  ...inicial,
  setCargando: (cargando) => set({ cargando }),
  setError: (error) => set({ error }),
  reinicia: () => set(inicial),
}))
