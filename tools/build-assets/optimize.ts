/**
 * glTF optimization for one model (spec 12.1 step 3, 12.6).
 *
 * The pipeline of spec 12.6 runs in this order:
 *
 *   dedup -> prune -> weld -> resample -> quantize -> meshopt
 *
 * `quantize` stores vertex attributes as integers (KHR_mesh_quantization) and
 * `meshopt` applies EXT_meshopt_compression. The renderer must therefore load
 * `public/models/*.glb` with `MeshoptDecoder` set on the GLTFLoader:
 *
 *   import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
 *   const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
 *
 * File-size limits (spec 12.6, enforced by check.ts): Common to Rare defenders
 * and regular enemies 250 KB, Epic and Legendary 400 KB, Mythic and bosses 700 KB.
 *
 * `@gltf-transform/extensions` (extension registry) and `meshoptimizer` (codec)
 * are mandatory companions of the approved spec 10.2 asset tooling: quantize and
 * meshopt are extensions, and MeshoptEncoder lives in the codec package. Both are
 * already installed as dependencies of the approved @gltf-transform/functions and
 * @gltf-transform/cli packages, so package.json only lists the three approved
 * packages. See the pull request for this spec gap.
 */

import { Logger, NodeIO, Verbosity } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, quantize, resample, weld } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import { statSync } from 'node:fs';

/** Optimization steps in the exact order of spec 12.6. */
const OPTIMIZE_STEPS = 'dedup, prune, weld, resample, quantize, meshopt';

let sharedIo: NodeIO | null = null;

async function modelIo(): Promise<NodeIO> {
  if (sharedIo !== null) {
    return sharedIo;
  }
  await MeshoptEncoder.ready;
  sharedIo = new NodeIO()
    .setLogger(new Logger(Verbosity.WARN))
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
  return sharedIo;
}

/** Optimizes `rawModelPath` into `outputModelPath` and returns the written size. */
export async function optimizeModel(
  rawModelPath: string,
  outputModelPath: string,
): Promise<number> {
  const io = await modelIo();
  const document = await io.read(rawModelPath);
  await document.transform(
    dedup(),
    prune(),
    weld(),
    resample(),
    quantize(),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  );
  await io.write(outputModelPath, document);
  const bytes = statSync(outputModelPath).size;
  console.log(`optimize: ${outputModelPath} (${bytes} bytes, ${OPTIMIZE_STEPS})`);
  return bytes;
}
