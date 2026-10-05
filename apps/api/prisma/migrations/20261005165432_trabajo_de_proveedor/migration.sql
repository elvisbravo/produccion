-- DropForeignKey
ALTER TABLE "trabajo" DROP CONSTRAINT "trabajo_prospecto_id_fkey";

-- AlterTable
ALTER TABLE "trabajo" ADD COLUMN     "actividad_plan_id" UUID,
ADD COLUMN     "minutos_plan" INTEGER,
ADD COLUMN     "proveedor_id" UUID,
ALTER COLUMN "prospecto_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "trabajo" ADD CONSTRAINT "trabajo_prospecto_id_fkey" FOREIGN KEY ("prospecto_id") REFERENCES "prospecto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trabajo" ADD CONSTRAINT "trabajo_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "proveedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trabajo" ADD CONSTRAINT "trabajo_actividad_plan_id_fkey" FOREIGN KEY ("actividad_plan_id") REFERENCES "actividad"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Un trabajo viene de un prospecto o de un proveedor, nunca de ambos ni de ninguno.
ALTER TABLE "trabajo" ADD CONSTRAINT "trabajo_origen_chk" CHECK (("prospecto_id" IS NULL) <> ("proveedor_id" IS NULL));
-- La actividad y el tiempo del plan van juntos.
ALTER TABLE "trabajo" ADD CONSTRAINT "trabajo_plan_chk" CHECK (("actividad_plan_id" IS NULL) = ("minutos_plan" IS NULL));
