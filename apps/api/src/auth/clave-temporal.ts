import { randomInt } from 'node:crypto';

/** Contraseña temporal legible (sin 0/O ni 1/l/I), con letras y números. */
export function generarClaveTemporal(largo = 12): string {
  const letras = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
  const digitos = '23456789';
  const todos = letras + digitos;
  const caracteres = [letras[randomInt(letras.length)], digitos[randomInt(digitos.length)]];
  while (caracteres.length < largo) caracteres.push(todos[randomInt(todos.length)]);
  for (let i = caracteres.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [caracteres[i], caracteres[j]] = [caracteres[j], caracteres[i]];
  }
  return caracteres.join('');
}
