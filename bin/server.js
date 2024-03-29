#!/usr/bin/env node

const path = require("path");
const http = require("http");
const querystring = require("querystring");

const cwd = process.cwd();
const file = process.argv[2];
const handler = process.argv[3];
const portS = process.argv[4];
const port = portS ? parseInt(portS) : 8081;

const handlerModule = require(path.join(cwd, file));
const handlerFn = handlerModule[handler];

if (typeof handlerFn === "function") {
  const apiHandler = handlerFn;
  const server = http.createServer(async (req, res) => {
    const query = req.url?.includes("?")
      ? querystring.parse(req.url.split("?")[1])
      : null;
      let body = undefined;
      req.on("data", (c) => {
          body = (body || "") + c;
      });
    req.on("end", async () => {
      const response = await apiHandler({
        path: req.url.split("?")[0],
        httpMethod: req.method,
        body,
        headers: req.headers,
        queryStringParameters: query,
      }).catch((e) => {
        console.error(e);
        return {
          statusCode: 500,
          body: e.toString(),
        };
      });
      res.writeHead(response.statusCode);
      res.end(response.body);
    });
  });
  server.listen(port, "127.0.0.1", () => {
    console.log(
      `ts-lambda-router-local Server is running on http://127.0.0.1:${port}\nPress Ctrl+c to exit`
    );
  });
} else {
  console.log(
    "Usage: ts-lambda-router-local <handler file> <handler function> [<port>]"
  );
}
