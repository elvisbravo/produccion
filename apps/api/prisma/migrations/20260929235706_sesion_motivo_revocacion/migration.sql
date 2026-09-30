-- CreateEnum
CREATE TYPE "motivo_revocacion" AS ENUM ('rotada', 'logout', 'reutilizacion');

-- AlterTable
ALTER TABLE "sesion" ADD COLUMN     "motivo_revocacion" "motivo_revocacion";
