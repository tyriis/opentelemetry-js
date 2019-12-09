/*!
 * Copyright 2019, OpenTelemetry Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { GraphQLPath } from './types';

/** Turns `info.path` data to flat array `path` */
export function infoPathToPath(infoPath: any): GraphQLPath {
  return Object.keys(infoPath).reduce((prev: any, element: any) => {
    const next = infoPath[element];
    if (typeof next === 'object' && !Array.isArray(next)) {
      return [...prev, ...infoPathToPath(next)];
    }
    return next !== undefined ? [...prev, next] : prev;
  }, []);
}

/** Turns GraphQL path to a human readable string. */
export function getPrettyPath(path: GraphQLPath): string {
  return '[' + path.join(', ') + ']';
}
