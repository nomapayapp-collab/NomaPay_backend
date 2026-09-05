
import { AppError } from '../errors/app-error.js';

interface FetchJsonOptions extends RequestInit {
   
    timeoutMs?: number;
}

export async function fetchJson<T>(url: string, options: FetchJsonOptions = {}): Promise<T> {
    const { timeoutMs = 8000, ...init } = options;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, { ...init, signal: controller.signal });

        if (!response.ok) {
            throw new AppError(
                502,
                `La API externa respondió con status ${response.status} (${url}).`
            );
        }

        return (await response.json()) as T;
    } catch (err: any) {
        if (err instanceof AppError) {
            throw err;
        }
        if (err?.name === 'AbortError') {
            throw new AppError(504, `La API externa no respondió a tiempo (${url}).`);
        }
        throw new AppError(502, `Error al conectar con la API externa (${url}): ${err?.message ?? err}`);
    } finally {
        clearTimeout(timeoutId);
    }
}