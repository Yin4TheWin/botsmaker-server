require('dotenv').config()
var express = require('express'),
router = express.Router();
const { Client } = require('discord.js');
const { createBot, runBot, verifyBot } = require('../utils/create');
const fs = require('fs')
const { exec } = require("child_process");
const stripe = require('stripe')(process.env.STRIPE_TEST_KEY);

router.post('/birth', async(req, res) => {
    //Reading body of POST request: get bot token, username, and desired project name
    const botToken = req.body.botToken
    const username = req.body.username //Firebase uid
    const projectName = req.body.projectName

    //Ensure fields aren't empty
    if(!(botToken&&username&&projectName))
        res.status(500).send({ error: 'Missing fields' })
    else{
        //If fields nonempty, first ensure customer has an active subscription on Stripe!
        const subscription = await stripe.subscriptions.search({
            query: 'status:\'active\' AND metadata[\'uid\']:\''+username+'\' AND metadata[\'projectName\']:\''+projectName+'\'',
        });
        console.log(subscription)
        if(subscription.data.length>0){
            //Attempt to login with provided bot token to check if valid (then immediately logout!)
            const client = new Client({ intents: [] });
            client.login(botToken).then(()=>{
                //Get client ID
                const clientId=client.user.id
                //Immediately logout!
                client.destroy()
                //Attempt to create new directory for your bot
                const create = createBot(clientId, botToken, username, projectName)
                create.on('close', (code)=>{
                    if(code==0){
                        //If successful, try to run the newly created bot!
                        const run = runBot(username, projectName)
                        run.on('close', (code, signal)=>{
                            console.log(code, signal)
                        })
                        res.json(req.body)
                    }
                    else 
                    //If unsuccessful, project probably already exists on our file system
                        res.status(500).send({ error: 'dir already exists' })
                })
            }).catch((err)=>{
                //Bot token provided was invalid
                console.log(err)
                client.destroy()
                res.status(500).send({ error: 'invalid token' })
            });
        } else {
            //If we can't find you in Stripe, you probably didn't pay :(
            res.status(500).send({ error: 'customer no pay' })
        }
    }
})

//Reactivate a bot with a paused subscription
router.post("/restart", (req, res)=>{
    const uid = req.body.uid
    const projName = req.body.name
    exec("pm2 start ~/bots/"+uid+"/"+projName+"server.js", (error, stdout, stderr) => {
        if (error) {
            console.log("err", stderr)
            return;
        }
        if (stderr) {
            console.log(stderr)
            return;
        }
    })
})

//UNUSED: Verify that bot token and project name are valid
router.post('/verify', (req, res)=>{
    const botToken = req.body.botToken
    const username = req.body.username
    const projectName = req.body.projectName
    //Ensure fields aren't empty
    if(!(botToken&&username&&projectName))
        res.status(400).send({ error: 'Missing fields' })
    const dest = "../bots/"+username+"/"+projectName
    const client = new Client({ intents: [] });
    client.login(botToken).then(()=>{
        //Immediately logout!
        client.destroy()
        if(fs.existsSync(dest))
            res.status(400).send("dir exists")
        else
            res.status(200).json(req.body)
    }).catch((err)=>{
        //Bot token provided was invalid
        console.log(err.message)
        client.destroy()
        res.status(400).send(err.message)
    });
})

module.exports = router