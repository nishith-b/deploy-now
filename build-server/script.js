const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");
const mime = require("mime-types");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { createClient } = require("redis");

const client = createClient({
  username: process.env.REDIS_USERNAME,
  password: process.env.REDIS_PASSWORD,
  socket: {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
  },
});

async function createConnection() {
  await client.connect();
  client.on("error", (err) => console.log("Redis Client Error", err));
  console.log(`Connected To Redis✅`);
}

createConnection();

//Logs are Pushed into Central Redis Server Via PublishLog Function
function publishLog(log) {
  client.publish(`logs:${PROJECT_ID}`, JSON.stringify({ log }));
}

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_KEY,
  },
});

const PROJECT_ID = process.env.PROJECT_ID;

async function init() {
  console.log("Excecuting script.js");
  publishLog("Build Started...");
  const outDirPath = path.join(__dirname, "output");

  const p = exec(`cd ${outDirPath} && npm install && npm run build`);

  p.stdout.on("data", function (data) {
    console.log(data.toString());
    publishLog(data.toString());
  });

  p.stderr.on("data", function (data) {
    console.log("stderr:", data.toString());
    publishLog(`stderr: ${data.toString()}`);
  });

  p.stdout.on("error", function (data) {
    console.log("Error", data.toString());
    publishLog(`Error: ${data.toString()}`);
  });

  p.on("close", async function () {
    console.log("Build Complete");
    publishLog(`Build Complete`);
    const distFolderPath = path.join(__dirname, "output", "dist");
    const distFolderContents = fs.readdirSync(distFolderPath, {
      recursive: true,
    });
    publishLog(`Starting to upload`);
    for (const file of distFolderContents) {
      const filePath = path.join(distFolderPath, file);
      if (fs.lstatSync(filePath).isDirectory()) continue;

      console.log("uploading", filePath);
      publishLog(`uploading ${file}`);
      const command = new PutObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET,
        Key: `_outputs/${PROJECT_ID}/${file}`,
        Body: fs.createReadStream(filePath),
        ContentType: mime.lookup(filePath),
      });
      await s3Client.send(command);
      publishLog(`uploaded ${file}`);
      console.log("uploaded", filePath);
    }
    publishLog(`Done....✅`);
    console.log("Done....✅");
    await client.quit();
    process.exit(0);
  });
}

init();
