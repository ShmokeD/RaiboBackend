import { Job } from '../models/notif.model.js';
import { PubSub } from '@google-cloud/pubsub';


const sendVerificationEmail = async function(user)
{
    const token = [...Array(32)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
    const values = {name: user.fullname, ctaLink: `${process.env.BACKEND_URL}/api/v1/auth/verify-email/${token}`,ctaText:"Click here"}
    await enqueJob([user._id],"verify-user-email", "email", values );
    return token;
}

const sendResetEmail = async function(user)
{
    const token = [...Array(32)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
    const values = {name: user.fullname, ctaLink: `${process.env.BACKEND_URL}/api/v1/auth/reset-password/${token}`}
    await enqueJob([user._id],"reset-password", "email", values );
    return token;
}

const enqueJob =  async function(recievers, task, channel,values){

    try{

    const projectId = process.env.GCLOUD_PROJECT_ID;
    const topicId = process.env.PUBSUB_TOPIC_ID;

    const pubsub = new PubSub({projectId});
    const job = new Job({
        recievers,
        channel,
        task,
        values
    });

    const savedJob = await job.save();
    const topic = pubsub.topic(topicId);

    const publishData = {jobId: savedJob._id.toString()};

    topic.publishMessage({data: Buffer.from(JSON.stringify(publishData))});
    console.log(`Job queued with ID: ${savedJob._id}`);

    }
    catch(error)
    {
        console.error("Error queuing job:", error);
    }
}

export {enqueJob , sendVerificationEmail, sendResetEmail};
