/** Asterisco de campo obligatorio (decorativo: la validación indica el error). */
export function Requerido() {
  return (
    <span aria-hidden="true" className="text-destructive">
      *
    </span>
  )
}
