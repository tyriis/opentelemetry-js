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

export class ApolloServer {}

import { GraphQLExtension } from 'apollo-server';
import { GraphQLResponse } from 'apollo-server-types';
import {
  Tracer,
  Span,
  SpanOptions,
  SpanKind,
  CanonicalCode,
  Status,
} from '@opentelemetry/types';

import { infoPathToPath, getPrettyPath } from './utils';

const rootSpanKey = Symbol('root_span');

type ResolverTracingExtensionFactoryOpts = {
  tracer: Tracer;
};

type TracingContext = any & {
  [rootSpanKey]: Span;
};

/** Extension to report tracing data */
export function tracingExtensionFactory({
  tracer,
}: ResolverTracingExtensionFactoryOpts): () => GraphQLExtension {
  return function resolverTracingExtension(): GraphQLExtension {
    return {
      // Start graphql root span
      requestDidStart({ context }: { context: TracingContext }): void {
        // Start root span
        const options: SpanOptions = {
          kind: SpanKind.INTERNAL
        };
        const parent = tracer.getCurrentSpan();
        if (parent !== null) {
          options.parent = parent;
        }
        const span = tracer.startSpan('apollo-server', options);

        // Store root span on context
        context[rootSpanKey] = span;
      },

      // Start and end resolver specific spans
      willResolveField(
        source,
        args,
        context,
        info
      ): ((error: Error | null, result?: any) => void) | void {
        // Start resolver span
        const path = infoPathToPath(info.path);
        const spanName = getPrettyPath(path);
        const rootSpan = context[rootSpanKey];
        const span = tracer.startSpan(spanName, {
          parent: rootSpan,
          kind: SpanKind.INTERNAL,
        });

        // End resolver span
        return (err): void => {
          if (err) {
            const status: Status = {
              code: CanonicalCode.INTERNAL,
              message: err.message,
            };
            span.setStatus(status);
            span.setAttribute('error.name', err.name);
            span.setAttribute('error.message', err.message);
            span.setAttribute('error.stack', err.stack);
          }

          span.end();
        };
      },

      // End graphql root span
      willSendResponse({
        context,
        graphqlResponse,
      }: {
        context: TracingContext;
        graphqlResponse: GraphQLResponse;
      }): void {
        const span = context[rootSpanKey];
        if (graphqlResponse.errors) {
          let status: Status | undefined;

          // Map status based on error extensions code.
          if (
            graphqlResponse.errors.find(
              err =>
                err.extensions &&
                err.extensions.code === 'INTERNAL_SERVER_ERROR'
            )
          ) {
            status = {
              code: CanonicalCode.INTERNAL,
            };
          } else if (graphqlResponse.errors.find(
            err =>
              err.extensions &&
              err.extensions.code === 'GRAPHQL_VALIDATION_FAILED'
          )) {
            status = {
              code: CanonicalCode.INVALID_ARGUMENT
            };
          } else {
            status = {
              code: CanonicalCode.UNKNOWN
            };
          }

          if (status) {
            span.setStatus(status);
          }
        }
        span.end();
      },
    };
  };
}
