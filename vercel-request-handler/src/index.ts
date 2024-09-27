import express from "express";
import { S3 } from "aws-sdk";

const s3 = new S3({
   accessKeyId: "5744176aaad76b363ed1e9e3114185f8",
   secretAccessKey: "c8c50bf39a9c2ee215baa59cdd63a6a0f8c9cc3f8c1ea7b21f32f634c39098f3",
   endpoint: "https://bb0c57c71f8354f3704f109330344b1a.r2.cloudflarestorage.com"
})

const app = express();

app.get("/*", async (req, res) => {
    // id.100xdevs.com
    const host = req.hostname;

    const id = host.split(".")[0];
    const filePath = req.path;

    const contents = await s3.getObject({
        Bucket: "vercel",
        Key: `dist/${id}${filePath}`
    }).promise();
    
    const type = filePath.endsWith("html") ? "text/html" : filePath.endsWith("css") ? "text/css" : "application/javascript"
    res.set("Content-Type", type);

    res.send(contents.Body);
})

app.listen(3001);
