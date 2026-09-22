export interface HttpRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  returnBody?: boolean;
}

export interface HttpResponse {
  status: number;
  ok: boolean;
  headers: {
    get(name: string): string | null;
  };
  body?: string | null;
}

export type HttpErrorKind = 'timeout' | 'network';

export class HttpError extends Error {
  readonly kind: HttpErrorKind;

  constructor(message: string, kind: HttpErrorKind) {
    super(message);
    this.name = 'HttpError';
    this.kind = kind;
  }
}

interface FetchLikeInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  signal?: { aborted?: boolean };
}

interface FetchLikeResponse {
  status: number;
  ok: boolean;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}

type FetchImplementation = (
  input: string,
  init?: FetchLikeInit
) => Promise<FetchLikeResponse>;

interface AbortControllerLike {
  readonly signal: { aborted?: boolean };
  abort(): void;
}

interface NodeGlobals {
  fetch?: FetchImplementation;
  AbortController?: new () => AbortControllerLike;
}

const nodeGlobals = (): NodeGlobals => globalThis as unknown as NodeGlobals;

const isAbortError = (err: unknown): boolean => {
  if (err && typeof err === 'object' && 'name' in err) {
    const name = (err as { name: unknown }).name;
    return name === 'AbortError' || name === 'TimeoutError';
  }
  return false;
};

export const httpRequest = async (
  url: string,
  options: HttpRequestOptions
): Promise<HttpResponse> => {
  const globals = nodeGlobals();

  if (typeof globals.fetch !== 'function') {
    throw new HttpError('HTTP fetch is not available in this runtime', 'network');
  }

  const fetch = globals.fetch;
  const timeoutMs = options.timeoutMs ?? 10_000;

  const AbortControllerCtor = globals.AbortController;
  const controller = AbortControllerCtor ? new AbortControllerCtor() : undefined;
  const signal = controller?.signal;

  const timer = setTimeout(() => {
    if (controller) {
      controller.abort();
    }
  }, timeoutMs);

  try {
    const res = await fetch(url, {
      method: options.method,
      headers: options.headers,
      body: options.body,
      signal,
    });

    const result: HttpResponse = {
      status: res.status,
      ok: res.ok,
      headers: res.headers,
      body: options.returnBody ? await res.text() : null,
    };
    return result;
  } catch (err: unknown) {
    if (isAbortError(err)) {
      throw new HttpError('HTTP request timed out', 'timeout');
    }
    throw new HttpError('HTTP network error', 'network');
  } finally {
    clearTimeout(timer);
  }
};
