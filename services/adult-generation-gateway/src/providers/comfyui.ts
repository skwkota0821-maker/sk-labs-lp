import type { GenerationProvider, ProviderSubmitResult } from '../types';

export interface ComfyUiProviderOptions {
  baseUrl: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
}

export class ComfyUiProvider implements GenerationProvider {
  readonly name = 'comfyui';
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ComfyUiProviderOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.apiKey = options.apiKey;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
    };
    if (this.apiKey) headers.authorization = `Bearer ${this.apiKey}`;
    return headers;
  }

  async submit(workflow: unknown): Promise<ProviderSubmitResult> {
    const response = await this.fetchImpl(`${this.baseUrl}/prompt`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ prompt: workflow }),
    });

    if (!response.ok) {
      throw new Error(`COMFYUI_SUBMIT_FAILED:${response.status}`);
    }

    const data = (await response.json()) as { prompt_id?: string };
    if (!data.prompt_id) throw new Error('COMFYUI_MISSING_PROMPT_ID');

    return { providerJobId: data.prompt_id, raw: data };
  }

  async getResult(providerJobId: string): Promise<unknown> {
    const response = await this.fetchImpl(
      `${this.baseUrl}/history/${encodeURIComponent(providerJobId)}`,
      { headers: this.headers() },
    );

    if (!response.ok) {
      throw new Error(`COMFYUI_HISTORY_FAILED:${response.status}`);
    }

    return response.json();
  }

  async cancel(): Promise<void> {
    const response = await this.fetchImpl(`${this.baseUrl}/interrupt`, {
      method: 'POST',
      headers: this.headers(),
      body: '{}',
    });
    if (!response.ok) throw new Error(`COMFYUI_CANCEL_FAILED:${response.status}`);
  }
}
