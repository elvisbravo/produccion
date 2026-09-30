import { config } from 'dotenv';

/**
 * Las pruebas e2e usan su propia base de datos: la de desarrollo con el sufijo _test
 * (o DATABASE_URL_TEST si se define). Nunca tocan la base de desarrollo.
 */
export function urlBasePruebas(): string {
  config({ quiet: true });
  const url = new URL(process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL ?? '');
  if (!process.env.DATABASE_URL_TEST) url.pathname = `${url.pathname.replace(/_test$/, '')}_test`;

  const nombre = url.pathname.slice(1);
  if (!nombre.endsWith('_test')) {
    throw new Error(`Por seguridad, las pruebas solo corren contra una base que termine en _test (se recibió "${nombre}")`);
  }
  return url.toString();
}
