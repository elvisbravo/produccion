// setupFiles de las pruebas e2e: carga .env y apunta DATABASE_URL a la base de pruebas
// antes de que se importe la aplicación.
import { urlBasePruebas } from './entorno.js';

process.env.DATABASE_URL = urlBasePruebas();
process.env.NODE_ENV = 'test';
