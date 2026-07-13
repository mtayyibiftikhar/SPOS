const http = require("node:http");
const net = require("node:net");

const listenPort = Number(process.argv[2] || 3001);
const target = new URL(process.argv[3] || "http://localhost:3000");

const server = http.createServer((request, response) => {
  const proxyRequest = http.request(
    {
      headers: {
        ...request.headers
      },
      hostname: target.hostname,
      method: request.method,
      path: request.url,
      port: target.port || 80
    },
    (proxyResponse) => {
      response.writeHead(proxyResponse.statusCode || 502, proxyResponse.headers);
      proxyResponse.pipe(response);
    }
  );

  proxyRequest.on("error", () => {
    response.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
    response.end("Local POS server is not ready yet. Start localhost:3000 first.");
  });

  request.pipe(proxyRequest);
});

server.on("upgrade", (request, socket, head) => {
  const targetSocket = net.connect(Number(target.port || 80), target.hostname, () => {
    targetSocket.write(
      [
        `${request.method} ${request.url} HTTP/${request.httpVersion}`,
        `Host: ${request.headers.host || `localhost:${listenPort}`}`,
        ...Object.entries(request.headers)
          .filter(([key]) => key.toLowerCase() !== "host")
          .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : value ?? ""}`),
        "",
        ""
      ].join("\r\n")
    );
    targetSocket.write(head);
    targetSocket.pipe(socket);
    socket.pipe(targetSocket);
  });

  targetSocket.on("error", () => socket.destroy());
});

server.listen(listenPort, () => {
  console.log(`Owner local proxy listening on http://localhost:${listenPort} -> ${target.origin}`);
});
