// Global test config
jest.setTimeout(15000);

// Useful defaults so your app boots cleanly
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';

// If your code imports a logger, you can silence it here:
// jest.mock('../src/logger', () => ({ __esModule: true, default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }), { virtual: true });
