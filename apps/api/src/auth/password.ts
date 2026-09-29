import { hash, verify } from '@node-rs/argon2';

// argon2id con los parámetros por defecto de @node-rs/argon2 (recomendados por OWASP).
export const hashPassword = (password: string) => hash(password);

export const verificarPassword = (passwordHash: string, password: string) => verify(passwordHash, password);

/**
 * Hash de relleno: cuando el correo no existe se verifica igual contra este hash,
 * para que el tiempo de respuesta no revele qué correos están registrados.
 */
let hashRelleno: Promise<string> | undefined;
export const obtenerHashRelleno = () => (hashRelleno ??= hash('relleno-para-igualar-tiempos'));
