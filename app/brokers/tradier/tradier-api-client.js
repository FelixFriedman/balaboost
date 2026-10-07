"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TradierApiClient = void 0;
/**
 * Low-level HTTP client for the Tradier API.
 * Handles authentication, base URL management, and request/response lifecycle.
 * All higher-level business logic belongs in TradierBroker.
 */
class TradierApiClient {
    constructor(baseUrl, token) {
        this.baseUrl = baseUrl;
        this.token = token;
    }
    /**
     * Update the base URL and token (used when switching between sandbox/prod).
     */
    configure(baseUrl, token) {
        this.baseUrl = baseUrl;
        this.token = token;
    }
    getBaseUrl() {
        return this.baseUrl;
    }
    getToken() {
        return this.token;
    }
    /**
     * Perform a GET request against the Tradier API.
     */
    get(path, params) {
        return __awaiter(this, void 0, void 0, function* () {
            let url = `${this.baseUrl}${path}`;
            if (params) {
                const searchParams = new URLSearchParams(params);
                url += `?${searchParams.toString()}`;
            }
            const response = yield fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Accept': 'application/json'
                }
            });
            if (!response.ok) {
                const errorBody = yield response.text();
                throw new Error(`Tradier API Error (${response.status}): ${errorBody}`);
            }
            return response.json();
        });
    }
    /**
     * Perform a POST request against the Tradier API.
     * Used for order placement (Phase 2).
     */
    post(path, body) {
        return __awaiter(this, void 0, void 0, function* () {
            const url = `${this.baseUrl}${path}`;
            const response = yield fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Accept': 'application/json',
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: new URLSearchParams(body).toString()
            });
            if (!response.ok) {
                const errorBody = yield response.text();
                throw new Error(`Tradier API Error (${response.status}): ${errorBody}`);
            }
            return response.json();
        });
    }
    /**
     * Perform a DELETE request against the Tradier API.
     * Used for canceling orders.
     */
    delete(path) {
        return __awaiter(this, void 0, void 0, function* () {
            const url = `${this.baseUrl}${path}`;
            const response = yield fetch(url, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Accept': 'application/json'
                }
            });
            if (!response.ok) {
                const errorBody = yield response.text();
                throw new Error(`Tradier API Error (${response.status}): ${errorBody}`);
            }
            return response.json();
        });
    }
}
exports.TradierApiClient = TradierApiClient;
//# sourceMappingURL=tradier-api-client.js.map