import type { FileSystem, Layer } from 'effect';

import type { TopicService } from '../topics/service.js';
import { bunArtifactDriver } from './driver-bun.js';
import type { WikiSectionSources } from './section-composer.js';
import { layerArtifactOrAbsent } from './service-artifact.js';
import type { WikiService } from './service.js';

export const layerBunOrAbsent = (
  filename: string,
): Layer.Layer<WikiService, never, FileSystem.FileSystem | TopicService | WikiSectionSources> =>
  layerArtifactOrAbsent(bunArtifactDriver, filename);
