/**
 * Low-level HTTP client for the Tradier API.
 * Handles authentication, base URL management, and request/response lifecycle.
 * All higher-level business logic belongs in TradierBroker.
 */
export class TradierApiClient {
  private baseUrl: string;
  private token: string;

  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl;
    this.token = token;
  }

  /**
   * Update the base URL and token (used when switching between sandbox/prod).
   */
  public configure(baseUrl: string, token: string): void {
    this.baseUrl = baseUrl;
    this.token = token;
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  public getToken(): string {
    return this.token;
  }

  /**
   * Perform a GET request against the Tradier API.
   */
  public async get<T>(path: string, params?: Record<string, string>): Promise<T> {
    let url = `${this.baseUrl}${path}`;

    if (params) {
      const searchParams = new URLSearchParams(params);
      url += `?${searchParams.toString()}`;
    }

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Tradier API Error (${response.status}): ${errorBody}`);
    }

    return response.json() as Promise<T>;
  }

  /**
   * Perform a POST request against the Tradier API.
   * Used for order placement (Phase 2).
   */
  public async post<T>(path: string, body: Record<string, string>): Promise<T> {
    const url = `${this.baseUrl}${path}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams(body).toString()
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Tradier API Error (${response.status}): ${errorBody}`);
    }

    return response.json() as Promise<T>;
  }

  /**
   * Perform a DELETE request against the Tradier API.
   * Used for canceling orders.
   */
  public async delete<T>(path: string): Promise<T> {
    const url = `${this.baseUrl}${path}`;

    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Tradier API Error (${response.status}): ${errorBody}`);
    }

    return response.json() as Promise<T>;
  }
}
