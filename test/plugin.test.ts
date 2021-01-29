import { logger } from "@coder/logger"
import * as express from "express"
import * as fs from "fs"
import * as path from "path"
import { HttpCode } from "../src/common/http"
import { PluginAPI } from "../src/node/plugin"
import * as apps from "../src/node/routes/apps"
import * as httpserver from "./httpserver"
const fsp = fs.promises

/**
 * Use $LOG_LEVEL=debug to see debug logs.
 */
describe("plugin", () => {
  let papi: PluginAPI
  let s: httpserver.HttpServer

  beforeAll(async () => {
    // Only include the test plugin to avoid contaminating results with other
    // plugins that might be on the filesystem.
    papi = new PluginAPI(logger, `${path.resolve(__dirname, "test-plugin")}:meow`, "")
    await papi.loadPlugins(false)

    const app = express.default()
    const wsApp = express.default()
    papi.mount(app, wsApp)
    app.use("/api/applications", apps.router(papi))

    s = new httpserver.HttpServer()
    await s.listen(app)
    s.listenUpgrade(wsApp)
  })

  afterAll(async () => {
    await s.close()
  })

  it("/api/applications", async () => {
    const resp = await s.fetch("/api/applications")
    expect(resp.status).toBe(200)
    const body = await resp.json()
    logger.debug(`${JSON.stringify(body)}`)
    expect(body).toStrictEqual([
      {
        name: "Test App",
        version: "4.0.0",

        description: "This app does XYZ.",
        iconPath: "/test-plugin/test-app/icon.svg",
        homepageURL: "https://example.com",
        path: "/test-plugin/test-app",

        plugin: {
          name: "test-plugin",
          version: "1.0.0",
          modulePath: path.join(__dirname, "test-plugin"),

          displayName: "Test Plugin",
          description: "Plugin used in code-server tests.",
          routerPath: "/test-plugin",
          homepageURL: "https://example.com",
        },
      },
    ])
  })

  it("/test-plugin/test-app", async () => {
    const indexHTML = await fsp.readFile(path.join(__dirname, "test-plugin/public/index.html"), {
      encoding: "utf8",
    })
    const resp = await s.fetch("/test-plugin/test-app")
    expect(resp.status).toBe(200)
    const body = await resp.text()
    expect(body).toBe(indexHTML)
  })

  it("/test-plugin/test-app (websocket)", async () => {
    const ws = s.ws("/test-plugin/test-app")
    const message = await new Promise((resolve) => {
      ws.once("message", (message) => resolve(message))
    })
    ws.terminate()
    expect(message).toBe("hello")
  })

  it("/test-plugin/error", async () => {
    const resp = await s.fetch("/test-plugin/error")
    expect(resp.status).toBe(HttpCode.LargePayload)
  })
})
