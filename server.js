const WebSocket = require("ws");
const express = require("express");
const http = require("http");
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const waitingQueue = [];
const activeUsers = new Map();

function tryToPair(ws) {
  while (waitingQueue.length > 0) {
    const partner = waitingQueue.shift();
    if (partner.readyState !== WebSocket.OPEN) continue;

    activeUsers.set(ws, { partner, state: "paired" });
    activeUsers.set(partner, { partner: ws, state: "paired" });

    ws.send(JSON.stringify({ type: "paired" }));
    partner.send(JSON.stringify({ type: "paired" }));
    return;
  }

  waitingQueue.push(ws);
  activeUsers.set(ws, { partner: null, state: "waiting" });
}

function handleNext(ws) {
  const user = activeUsers.get(ws);

  if (user?.partner) {
    const partner = user.partner;

    if (partner.readyState === WebSocket.OPEN) {
      partner.send(JSON.stringify({ type: "partner-disconnected" }));
      activeUsers.set(partner, { partner: null, state: "waiting" });
      waitingQueue.push(partner);
    }
  }

  activeUsers.set(ws, { partner: null, state: "waiting" });
  tryToPair(ws);
}

wss.on("connection", (ws) => {
  tryToPair(ws);

  ws.on("message", (msg) => {
    let data;
    try {
      data = JSON.parse(msg);
    } catch (e) {
      console.error("Invalid JSON:", msg);
      return;
    }

    const user = activeUsers.get(ws);
    const partner = user?.partner;

    if (data.type === "next") {
      handleNext(ws);
    } else if (data.type === "chat" && partner?.readyState === WebSocket.OPEN) {
      partner.send(JSON.stringify({ type: "chat", message: data.message }));
    } else if (data.type === "signal" && partner?.readyState === WebSocket.OPEN) {
      partner.send(JSON.stringify({ type: "signal", signal: data.signal }));
    }
  });

  ws.on("close", () => {
    const user = activeUsers.get(ws);
    const partner = user?.partner;

    if (partner?.readyState === WebSocket.OPEN) {
      partner.send(JSON.stringify({ type: "partner-disconnected" }));
      activeUsers.set(partner, { partner: null, state: "waiting" });
      waitingQueue.push(partner);
    }

    const i = waitingQueue.indexOf(ws);
    if (i !== -1) waitingQueue.splice(i, 1);

    activeUsers.delete(ws);
  });
});

// Optional: keep-alive ping
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.ping();
    }
  });
}, 30000);

server.listen(8080, "0.0.0.0", () => console.log("Server running on http://localhost:8080"));
