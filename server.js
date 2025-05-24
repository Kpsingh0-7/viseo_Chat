const WebSocket = require("ws");
const express = require("express");
const http = require("http");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const waitingQueue = [];
const activeUsers = new Map();

function tryToPair(ws) {
  console.log("tryToPair called, waitingQueue length:", waitingQueue.length);
  while (waitingQueue.length > 0) {
    const partner = waitingQueue.shift();
    if (partner.readyState !== WebSocket.OPEN) {
      console.log("Partner socket not open, skipping");
      continue;
    }

    activeUsers.set(ws, { partner, state: "paired" });
    activeUsers.set(partner, { partner: ws, state: "paired" });

    ws.send(JSON.stringify({ type: "paired" }));
    partner.send(JSON.stringify({ type: "paired" }));

    console.log("Paired two clients");
    return;
  }

  waitingQueue.push(ws);
  activeUsers.set(ws, { partner: null, state: "waiting" });
  console.log("Added client to waiting queue");
}

function handleNext(ws) {
  const user = activeUsers.get(ws);

  if (user?.partner) {
    const partner = user.partner;

    if (partner.readyState === WebSocket.OPEN) {
      partner.send(JSON.stringify({ type: "partner-disconnected" }));
      activeUsers.set(partner, { partner: null, state: "waiting" });
      waitingQueue.push(partner);
      console.log("Partner pushed back to waiting queue");
    }
  }

  activeUsers.set(ws, { partner: null, state: "waiting" });
  tryToPair(ws);
}

wss.on("connection", (ws) => {
  console.log("New client connected");
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
      console.log("Received 'next' from client");
      handleNext(ws);
    } else if (data.type === "chat" && partner?.readyState === WebSocket.OPEN) {
      partner.send(JSON.stringify({ type: "chat", message: data.message }));
    } else if (data.type === "signal" && partner?.readyState === WebSocket.OPEN) {
      partner.send(JSON.stringify({ type: "signal", signal: data.signal }));
    }
  });

  ws.on("close", () => {
    console.log("Client disconnected");
    const user = activeUsers.get(ws);
    const partner = user?.partner;

    if (partner?.readyState === WebSocket.OPEN) {
      partner.send(JSON.stringify({ type: "partner-disconnected" }));
      activeUsers.set(partner, { partner: null, state: "waiting" });
      waitingQueue.push(partner);
      console.log("Partner pushed back to waiting queue due to disconnect");
    }

    const i = waitingQueue.indexOf(ws);
    if (i !== -1) waitingQueue.splice(i, 1);

    activeUsers.delete(ws);
  });
});

// Optional keep-alive ping to keep connections alive behind proxies
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) ws.ping();
  });
}, 30000);

const PORT = 8080;
server.listen(PORT, () => console.log(`Server running on ws://localhost:${PORT}`));
