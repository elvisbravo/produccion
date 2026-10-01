-- CreateEnum
CREATE TYPE "entidad_comentario" AS ENUM ('prospecto', 'trabajo', 'entregable', 'tarea');

-- CreateTable
CREATE TABLE "comentario" (
    "id" UUID NOT NULL,
    "entidad" "entidad_comentario" NOT NULL,
    "entidad_id" UUID NOT NULL,
    "autor_id" UUID NOT NULL,
    "texto" TEXT NOT NULL,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editado_en" TIMESTAMPTZ(6),
    "eliminado_en" TIMESTAMPTZ(6),

    CONSTRAINT "comentario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comentario_mencion" (
    "comentario_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,

    CONSTRAINT "comentario_mencion_pkey" PRIMARY KEY ("comentario_id","usuario_id")
);

-- CreateIndex
CREATE INDEX "comentario_entidad_entidad_id_creado_en_idx" ON "comentario"("entidad", "entidad_id", "creado_en");

-- CreateIndex
CREATE INDEX "comentario_mencion_usuario_id_idx" ON "comentario_mencion"("usuario_id");

-- AddForeignKey
ALTER TABLE "comentario" ADD CONSTRAINT "comentario_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comentario_mencion" ADD CONSTRAINT "comentario_mencion_comentario_id_fkey" FOREIGN KEY ("comentario_id") REFERENCES "comentario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comentario_mencion" ADD CONSTRAINT "comentario_mencion_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Reglas que Prisma no expresa
ALTER TABLE "comentario" ADD CONSTRAINT "comentario_texto_chk" CHECK (length(btrim("texto")) BETWEEN 1 AND 5000);
