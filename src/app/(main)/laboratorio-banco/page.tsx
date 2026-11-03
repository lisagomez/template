import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { describeFuncion } from '../../../../tools/banco-motores/dist/index.js';
import { Banco } from '@/features/banco/components/banco';
import { bancoHabilitado } from '@/features/banco/services/servidor/api';
import { FUNCIONES, maquinaDelBanco } from '@/features/banco/services/servidor/funciones';

export const metadata: Metadata = {
  title: 'Banco de motores',
  description: 'Declaras una función con su esquema y salen solas su pantalla y su ruta API.',
};

export const dynamic = 'force-dynamic';

/** Fail-closed: fuera del laboratorio (sin BANCO_LABORATORIO=1, en producción o desde otra máquina) esta página no existe. */
export default async function PaginaBanco() {
  if (!bancoHabilitado(await headers())) notFound();
  return <Banco funciones={FUNCIONES.map(describeFuncion)} maquina={maquinaDelBanco()} />;
}
