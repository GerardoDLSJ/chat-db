import express from "express";
import logger from "morgan";
import { createClient } from "@libsql/client";
import dotenv from "dotenv";
import { Server } from "socket.io";
import { createServer } from "node:http";

const port = process.env.PORT ?? 3000;
dotenv.config();
const app = express();
const server = createServer(app);
const io = new Server(server, {
  connectionStateRecovery: {
    timeout: 1000,
  },
});

const db = createClient({
  url: process.env.URL_DB,
  authToken: process.env.DB_TOKEN,
});

await db.execute(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT,
    user TEXT
  )
`);

io.on("connection", async (socket) => {
  console.log("a user has connected");

  socket.on("disconnect", () => {
    console.log("an user has disconnected");
  });

  socket.on("chat message", async (msg) => {
    let result;
    console.log(socket.handshake.auth);
    const username = socket.handshake.auth.username ?? "anonymous";
    console.log(username);
    try {
      result = await db.execute({
        sql: "INSERT INTO messages(content,user) VALUES (:msg, :user)",
        args: { msg, user: username },
      });
    } catch (error) {
      console.error(error);
      return;
    }
    io.emit("chat message", msg, result.lastInsertRowid.toString(), username);
  });

  if (!socket.recovered) {
    try {
      const results = await db.execute({
        sql: "SELECT id, content, user FROM messages WHERE id > ?",
        args: [socket.handshake.auth.serverOffset ?? 0],
      });

      results.rows.forEach((row) => {
        socket.emit("chat message", row.content, row.id.toString(), row.user);
      });
    } catch (error) {
      console.error(error);
      return;
    }
  }
});
// Configurar logger
app.use(logger("dev"));

app.get("/", (req, res) => {
  res.sendFile(process.cwd() + "/client/index.html");
});

server.listen(port, () => {
  console.log(`Servidor corriendo en el puerto ${port}`);
});
