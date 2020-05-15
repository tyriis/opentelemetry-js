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

import * as assert from 'assert';
import { format, parse, UrlWithStringQuery } from 'url';

import { NodeTracer } from '@opentelemetry/node';
import { CanonicalCode } from '@opentelemetry/types';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/tracing';
import axios, { AxiosPromise, AxiosResponse } from 'axios';
import { ApolloServer, gql } from 'apollo-server';

import { tracingExtensionFactory } from '../src';

const testError = new Error('My Test Error');

const typeDefs = gql`
  type Book {
    title: String
    author: String
    testError: String
  }
  type Query {
    books: [Book]
  }
`;

const books = [
  {
    title: 'Harry Potter and the Chamber of Secrets',
    author: 'J.K. Rowling',
  },
  {
    title: 'Jurassic Park',
    author: 'Michael Crichton',
  },
];

const resolvers = {
  Query: {
    books: () => books,
  },
  Book: {
    testError() {
      throw testError;
    },
  },
};

const port = 4100;

function query(
  serverURI: UrlWithStringQuery,
  gqlQuery: string
): AxiosPromise<AxiosResponse> {
  const url = format(Object.assign({ path: '/graphql' }, serverURI));
  return axios({
    validateStatus: () => true,
    method: 'POST',
    url,
    data: {
      query: gqlQuery,
    },
  });
}

describe('Apollo Server', () => {
  let server: ApolloServer;
  let serverUrl: UrlWithStringQuery;
  let memoryExporter: InMemorySpanExporter;

  beforeEach(async () => {
    // Tracing
    const tracer = new NodeTracer({ plugins: {} });
    memoryExporter = new InMemorySpanExporter();
    tracer.addSpanProcessor(new SimpleSpanProcessor(memoryExporter));

    // Apollo Server
    server = new ApolloServer({
      typeDefs,
      resolvers,
      extensions: [tracingExtensionFactory({ tracer })],
    });
    const { url } = await server.listen(port);
    serverUrl = parse(url);
  });

  afterEach(async () => {
    await server.stop();
  });

  it('should create spans', async () => {
    const { data } = await query(
      serverUrl,
      `
      query TestQuery {
        books {
          title
        }
      }
    `
    );

    assert.deepStrictEqual(data.data, {
      books: books.map(book => ({ title: book.title })),
    });

    const spans = memoryExporter.getFinishedSpans().map(span => ({
      name: span.name,
    }));

    assert.deepStrictEqual(spans, [
      { name: '[books]' },
      { name: '[books, 0, title]' },
      { name: '[books, 1, title]' },
      { name: 'apollo-server' },
    ]);
  });

  it('should capture resolver errors', async () => {
    const { data } = await query(
      serverUrl,
      `
      query TestQuery {
        books {
          testError
        }
      }
    `
    );

    assert.deepStrictEqual(data.data, {
      books: books.map(book => ({ testError: null })),
    });

    const spans = memoryExporter.getFinishedSpans().map(span => ({
      name: span.name,
      attributes: span.attributes,
      status: span.status,
    }));

    assert.deepStrictEqual(spans, [
      { name: '[books]', attributes: {}, status: { code: CanonicalCode.OK } },
      {
        name: '[books, 0, testError]',
        attributes: {
          'error.name': testError.name,
          'error.message': testError.message,
          'error.stack': testError.stack,
        },
        status: { code: CanonicalCode.INTERNAL, message: testError.message },
      },
      {
        name: '[books, 1, testError]',
        attributes: {
          'error.name': testError.name,
          'error.message': testError.message,
          'error.stack': testError.stack,
        },
        status: { code: CanonicalCode.INTERNAL, message: testError.message },
      },
      {
        name: 'apollo-server',
        attributes: {},
        status: { code: CanonicalCode.INTERNAL },
      },
    ]);
  });

  it('should capture validation errors', async () => {
    await query(
      serverUrl,
      `
      query TestQuery {
        invalid
      }
    `
    );

    const spans = memoryExporter.getFinishedSpans().map(span => ({
      name: span.name,
      attributes: span.attributes,
      status: span.status,
    }));

    assert.deepStrictEqual(spans, [
      {
        name: 'apollo-server',
        attributes: {},
        status: { code: CanonicalCode.INVALID_ARGUMENT },
      },
    ]);
  });
});
