"use strict";

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const IPINFO_PATH = require.resolve("../v1/ipinfo");
const WEATHER_PATH = require.resolve("../v1/weather");
const WEATHER_MODULE_PATHS = [IPINFO_PATH, WEATHER_PATH];

function setCachedModule(modulePath, moduleExports) {
  require.cache[modulePath] = {
    id: modulePath,
    filename: modulePath,
    loaded: true,
    exports: moduleExports
  };
}

function snapshotModules(modulePaths) {
  return new Map(modulePaths.map(modulePath => [modulePath, require.cache[modulePath]]));
}

function restoreModules(snapshot) {
  for (const [modulePath, cachedModule] of snapshot.entries()) {
    delete require.cache[modulePath];
    if (cachedModule) {
      require.cache[modulePath] = cachedModule;
    }
  }
}

function loadWeather(statusCode) {
  const snapshot = snapshotModules(WEATHER_MODULE_PATHS);
  delete require.cache[WEATHER_PATH];
  setCachedModule(IPINFO_PATH, {
    getClientIp() {
      return "203.0.113.30";
    },
    async queryIpInfoWithRetry() {
      const error = new Error(`ipinfo ${statusCode}`);
      error.statusCode = statusCode;
      throw error;
    }
  });

  try {
    const router = require(WEATHER_PATH);
    return {
      router,
      restore() {
        restoreModules(snapshot);
      }
    };
  } catch (error) {
    restoreModules(snapshot);
    throw error;
  }
}

function getRouteHandler(router, routePath) {
  const layer = router.stack.find(item => (
    item.route?.path === routePath && item.route.methods.get
  ));
  assert.ok(layer, `Missing GET route ${routePath}`);
  return layer.route.stack[0].handle;
}

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };
}

async function invokeRoute(router, routePath) {
  const handler = getRouteHandler(router, routePath);
  const request = { query: { ip: "203.0.113.31" } };
  const response = createResponse();
  await handler(request, response);
  return response;
}

async function assertStatusPreserved(statusCode) {
  const loaded = loadWeather(statusCode);
  try {
    for (const routePath of ["/realtime", "/week", "/"]) {
      const response = await invokeRoute(loaded.router, routePath);
      assert.strictEqual(response.statusCode, statusCode);
      assert.deepStrictEqual(response.body, {
        success: false,
        message: `ipinfo ${statusCode}`
      });
    }
  } finally {
    loaded.restore();
  }
}

describe("weather ipinfo status propagation", () => {
  it("should preserve statusCode 400 on all three routes", async () => {
    await assertStatusPreserved(400);
  });

  it("should preserve statusCode 503 on all three routes", async () => {
    await assertStatusPreserved(503);
  });
});
