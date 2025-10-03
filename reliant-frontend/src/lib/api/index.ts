// src/lib/index.ts

// Library entrypoint (API client surface)
// --------------------------------------
// Keep each domain module as the single source for its own API calls.
// Re-export here so consumers can import from "src/lib" directly.


// Keeping them for explicitness/IDE hints—safe but redundant.
export { listCustomers } from "./customers";
export { listProducts }  from "./products";
export { listServices }  from "./services";

// Generic HTTP + quotes helpers
export * from "./http";
export * from "./quotes";

// User management/session
export * from "./users";     
export * from "./session";
