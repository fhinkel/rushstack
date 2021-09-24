// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * Options for controlling the parallelism of asynchronous operations.
 *
 * @remarks
 * Used with {@link Async.mapAsync} and {@link Async.forEachAsync}.
 *
 * @beta
 */
export interface IAsyncParallelismOptions {
  /**
   * Optionally used with the  {@link Async.mapAsync} and {@link Async.forEachAsync}
   * to limit the maximum number of concurrent promises to the specified number.
   */
  concurrency?: number;
}

/**
 * Utilities for parallel asynchronous operations, for use with the system `Promise` APIs.
 *
 * @beta
 */
export class Async {
  /**
   * Given an input array and a `callback` function, invoke the callback to start a
   * promise for each element in the array.  Returns an array containing the results.
   *
   * @remarks
   * This API is similar to the system `Array#map`, except that the loop is asynchronous,
   * and the maximum number of concurrent promises can be throttled
   * using {@link IAsyncParallelismOptions.concurrency}.
   *
   * If `callback` throws a synchronous exception, or if it returns a promise that rejects,
   * then the loop stops immediately.  Any remaining array items will be skipped, and
   * overall operation will reject with the first error that was encountered.
   *
   * @param iterable - the array of inputs for the callback function
   * @param callback - a function that starts an asynchronous promise for an element
   *   from the array
   * @param options - options for customizing the control flow
   * @returns an array containing the result for each callback, in the same order
   *   as the original input `array`
   */
  public static async mapAsync<TEntry, TRetVal>(
    iterable: Iterable<TEntry> | AsyncIterable<TEntry>,
    callback: (entry: TEntry, arrayIndex: number) => Promise<TRetVal>,
    options?: IAsyncParallelismOptions | undefined
  ): Promise<TRetVal[]> {
    const result: TRetVal[] = [];

    await Async.forEachAsync(
      iterable,
      async (item: TEntry, arrayIndex: number): Promise<void> => {
        result[arrayIndex] = await callback(item, arrayIndex);
      },
      options
    );

    return result;
  }

  /**
   * Given an input array and a `callback` function, invoke the callback to start a
   * promise for each element in the array.
   *
   * @remarks
   * This API is similar to the system `Array#forEach`, except that the loop is asynchronous,
   * and the maximum number of concurrent promises can be throttled
   * using {@link IAsyncParallelismOptions.concurrency}.
   *
   * If `callback` throws a synchronous exception, or if it returns a promise that rejects,
   * then the loop stops immediately.  Any remaining array items will be skipped, and
   * overall operation will reject with the first error that was encountered.
   *
   * @param iterable - the array of inputs for the callback function
   * @param callback - a function that starts an asynchronous promise for an element
   *   from the array
   * @param options - options for customizing the control flow
   */
  public static async forEachAsync<TEntry>(
    iterable: Iterable<TEntry> | AsyncIterable<TEntry>,
    callback: (entry: TEntry, arrayIndex: number) => Promise<void>,
    options?: IAsyncParallelismOptions | undefined
  ): Promise<void> {
    const concurrency: number =
      options?.concurrency && options.concurrency > 0 ? options.concurrency : Infinity;
    let operationsInProgress: number = 1;

    const iterator: Iterator<TEntry> | AsyncIterator<TEntry> = (
      (iterable as Iterable<TEntry>)[Symbol.iterator] ||
      (iterable as AsyncIterable<TEntry>)[Symbol.asyncIterator]
    ).call(iterable);

    let arrayIndex: number = 0;
    let iteratorIsDone: boolean = false;
    await new Promise<void>((resolve: () => void, reject: (error: Error) => void) => {
      async function onOperationCompletionAsync(): Promise<void> {
        operationsInProgress--;
        if (operationsInProgress === 0 && iteratorIsDone) {
          resolve();
        }

        while (operationsInProgress < concurrency) {
          const nextIteratorResult: IteratorResult<TEntry> = await iterator.next();
          // eslint-disable-next-line require-atomic-updates
          iteratorIsDone = !!nextIteratorResult.done;
          if (!iteratorIsDone) {
            operationsInProgress++;
            try {
              Promise.resolve(callback(nextIteratorResult.value, arrayIndex++))
                .then(() => onOperationCompletionAsync())
                .catch(reject);
            } catch (error) {
              reject(error as Error);
            }
          } else {
            break;
          }
        }
      }

      onOperationCompletionAsync().catch(reject);
    });
  }

  /**
   * Return a promise that resolves after the specified number of milliseconds.
   */
  public static async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }
}
