const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "https://video-chat-82u9.onrender.com", methods: ["GET", "POST"] },
});

const PORT = 8080;

let waitingUser = null;
const activeCalls = new Map();

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("find-partner", () => {
    if (waitingUser && waitingUser !== socket.id) {
      const partner = waitingUser;
      waitingUser = null;

      activeCalls.set(socket.id, partner);
      activeCalls.set(partner, socket.id);

      // Tell the new user to wait for an offer
      io.to(socket.id).emit("waiting-offer", { from: partner });

      // Tell the waiting user to create an offer
      io.to(partner).emit("create-offer", { to: socket.id });
    } else {
      waitingUser = socket.id;
    }
  });

  socket.on("offer", ({ to, offer }) => {
    io.to(to).emit("offer", { from: socket.id, offer });
  });

  socket.on("answer", ({ to, answer }) => {
    io.to(to).emit("answer", { from: socket.id, answer });
  });

  socket.on("icecandidate", ({ to, candidate }) => {
    io.to(to).emit("icecandidate", candidate);
  });

  socket.on("chat-message", ({ to, message }) => {
    io.to(to).emit("chat-message", { from: socket.id, message });
  });

  socket.on("call-ended", (partnerId) => {
    activeCalls.delete(socket.id);
    activeCalls.delete(partnerId);
    io.to(partnerId).emit("call-ended");
  });

  socket.on("disconnect", () => {
    const partner = activeCalls.get(socket.id);
    if (partner) {
      activeCalls.delete(partner);
      io.to(partner).emit("user-left");
    }

    if (waitingUser === socket.id) {
      waitingUser = null;
    }

    activeCalls.delete(socket.id);
    console.log("User disconnected:", socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
