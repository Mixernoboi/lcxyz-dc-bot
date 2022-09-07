(async () => {
    const Cluster = require('discord-hybrid-sharding');
    const fs = require('fs');
    require('dotenv').config();
    const { MongoClient } = require('mongodb');
    const url = 'mongodb://localhost:27017';
    const dbclient = new MongoClient(url);
    await dbclient.connect();
    console.log('Connected successfully to server');
    const dbData = dbclient.db('discord-bot');
    const guilds_db = dbData.collection('guilds');
    const channels_db = dbData.collection('channels');
    const users_db = dbData.collection('users');
    const stat_pings_db = dbData.collection('stats_pings');
    const stat_leaderboard_db = dbData.collection('stat_leaderboard');
    const fetch = require('node-fetch');

    const manager = new Cluster.Manager(`${__dirname}/bot.js`, {
        totalShards: "auto", // or 'auto'
        /// Check below for more options
        shardsPerClusters: 1,
        // totalClusters: 7,
        mode: 'process', // you can also choose "worker"
        token: process.env.TOKEN,
    });

    manager.on('clusterCreate', cluster => console.log(`Launched Cluster ${cluster.id}`));
    manager.spawn({ timeout: -1 });
    manager.extend(
        new Cluster.HeartbeatManager({
            interval: 2000, // Interval to send a heartbeat
            maxMissedHeartbeats: 5, // Maximum amount of missed Heartbeats until Cluster will get respawned
        })
    );
    setInterval(async () => {
        try {
            const guilds = (await manager.fetchClientValues('guilds.cache.size')).reduce((prev, val) => prev + val, 0);
            const channels = (await manager.fetchClientValues('channels.cache.size')).reduce((prev, val) => prev + val, 0);
            const users = (await manager.fetchClientValues('users.cache.size')).reduce((prev, val) => prev + val, 0);
            console.log(`${guilds} servers, ${channels} channels, ${users} users`)
        } catch (e) {
            console.error(e);
        }
    }, 10000);
    //require('./http.js');

    const express = require('express'),
        app = express();
    app.set("view engine", "ejs"); // idk why, dont really need this tho lol

    app.listen(process.env.PORT, () => console.log(`Listening on port ${process.env.PORT}. http://localhost:${process.env.PORT}`));



    app.get("/getServerInfo/:id", async (req, res) => {
        try {
            const server = await guilds_db.findOne({ server_id: req.params.id });
            const channels = await channels_db.find({ server_id: req.params.id }).toArray();
            return res.json({
                success: true,
                data: {
                    server,
                    channels
                }
            })
        } catch (e) {
            console.error(e);
            return res.json({ success: false, error: e });
        }
    })
    function sliceIntoChunks(arr, chunkSize) {
        const res = [];
        for (let i = 0; i < arr.length; i += chunkSize) {
            const chunk = arr.slice(i, i + chunkSize);
            res.push(chunk);
        }
        return res;
    }

    var CronJob = require('cron').CronJob;
    var job = new CronJob(
        '*/20 * * * * *',
        async function () {
            const strt = Date.now();
            console.log('Updating channel counts. Might take while if many channels to update 💀');
            const channels = sliceIntoChunks(await stat_pings_db.find().toArray(), 50);
            for await (let i of channels) {
                const ids = [];
                for (let o of i) {
                    ids.push(o.channel_id);
                }
                const d = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=statistics,snippet&id=${ids.join(",")}&key=${process.env.YT_API_KEY}`).then(res => res.json())
                if (d?.items) {
                    for await (let b of d?.items) {
                        await stat_pings_db.findOneAndReplace({ channel_id: b.id }, {
                            "channel_id": b.id,
                            "stats": b.statistics,
                            "snippet": b.snippet,
                            "updateNumUTC": new Date(new Date().toUTCString()).getTime()
                        }, { upsert: true })
                    }
                }
            }
            console.log('Updating channel counts done 💀', "took", Date.now() - strt + "ms");
        },
        null,
        true,
        'Europe/Helsinki'
    );
})();