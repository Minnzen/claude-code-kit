/**
 * Inline replacements for lodash-es/noop and lodash-es/throttle.
 * Removes the lodash-es dependency to eliminate known vulnerabilities
 * (CVE code injection via _.template, prototype pollution via _.unset/_.omit).
 */

// biome-ignore lint/suspicious/noEmptyBlockStatements: intentional no-op
export function noop(): void {}

export interface ThrottledFunction<T extends (...args: unknown[]) => unknown> {
  (...args: Parameters<T>): ReturnType<T> | undefined;
  cancel(): void;
  flush(): ReturnType<T> | undefined;
}

interface ThrottleOptions {
  leading?: boolean;
  trailing?: boolean;
}

/**
 * Throttle a function to run at most once per `wait` ms.
 * Supports leading/trailing edge execution and cancel/flush.
 */
export function throttle<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number,
  options: ThrottleOptions = {},
): ThrottledFunction<T> {
  let timerId: ReturnType<typeof setTimeout> | undefined;
  let lastCallTime: number | undefined;
  let lastInvokeTime = 0;
  let lastArgs: Parameters<T> | undefined;
  let result: ReturnType<T> | undefined;

  const leading = options.leading !== false;
  const trailing = options.trailing !== false;

  function invokeFunc(time: number): ReturnType<T> {
    lastInvokeTime = time;
    const args = lastArgs!;
    lastArgs = undefined;
    result = func(...args) as ReturnType<T>;
    return result;
  }

  function startTimer(pendingFunc: () => void, remainingWait: number): void {
    timerId = setTimeout(pendingFunc, remainingWait);
  }

  function shouldInvoke(time: number): boolean {
    const timeSinceLastCall = lastCallTime === undefined ? wait : time - lastCallTime;
    const timeSinceLastInvoke = time - lastInvokeTime;

    return (
      lastCallTime === undefined ||
      timeSinceLastCall >= wait ||
      timeSinceLastCall < 0 ||
      timeSinceLastInvoke >= wait
    );
  }

  function remainingWait(time: number): number {
    const timeSinceLastCall = time - (lastCallTime ?? 0);
    return Math.max(0, wait - timeSinceLastCall);
  }

  function timerExpired(): void {
    const time = Date.now();
    if (shouldInvoke(time)) {
      trailingEdge(time);
      return;
    }
    startTimer(timerExpired, remainingWait(time));
  }

  function trailingEdge(time: number): void {
    timerId = undefined;
    if (trailing && lastArgs) {
      invokeFunc(time);
    }
    lastArgs = undefined;
  }

  function leadingEdge(time: number): void {
    lastInvokeTime = time;
    startTimer(timerExpired, wait);
    if (leading) {
      invokeFunc(time);
    }
  }

  const throttled = function (this: unknown, ...args: Parameters<T>): ReturnType<T> | undefined {
    const time = Date.now();
    const isInvoking = shouldInvoke(time);

    lastArgs = args;
    lastCallTime = time;

    if (isInvoking) {
      if (timerId === undefined) {
        leadingEdge(time);
        return result;
      }
      // Handle rapid calls during wait period (maxWait behavior)
    }
    if (timerId === undefined) {
      startTimer(timerExpired, wait);
    }
    return result;
  } as ThrottledFunction<T>;

  throttled.cancel = function (): void {
    if (timerId !== undefined) {
      clearTimeout(timerId);
    }
    lastInvokeTime = 0;
    lastArgs = undefined;
    lastCallTime = undefined;
    timerId = undefined;
  };

  throttled.flush = function (): ReturnType<T> | undefined {
    if (timerId === undefined) {
      return result;
    }
    trailingEdge(Date.now());
    return result;
  };

  return throttled;
}
