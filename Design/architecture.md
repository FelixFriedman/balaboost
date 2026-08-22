# OptionsApp Architecture & Design Approach

## Overview

**Purpose:** The primary purpose of this application is to facilitate automated trading by algorithmically evaluating market conditions in real-time.

The application is built on a modern **Desktop Application Architecture** utilizing the **Electron** framework. It strictly follows a "Backend-For-Frontend" (BFF) pattern by isolating all heavy processing, mathematical computations, and secure API requests into the Node.js Main Process, while keeping the Angular 21 Renderer Process lightweight and purely focused on visualization.

This separation of concerns ensures that API keys are never exposed to the frontend browser context and that intense algorithmic calculations do not block the UI thread.

---

## External Vendors & Services

### Tradier API (Market Data Broker)
We have selected **Tradier** as the primary vendor for market data and brokerage services.
*   **Purpose:** Tradier provides the raw, real-time quote data and the historical timesales (OHLCV) data necessary for the `technicalindicators` math engine to compute the algorithmic tags.
*   **Environments:** The application natively supports both the Tradier **Sandbox** (for simulated data and testing) and **Production** environments, dynamically toggled via the application's configuration.
*   **Security:** All communication with the Tradier API (including Bearer Token authorization) is executed entirely on the Node.js backend. The tokens are never exposed to the Angular client.

---

## Core Components

### 1. The Electron Backend (Main Process)
The `app/` directory serves as the Node.js backend.

*   **`main.ts` (Entry Point & IPC Router)**
    *   Initializes the Electron browser window.
    *   Registers `ipcMain` handlers (e.g., `tradier:getMarketTags`) which listen for requests from the frontend, route them to the appropriate services, and return the processed data asynchronously.
*   **`environment.ts` & `.env`**
    *   Manages runtime configurations dynamically. It allows the application to toggle between `sandbox` and `prod` environments seamlessly, utilizing `dotenv` to load sensitive API tokens securely from a local `.env` file.
*   **`indicators-service.ts` (The Math Engine)**
    *   Responsible for fetching raw OHLCV market data from the external broker (Tradier).
    *   Maintains an in-memory caching mechanism to prevent rate-limiting and unnecessary API calls.
    *   Utilizes the `technicalindicators` library to compute arrays of metrics (EMA, MACD, RSI, CCI, STOCH, ADX) simultaneously.
*   **`market-tagger.ts` (The Logic Engine)**
    *   A stateless evaluator class. It takes the output from the `IndicatorsService` and runs it through a strict chronological logic sequence based on predefined flowchart rules.
    *   Outputs an array of descriptive string tags (e.g., `bull market`, `bear market`, `overbought market`) that represent the current evaluated state of the market.

### 2. The IPC Bridge
Communication between the backend and frontend is entirely driven by Electron's Inter-Process Communication (IPC). The backend exposes targeted endpoints, and the frontend requests data via `ipcRenderer.invoke`. This mimics a traditional REST API architecture but operates purely over memory channels.

### 3. The Angular Frontend (Renderer Process)
The `src/app/` directory serves as the UI layer.

*   **`core/services/tradier.service.ts`**
    *   An Angular service that wraps the `ipcRenderer` calls. It acts as a client-side SDK, providing strongly-typed Promise-based methods (like `getMarketTags(symbol)`) for Angular components to use, completely abstracting away the Electron IPC layer.
*   **`home/home.component.ts` (Dashboard UI)**
    *   The primary view of the application. It requests data from the `TradierService` on initialization and dynamically renders the raw quote data alongside the algorithmic Market Tags in real-time.

---

## Data Flow (Example: Requesting Market Tags)

1.  **UI Interaction:** The `HomeComponent` initializes and calls `tradierService.getMarketTags('SPX')`.
2.  **IPC Request:** The Angular `TradierService` dispatches an IPC invoke event (`tradier:getMarketTags`) across the bridge.
3.  **Backend Routing:** `main.ts` intercepts the event and asks the `IndicatorsService` for data.
4.  **Cache & Fetch:** `IndicatorsService` checks its 1-minute cache. If stale, it fetches the latest raw timesales data from the Tradier API and calculates all technical indicators.
5.  **Algorithm Evaluation:** The calculated metrics are passed to the `MarketTagger`, which runs the flowchart logic and generates the final tags.
6.  **Response:** The tags are returned over the IPC bridge back to the Angular component, which immediately updates the UI DOM to display the blue tag pills.
