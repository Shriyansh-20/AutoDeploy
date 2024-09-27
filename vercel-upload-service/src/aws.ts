import { S3 } from "aws-sdk";
import fs from "fs";

const s3 = new S3({
   accessKeyId: "5744176aaad76b363ed1e9e3114185f8",
   secretAccessKey: "c8c50bf39a9c2ee215baa59cdd63a6a0f8c9cc3f8c1ea7b21f32f634c39098f3",
   endpoint: "https://bb0c57c71f8354f3704f109330344b1a.r2.cloudflarestorage.com"
})


export const uploadFile = async (fileName: string, localFilePath: string) => {
    const fileContent = fs.readFileSync(localFilePath);
    const response = await s3.upload({
        Body: fileContent,
        Bucket: "vercel",
        Key: fileName,
    }).promise();
    console.log(response);
}
