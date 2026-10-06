-- Un trabajo viene de un prospecto convertido, de un proveedor, o de un cliente registrado directo cuyo trabajo lo entregó un proveedor (ambos); nunca de ninguno.
ALTER TABLE "trabajo" DROP CONSTRAINT "trabajo_origen_chk";
ALTER TABLE "trabajo" ADD CONSTRAINT "trabajo_origen_chk" CHECK ("prospecto_id" IS NOT NULL OR "proveedor_id" IS NOT NULL);
