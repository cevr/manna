import { Layer } from 'effect';
import { Digest, SecureRandom } from 'effect/crypto';

export const layerWebCrypto = Layer.merge(Digest.layerWebCrypto, SecureRandom.layerWebCrypto);
