// --- BACKEND: server.js ---

const WebSocket = require("ws");
const express = require("express");
const http = require("http");
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const waitingQueue = [];
const activeUsers = new Map(); // ws -> { partner, state }

function tryToPair(ws) {
  if (waitingQueue.length > 0) {
    const partner = waitingQueue.shift();

    activeUsers.set(ws, { partner, state: "paired" });
    activeUsers.set(partner, { partner: ws, state: "paired" });

    ws.send(JSON.stringify({ type: "paired" }));
    partner.send(JSON.stringify({ type: "paired" }));
  } else {
    waitingQueue.push(ws);
    activeUsers.set(ws, { partner: null, state: "waiting" });
  }
}

function handleNext(ws) {
  const user = activeUsers.get(ws);
  if (user?.partner) {
    const partner = user.partner;

    partner.send(JSON.stringify({ type: "partner-disconnected" }));
    activeUsers.set(partner, { partner: null, state: "waiting" });
    waitingQueue.push(partner);
  }

  activeUsers.set(ws, { partner: null, state: "waiting" });
  tryToPair(ws);
}

wss.on("connection", (ws) => {
  tryToPair(ws);

  ws.on("message", (msg) => {
    const data = JSON.parse(msg);

    if (data.type === "next") {
      handleNext(ws);
    } else if (data.type === "chat") {
      const user = activeUsers.get(ws);
      if (user?.partner) {
        user.partner.send(JSON.stringify({ type: "chat", message: data.message }));
      }
    } else if (data.type === "signal") {
      const user = activeUsers.get(ws);
      if (user?.partner) {
        user.partner.send(JSON.stringify({ type: "signal", signal: data.signal }));
      }
    }
  });

  ws.on("close", () => {
    const user = activeUsers.get(ws);
    if (user?.partner) {
      user.partner.send(JSON.stringify({ type: "partner-disconnected" }));
      activeUsers.set(user.partner, { partner: null, state: "waiting" });
      waitingQueue.push(user.partner);
    }

    const index = waitingQueue.indexOf(ws);
    if (index !== -1) waitingQueue.splice(index, 1);

    activeUsers.delete(ws);
  });
});

server.listen(8080, '0.0.0.0', () => console.log("Server running on http://localhost:8080"));
