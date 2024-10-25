
import { createClient, commandOptions } from "redis";
import { copyFinalDist, downloadS3Folder } from "./aws";
import { buildProject } from "./utils";

const redisURL = 'redis://red-csdpvchu0jms73a7p5d0:6379';

const subscriber = createClient({ url: redisURL });
subscriber.connect();

const publisher = createClient({ url: redisURL });
publisher.connect();

async function main() {
    while(1) {
        const res = await subscriber.brPop(
            commandOptions({ isolated: true }),
            'build-queue',
            0
          );
        // @ts-ignore;
        const id = res.element
        
        await downloadS3Folder(`output/${id}`)
        await buildProject(id);
        copyFinalDist(id);
        publisher.hSet("status", id, "deployed")
    }
}
main();
