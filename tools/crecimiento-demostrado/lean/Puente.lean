/-!
# Los teoremas del puente de ingresos (crecimiento-demostrado)

Lean 4 core, SIN Mathlib, toolchain pineado en `lean-toolchain`. Se demuestran UNA vez; en
ejecución el kernel de TypeScript (`src/kernel/teoremas.ts`) solo comprueba que las hipótesis se
cumplan con hechos de Γ. La correspondencia, enunciado por enunciado:

* `Cliente.clase` es la PARTICIÓN: cada miembro de T = U ∪ {A} tiene exactamente una clase. En
  ejecución, la regla `particion` comprueba que las clases calculadas sean disjuntas y exhaustivas;
  solo entonces existe esta función.
* `suma_particion` ↔ regla `suma_particion`: ΔR(T) = Σ ΔR(clase), sin hipótesis.
* `puente_clasico` ↔ teorema `puente_clasico`, con sus TRES hipótesis citadas como sumas, igual que
  en `teoremas.ts`: R_desde(N) = 0, R_hasta(L) = 0 y ΔR(Z) = 0.
* Todo en `Int`: el dinero son centavos enteros, y «cierra al centavo» es igualdad.
-/

namespace CrecimientoDemostrado

/-- N nuevos · K_exp, K_con, K_flat retenidos · L perdidos · Z solo ajustes · A público en general. -/
inductive Clase where
  | N | Kexp | Kcon | Kflat | L | Z | A
  deriving DecidableEq

/-- Un miembro de T: su clase y su ingreso (centavos) en el periodo `desde` (r0) y `hasta` (r1). -/
structure Cliente where
  clase : Clase
  r0 : Int
  r1 : Int

def suma (f : Cliente → Int) : List Cliente → Int
  | [] => 0
  | x :: xs => f x + suma f xs

/-- f restringida a una clase: fuera de ella vale cero. -/
def de (c : Clase) (f : Cliente → Int) : Cliente → Int :=
  fun x => if x.clase = c then f x else 0

def delta (x : Cliente) : Int := x.r1 - x.r0
def r0 (x : Cliente) : Int := x.r0
def r1 (x : Cliente) : Int := x.r1

/-- Suma sobre una partición: el total es la suma de las siete clases. -/
theorem suma_particion (l : List Cliente) (f : Cliente → Int) :
    suma f l = suma (de .N f) l + suma (de .Kexp f) l + suma (de .Kcon f) l + suma (de .Kflat f) l
      + suma (de .L f) l + suma (de .Z f) l + suma (de .A f) l := by
  induction l with
  | nil => simp [suma]
  | cons x xs ih =>
    simp only [suma, de] at ih ⊢
    cases h : x.clase <;> simp <;> omega

/-- ΔR de una clase = R_hasta de la clase − R_desde de la clase. -/
theorem suma_delta (c : Clase) (l : List Cliente) :
    suma (de c delta) l = suma (de c r1) l - suma (de c r0) l := by
  induction l with
  | nil => simp [suma]
  | cons x xs ih =>
    simp only [suma, de, delta, r0, r1] at ih ⊢
    split <;> omega

/-- ΔR(T) = R_hasta(T) − R_desde(T). -/
theorem delta_total (l : List Cliente) : suma delta l = suma r1 l - suma r0 l := by
  induction l with
  | nil => simp [suma]
  | cons x xs ih =>
    simp only [suma, delta, r0, r1] at ih ⊢
    omega

/--
La forma CLÁSICA del puente. Sin sus hipótesis NO vale: un cliente perdido que recibe una nota de
crédito tiene R_hasta ≠ 0 (lo planta el generador en 2025-4T → 2026-1T), y ahí el kernel exige la
forma general (`suma_particion`).
-/
theorem puente_clasico (l : List Cliente)
    (hN : suma (de .N r0) l = 0)
    (hL : suma (de .L r1) l = 0)
    (hZ : suma (de .Z delta) l = 0) :
    suma delta l = suma (de .N r1) l - suma (de .L r0) l
      + suma (de .Kexp delta) l + suma (de .Kcon delta) l + suma (de .Kflat delta) l
      + suma (de .A delta) l := by
  have hp := suma_particion l delta
  have hn := suma_delta .N l
  have hl := suma_delta .L l
  omega

/-- Y sin las hipótesis, el contraejemplo: un perdido con una nota de −100 centavos. -/
example : ¬ (∀ l : List Cliente,
    suma delta l = suma (de .N r1) l - suma (de .L r0) l
      + suma (de .Kexp delta) l + suma (de .Kcon delta) l + suma (de .Kflat delta) l
      + suma (de .A delta) l) := by
  intro h
  have := h [⟨.L, 500, -100⟩]
  simp [suma, de, delta, r0] at this

end CrecimientoDemostrado
