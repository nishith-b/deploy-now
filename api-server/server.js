const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { generateSlug } = require("random-word-slugs");
const { createClient } = require("redis");
const { ECSClient, RunTaskCommand } = require("@aws-sdk/client-ecs");
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: "*" });
require("dotenv").config();

// Redis client for subscribing
const subscriber = createClient({
  username: process.env.REDIS_USERNAME,
  password: process.env.REDIS_PASSWORD,
  socket: {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
  },
});

async function createConnection() {
  await subscriber.connect();
  subscriber.on("error", (err) => console.log("Redis Client Error", err));
  console.log("Connected to Redis for subscription ✅");
}

createConnection();

const ecsClient = new ECSClient({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_KEY,
  },
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.post("/project", async (req, res) => {
  const { gitURL } = req.body;
  const projectSlug = generateSlug();
  const command = new RunTaskCommand({
    cluster: process.env.AWS_CLUSTER,
    taskDefinition: process.env.AWS_TASK,
    launchType: "FARGATE",
    count: 1,
    networkConfiguration: {
      awsvpcConfiguration: {
        assignPublicIp: "ENABLED",
        subnets: [
          "subnet-09b44cf0e90719318",
          "subnet-0040ed22fb153c2e0",
          "subnet-0e5c5210cdd0dbbb4",
        ],
        securityGroups: ["sg-0127b14ad3211c408"],
      },
    },
    overrides: {
      containerOverrides: [
        {
          name: "builder-image",
          environment: [
            { name: "GIT_REPOSITORY_URL", value: gitURL },
            { name: "PROJECT_ID", value: projectSlug },
            { name: "REDIS_USERNAME", value: process.env.REDIS_USERNAME },
            { name: "REDIS_PASSWORD", value: process.env.REDIS_PASSWORD },
            { name: "REDIS_HOST", value: process.env.REDIS_HOST },
            { name: "REDIS_PORT", value: process.env.REDIS_PORT },
            { name: "AWS_REGION", value: process.env.AWS_REGION },
            { name: "AWS_SECRET_KEY", value: process.env.AWS_SECRET_KEY },
            { name: "AWS_ACCESS_KEY", value: process.env.AWS_ACCESS_KEY },
            { name: "AWS_S3_BUCKET", value: process.env.AWS_S3_BUCKET },
          ],
        },
      ],
    },
  });
  await ecsClient.send(command);
  return res.json({
    status: "Queued",
    data: { projectSlug, url: `http://${projectSlug}.localhost:8000` },
  });
});

// Subscribe to log channels and emit to Socket.IO
subscriber.pSubscribe("logs:*", (message, channel) => {
  console.log(`Received message from ${channel}:`, message);
  io.emit("log", { channel, message });
});

const PORT = process.env.PORT;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
