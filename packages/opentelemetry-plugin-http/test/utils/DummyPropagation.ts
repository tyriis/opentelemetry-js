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
import { Context, HttpTextPropagator, TraceFlags } from '@opentelemetry/api';
import {
  setExtractedSpanContext,
  getParentSpanContext,
} from '@opentelemetry/core';
import * as http from 'http';

export class DummyPropagation implements HttpTextPropagator {
  static TRACE_CONTEXT_KEY = 'x-dummy-trace-id';
  static SPAN_CONTEXT_KEY = 'x-dummy-span-id';
  extract(context: Context, carrier: http.OutgoingHttpHeaders) {
    const extractedSpanContext = {
      traceId: carrier[DummyPropagation.TRACE_CONTEXT_KEY] as string,
      spanId: DummyPropagation.SPAN_CONTEXT_KEY,
      traceFlags: TraceFlags.SAMPLED,
    };
    if (extractedSpanContext.traceId && extractedSpanContext.spanId) {
      return setExtractedSpanContext(context, extractedSpanContext);
    }
    return context;
  }
  inject(context: Context, headers: { [custom: string]: string }): void {
    const spanContext = getParentSpanContext(context);
    if (!spanContext) return;
    headers[DummyPropagation.TRACE_CONTEXT_KEY] = spanContext.traceId;
    headers[DummyPropagation.SPAN_CONTEXT_KEY] = spanContext.spanId;
  }
}
