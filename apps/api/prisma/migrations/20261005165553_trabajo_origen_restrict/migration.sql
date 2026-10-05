-- DropForeignKey
ALTER TABLE "trabajo" DROP CONSTRAINT "trabajo_prospecto_id_fkey";

-- DropForeignKey
ALTER TABLE "trabajo" DROP CONSTRAINT "trabajo_proveedor_id_fkey";

-- AddForeignKey
ALTER TABLE "trabajo" ADD CONSTRAINT "trabajo_prospecto_id_fkey" FOREIGN KEY ("prospecto_id") REFERENCES "prospecto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trabajo" ADD CONSTRAINT "trabajo_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "proveedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
