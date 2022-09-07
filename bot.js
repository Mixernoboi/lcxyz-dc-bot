(async () => {

    const Cluster = require('discord-hybrid-sharding');
    const Discord = require('discord.js');
    const fetch = require('node-fetch');
    const { Client, GatewayIntentBits, SlashCommandBuilder, Routes, EmbedBuilder, ActionRowBuilder, SelectMenuBuilder, PermissionsBitField, ButtonBuilder, ButtonStyle } = require('discord.js');
    const { REST } = require('@discordjs/rest');
    const fs = require('node:fs');
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
    const stats_pings_extra_info_db = dbData.collection('stats_pings_extra_info');
    const stat_leaderboard_db = dbData.collection('stat_leaderboard');


    require('dotenv').config();

    const client = new Discord.Client({
        // @ts-ignore | For Typescript use Cluster.Client.getInfo() instead of Cluster.data
        shards: Cluster.data.SHARD_LIST, // An array of shards that will get spawned
        shardCount: Cluster.data.TOTAL_SHARDS, // Total number of shards
        intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
    });
    const commands = [];
    const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));
    client.on("ready", async (bot) => {
        bot.user.setStatus("online");
        bot.user.setActivity({
            name: "statistics. showin' them nicely too.",
            type: "WATCHING",
        })

        const clientId = bot.user.id;
        for (const file of commandFiles) {
            const command = require(`./commands/${file}`);
            commands.push({
                ...command.data.toJSON(),
                code: command.code,
            });
        }
        const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
        console.log(`There is ${bot.guilds.cache.size} guilds.`);
        for await (let i of [...bot.guilds.cache]) {
            const guildId = i[0];
            try {
                console.log('Started refreshing application (/) commands for ' + guildId + '.');

                await rest.put(
                    Routes.applicationGuildCommands(clientId, guildId),
                    { body: commands },
                );

                console.log('Successfully reloaded application (/) commands for ' + guildId + '.');
            } catch (error) {
                console.error(error, guildId);
            }
        }




    })
    client.on("guildCreate", async guild => {
        try {
            const getServer = await guilds_db.findOne({ server_id: guild.id });
            if (!getServer) {
                await guilds_db.findOneAndReplace({ server_id: guild.id }, {
                    "server_id": guild.id,
                    "messages": 0,
                    "message": {
                        "channels": [],
                        "members": []
                    },
                    "settings": {
                        "adminRoles": [],
                        "private": false,
                        "stat_pings": true
                    },
                    "stat_pings": []
                }, { upsert: true })

            }
            const clientId = client.user.id;
            const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
            const guildId = guild.id
            try {
                console.log('Started refreshing application (/) commands for ' + guildId + '.');

                await rest.put(
                    Routes.applicationGuildCommands(clientId, guildId),
                    { body: commands },
                );

                console.log('Successfully reloaded application (/) commands for ' + guildId + '.');
            } catch (error) {
                console.error(error, guildId);
            }
        } catch (e) {
            console.error(e);
        }
    })
    client.on('interactionCreate', async interaction => {
        const commandCode = {
            "ping": async () => {
                await interaction.deferReply({ ephemeral: true });
                await interaction.editReply(`${interaction.client.ws.ping}ms`);
            },
            "me": async () => {
                await interaction.deferReply({ ephemeral: true });
                const user = interaction.user
                const getUserData = await users_db.findOne({ user_id: user.id });
                /*console.log({ user })
                if (!user?.banner) await user.fetch()
                console.log({ user })
                var banner = undefined;
                if (user?.bannerURL()) {
                    banner = user.bannerURL() + "?size=600"
                }*/
                const exampleEmbed = new EmbedBuilder()
                    .setColor(0x0099FF)
                    .setTitle(user.username + "#" + user.discriminator)
                    .setAuthor({ name: `For ${interaction.user.username}#${interaction.user.discriminator}`, iconURL: interaction.user.avatarURL() })
                    .setDescription('User information')
                    .setThumbnail(user.avatarURL())
                    .addFields(
                        { name: 'Total Messages', value: (getUserData?.messages ?? 0).toLocaleString("en-US") },
                        { name: 'Messages in this server', value: (getUserData?.guilds[getUserData?.guilds?.findIndex(a => a?.guild_id == interaction?.guildId)]?.messages ?? 0).toLocaleString("en-US") },
                    )
                    //.setImage(banner || `https://via.placeholder.com/600x240.png/${(user.hexAccentColor??"#000000").replace("#", "")}/${(user.hexAccentColor??"#000000").replace("#", "")}?text=%20`)
                    .setTimestamp()
                    .setFooter({ text: client.user.username, iconURL: client.user.avatarURL() });

                await interaction.editReply({ embeds: [exampleEmbed] });
            },
            "watch": async () => {
                await interaction.deferReply({ ephemeral: false });
                if (interaction.memberPermissions.has("ManageGuild") == false && interaction.memberPermissions.has("Administrator") == false && interaction.guild.ownerId != interaction.user.id) return await interaction.editReply(`You need to have MANAGE GUILD or ADMINISTRATOR permissions to do this command!`);
                const channelURL = interaction.options.getString('input');
                try {
                    let bannerYT = null;
                    //if(channelURL.includes("youtube.com")) {
                    bannerYT = await fetch(channelURL.replace("https://www.youtube.com/", "https://banner.yt/")).then(res => res.json()); // banner.yt chad site
                    /*} else {
                        bannerYT = {
                            channelId: channelURL // lol
                        }
                    }*/

                    if (!bannerYT.channelId) return await interaction.editReply(`Error getting channel data.`);
                    const getServer = await guilds_db.findOne({ server_id: interaction.guildId });
                    if (!getServer) return await interaction.editReply(`Error getting server data. Please setup the bot through the dashboard for the commands to work.`);
                    var total = 0;
                    for (let i of getServer.stat_pings) {
                        for (let o of i.channels) {
                            total++;
                        }
                    }
                    if (interaction.guildId == "711269136537485344") total = 0; // lcxyz/m.s discord
                    if (total >= 50) return await interaction.editReply(`You reached the limit (**50**).`);
                    const getStatPing = await stat_pings_db.findOne({ channel_id: bannerYT.channelId });
                    if (!getStatPing) {
                        await stat_pings_db.findOneAndReplace({ channel_id: bannerYT.channelId }, {
                            "channel_id": bannerYT.channelId,
                            "stats": {
                                "subscriberCount": "0",
                                "viewCount": "0",
                                "videoCount": "0"
                            },
                            "updateNumUTC": 0
                        }, { upsert: true });
                    }

                    const getChannelID = getServer.stat_pings.findIndex(a => a.channel_id == interaction.channelId);
                    if (getChannelID == -1) {
                        getServer.stat_pings.push({
                            "channel_id": interaction.channelId,
                            "channels": [
                                {
                                    "channel_id": bannerYT.channelId,
                                    "stats": {
                                        "subscriberCount": "0",
                                        "viewCount": "0",
                                        "videoCount": "0"
                                    }
                                }
                            ]
                        })
                    } else {
                        const getChannelCID = getServer.stat_pings[getChannelID].channels.findIndex(a => a.channel_id == bannerYT.channelId);
                        if (getChannelCID == -1) {
                            getServer.stat_pings[getChannelID].channels.push({
                                "channel_id": bannerYT.channelId,
                                "stats": {
                                    "subscriberCount": "0",
                                    "viewCount": "0",
                                    "videoCount": "0"
                                }
                            })
                        } else {
                            return await interaction.editReply(`Channel **${bannerYT.name}** is already being tracked!`);
                        }
                    }
                    await guilds_db.findOneAndReplace({ server_id: interaction.guildId }, getServer, { upsert: false });
                    return await interaction.editReply(`Channel **${bannerYT.name}** added. If you want to stop tracking, use the unwatch command! :)`);
                } catch (e) {
                    console.error(e);
                    return await interaction.editReply(`Error: ${e.message}`);
                }
            },
            "unwatch": async () => {
                await interaction.deferReply({ ephemeral: false });
                if (interaction.memberPermissions.has("ManageGuild") == false && interaction.memberPermissions.has("Administrator") == false && interaction.guild.ownerId != interaction.user.id) return await interaction.editReply(`You need to have MANAGE GUILD or ADMINISTRATOR permissions to do this command!`);
                const channelURL = interaction.options.getString('input');
                try {
                    let bannerYT = null;
                    //if(channelURL.includes("youtube.com")) {
                    bannerYT = await fetch(channelURL.replace("https://www.youtube.com/", "https://banner.yt/")).then(res => res.json());
                    /*} else {
                        bannerYT = {
                            channelId: channelURL // lol
                        }
                    }*/

                    if (!bannerYT.channelId) return await interaction.editReply(`Error getting channel data.`);
                    const getServer = await guilds_db.findOne({ server_id: interaction.guildId });
                    if (!getServer) return await interaction.editReply(`Error getting server data. Please setup the bot through the dashboard for the commands to work.`);

                    /*const getStatPing = await stat_pings_db.findOne({ channel_id: bannerYT.channelId });
                    if (!getStatPing) {
                        await stat_pings_db.findOneAndReplace({ channel_id: bannerYT.channelId }, {
                            "channel_id": bannerYT.channelId,
                            "stats": {
                                "subscriberCount": "0",
                                "viewCount": "0",
                                "videoCount": "0"
                            },
                            "updateNumUTC": 0
                        }, { upsert: true });
                    }*/

                    const getChannelID = getServer.stat_pings.findIndex(a => a.channel_id == interaction.channelId);
                    if (getChannelID == -1) {
                        return await interaction.editReply(`Channel **${bannerYT.name}** is not being currently tracked. Did you maybe mean **watch** instead of **unwatch**?`);
                        /*getServer.stat_pings.push({
                            "channel_id": interaction.channelId,
                            "channels": [
                                {
                                    "channel_id": bannerYT.channelId,
                                    "stats": {
                                        "subscriberCount": "0",
                                        "viewCount": "0",
                                        "videoCount": "0"
                                    }
                                }
                            ]
                        })*/
                    } else {
                        const getChannelCID = getServer.stat_pings[getChannelID].channels.findIndex(a => a.channel_id == bannerYT.channelId);
                        if (getChannelCID == -1) {
                            return await interaction.editReply(`Channel **${bannerYT.name}** is not being currently tracked. Did you maybe mean **watch** instead of **unwatch**?`);
                            /*getServer.stat_pings[getChannelID].channels.push({
                                "channel_id": bannerYT.channelId,
                                "stats": {
                                    "subscriberCount": "0",
                                    "viewCount": "0",
                                    "videoCount": "0"
                                }
                            })*/
                        } else {
                            //HERE
                            getServer.stat_pings[getChannelID].channels.splice(getChannelCID, 1);
                        }
                    }
                    await guilds_db.findOneAndReplace({ server_id: interaction.guildId }, getServer, { upsert: false });
                    return await interaction.editReply(`Channel **${bannerYT.name}** has stopped being tracked!`);
                } catch (e) {
                    console.error(e);
                    return await interaction.editReply(`Error: ${e.message}`);
                }
            },
            "channels": async () => {
                await interaction.deferReply({ ephemeral: true });
                if (interaction.memberPermissions.has("ManageGuild") == false && interaction.memberPermissions.has("Administrator") == false && interaction.guild.ownerId != interaction.user.id) return await interaction.editReply(`You need to have MANAGE GUILD or ADMINISTRATOR permissions to do this command!`);
                try {
                    const getServer = await guilds_db.findOne({ server_id: interaction.guildId });
                    if (!getServer) return await interaction.editReply(`Error getting server data. Please setup the bot through the dashboard for the commands to work.`);

                    const getChannelID = getServer.stat_pings.findIndex(a => a.channel_id == interaction.channelId);
                    if (getChannelID == -1) return await interaction.editReply(`No channels found.`);
                    var channels = [];
                    getServer.stat_pings[getChannelID].channels.sort((a, b) => parseInt(b.stats.subscriberCount) - parseInt(a.stats.subscriberCount))
                    var num = 0;
                    for (let i of getServer.stat_pings[getChannelID].channels) {
                        num++;
                        channels.push(`**${num}.** ` + (i?.snippet?.title || i.channel_id).slice(0, 15) + ": " + `**${abbreviate(i.stats.subscriberCount)}**`);
                    }
                    channels.push("\nTOTAL CHANNELS: " + `**${getServer.stat_pings[getChannelID].channels.length}**`);
                    return await interaction.editReply(`***Here are all of the channels!***\n${channels.join('\n')}`);
                } catch (e) {
                    console.error(e);
                    return await interaction.editReply(`Error: ${e.message}`);
                }
            }
        }
        //await interaction.editReply()
        /* CUZ I FORGOR 👍
        const string = interaction.options.getString('input');
    const integer = interaction.options.getInteger('int');
    const boolean = interaction.options.getBoolean('choice');
    const user = interaction.options.getUser('target');
    const member = interaction.options.getMember('target');
    const channel = interaction.options.getChannel('destination');
    const role = interaction.options.getRole('muted');
    const number = interaction.options.getNumber('num');
    const mentionable = interaction.options.getMentionable('mentionable');
    const attachment = interaction.options.getAttachment('attachment');
    
    
        .addStringOption(option => option.setName('input').setDescription('Enter a string'))
        .addIntegerOption(option => option.setName('int').setDescription('Enter an integer'))
        .addBooleanOption(option => option.setName('choice').setDescription('Select a boolean'))
        .addUserOption(option => option.setName('target').setDescription('Select a user'))
        .addChannelOption(option => option.setName('destination').setDescription('Select a channel'))
        .addRoleOption(option => option.setName('muted').setDescription('Select a role'))
        .addNumberOption(option => option.setName('num').setDescription('Enter a number'))
        .addMentionableOption(option => option.setName('mentionable').setDescription('Mention something'))
        .addAttachmentOption(option => option.setName('attachment').setDescription('Attach something'));
        */
        if (!interaction.isChatInputCommand()) return;
        for (let i of commands) {
            if (interaction.commandName == i.name) {
                try {
                    commandCode[i.name](interaction);
                } catch (e) {
                    console.error(e);
                }
                break;
            }
        }
        return;
    });
    client.on('interactionCreate', async interaction => {
        if (!interaction.isSelectMenu()) return;
        console.log(interaction);
        if (interaction.customId === 'select') {
            await interaction.update({ content: 'Something was selected!', components: [] });
        }
    });
    /*
    */
    var queue = require('queue')
    var messageQueue = queue({ results: [] })
    messageQueue.timeout = 1000;
    client.on("messageCreate", async message => {
        //console.log(`author: ${message.author.id}, channel: ${message.channelId}, guild: ${message.guildId}`)
        if (!message?.guildId) return;
        messageQueue.push(async function (cb) {
            try {
                let guild = await guilds_db.findOne({ server_id: message.guildId });
                if (guild) {
                    guild.messages += 1;
                    const fcnl = guild.message.channels.findIndex(a => a.channel_id == message.channelId);
                    const fmbr = guild.message.members.findIndex(a => a.user_id == message.author.id);
                    if (fcnl != -1) {
                        guild.message.channels[fcnl].messages += 1;
                    } else guild.message.channels.push({
                        channel_id: message.channelId,
                        messages: 1
                    })
                    if (fmbr != -1) {
                        guild.message.members[fmbr].messages += 1;
                    } else guild.message.members.push({
                        user_id: message.author.id,
                        messages: 1
                    })

                    await guilds_db.findOneAndReplace({ server_id: message.guildId }, guild);
                } else {
                    await guilds_db.findOneAndReplace({ server_id: message.guildId }, {
                        "server_id": message.guildId,
                        "messages": 0,
                        "message": {
                            "channels": [],
                            "members": []
                        },
                        "settings": {
                            "adminRoles": [],
                            "private": false,
                            "stat_pings": false
                        },
                        "stat_pings": []
                    }, {
                        upsert: true
                    });
                }
                let channel = await channels_db.findOne({ channel_id: message.channelId });
                if (channel) {
                    channel.messages += 1;
                    const fmbr = channel.message.members.findIndex(a => a.user_id == message.author.id);
                    if (fmbr != -1) {
                        channel.message.members[fmbr].messages += 1;
                    } else channel.message.members.push({
                        user_id: message.author.id,
                        messages: 1
                    })

                    await channels_db.findOneAndReplace({ channel_id: message.channelId }, channel);
                } else {
                    await channels_db.findOneAndReplace({ channel_id: message.channelId }, {
                        "channel_id": message.channelId,
                        "messages": 0,
                        "message": {
                            "members": []
                        },
                        "guild_id": message.guildId
                    }, {
                        upsert: true
                    });
                }
                let user = await users_db.findOne({ user_id: message.author.id });
                if (user) {
                    user.messages += 1;
                    const fcnl = user.guilds.findIndex(a => a.guild_id == message.guildId);
                    if (fcnl != -1) {
                        user.guilds[fcnl].messages += 1;
                        const fmbr = user.guilds[fcnl].channels.findIndex(a => a.channel_id == message.channelId);
                        if (fmbr != -1) {
                            user.guilds[fcnl].channels[fmbr].messages += 1;
                        } else user.guilds[fcnl].channels.push({
                            channel_id: message.channelId,
                            messages: 1
                        })
                    } else user.guilds.push({
                        guild_id: message.guildId,
                        messages: 1,
                        channels: [
                            {
                                channel_id: message.channelId,
                                messages: 1
                            }
                        ]
                    })

                    await users_db.findOneAndReplace({ user_id: message.author.id }, user);
                } else {
                    await users_db.findOneAndReplace({ user_id: message.author.id }, {
                        "user_id": message.author.id,
                        "messages": 0,
                        "guilds": []
                    }, {
                        upsert: true
                    });
                }


            } catch (e) {
                console.error(e);
            }
            cb(null, `author: ${message.author.id}, channel: ${message.channelId}, guild: ${message.guildId}`)
        })
    })
    messageQueue.on('timeout', function (next, job) {
        console.log('job timed out:', job.toString().replace(/\n/g, ''))
        next()
    })
    // get notified when jobs complete
    messageQueue.on('success', function (result, job) {
        //console.log('job finished processing:', job.toString().replace(/\n/g, ''))
        //console.log('The result is:', result)
    })

    // begin processing, get notified on end / failure
    messageQueue.start(function (err) {
        if (err) throw err
        //console.log('all done:', messageQueue.results)
    })
    setInterval(() => {
        if (messageQueue.length > 0) {
            // begin processing, get notified on end / failure
            messageQueue.start(function (err) {
                if (err) throw err
                //console.log('all done:', messageQueue.results)
            })

        }
    }, 500);
    function abbreviate(count, withAbbr = true, decimals = 2) {
        count = Number(count);

        var neg = false;
        if (String(count)[0] == "-") {
            neg = true;
            count = ~Number(count) + 1;
        }

        const COUNT_ABBRS = ['', 'K', 'M', 'B'];
        const i = 0 === count ? count : Math.floor(Math.log(count) / Math.log(1000));
        let result = parseFloat((count / Math.pow(1000, i)).toFixed(decimals));
        if (withAbbr) result += `${COUNT_ABBRS[i]}`;
        if (neg) result = `-${result}`
        return result;
    }
    var CronJob = require('cron').CronJob;
    var job = new CronJob(
        '*/10 * * * * *',
        async function () {
            console.log("checking for stat pings!")
            var statPinging = queue({ results: [] })
            statPinging.timeout = 1000;
            const servers = [];
            client.guilds.cache.forEach(guild => {
                servers.push(guild.id);
            });
            var data = [];
            var channelids = [];
            for await (let i of servers) {
                const d = await guilds_db.findOne({ server_id: i });
                for (let o of d.stat_pings) {
                    data.push(o);
                    for (let b of o.channels) {
                        channelids.push({ ...b, dc_channel_id: o.channel_id, server_id: i });
                    }
                };
            }
            var cnld = [];
            for await (let i of channelids) {
                if (cnld.findIndex(a => a.channel_id == i.channel_id) == -1) {
                    const qdsw = await stat_pings_db.findOne({ channel_id: i.channel_id });
                    if (qdsw?._id) cnld.push(qdsw);
                }

            }
            for await (let i of channelids) {
                // console.log(i);
                var fresh = cnld[cnld.findIndex(a => a.channel_id == i.channel_id)];
                if (fresh?.stats?.subscriberCount != undefined) {
                    //console.log(i.channel_id, "yes", fresh);
                    if (fresh.stats.subscriberCount != i.stats.subscriberCount) {
                        try {
                            const fresh2 = fresh;
                            const d = await guilds_db.findOne({ server_id: i.server_id })
                            const indx = d.stat_pings.findIndex(a => a.channel_id == i.dc_channel_id);
                            var dte = 0;
                            if (indx != -1) {
                                const findChannel = d.stat_pings[indx].channels.findIndex(a => a.channel_id == i.channel_id);
                                if (findChannel != -1) {
                                    //console.log(d.stat_pings[indx].channels[findChannel]);
                                    //console.log({ fresh });
                                    if (!d?.stat_pings?.[indx]?.channels?.[findChannel]?.date) d.stat_pings[indx].channels[findChannel].date = Date.now();
                                    dte = d.stat_pings[indx].channels[findChannel].date;
                                    d.stat_pings[indx].channels[findChannel].stats = fresh2.stats;
                                    if (!d.stat_pings[indx].channels[findChannel].chart) d.stat_pings[indx].channels[findChannel].chart = {
                                        x: [],
                                        y: [],
                                        xy: []
                                    };
                                    d.stat_pings[indx].channels[findChannel].chart.x.push(Date.now())
                                    d.stat_pings[indx].channels[findChannel].chart.y.push(fresh2.stats.subscriberCount)
                                    d.stat_pings[indx].channels[findChannel].chart.xy.push([Date.now(), fresh2.stats.subscriberCount])

                                    d.stat_pings[indx].channels[findChannel].snippet = fresh2.snippet;
                                    d.stat_pings[indx].channels[findChannel].date = Date.now();
                                }
                            }
                            await guilds_db.findOneAndReplace({ server_id: i.server_id }, d, { upsert: false });
                            var dif = Date.now() - dte; // bad code lmao
                            var weeks = Math.floor((dif / 1000) / (86400 * 7))
                            var days = Math.floor(((dif - Math.floor((weeks * 1000) * (86400 * 7))) / 1000) / (86400))
                            var hours = Math.floor((((dif - Math.floor((days * 1000) * (86400 * 1))) - Math.floor((weeks * 1000) * (86400 * 7))) / 1000) / (86400 / 24))
                            var minutes = Math.floor(((((dif - Math.floor((hours * 1000) * (86400 / 24))) - Math.floor((days * 1000) * (86400 * 1))) - Math.floor((weeks * 1000) * (86400 * 7))) / 1000) / ((86400 / 24) / 60))
                            var seconds = Math.floor((((((dif - Math.floor((minutes * 1000) * (86400 / (24 * 60)))) - Math.floor((hours * 1000) * (86400 / 24))) - Math.floor((days * 1000) * (86400 * 1))) - Math.floor((weeks * 1000) * (86400 * 7))) / 1000) / ((86400 / 24) / (60 * 60)))

                            const exampleEmbed = new EmbedBuilder()
                                .setColor(0x0099FF)
                                .setTitle(("A new api update for " + fresh2.snippet.title).slice(0, 255))
                                .setThumbnail(fresh2?.snippet?.thumbnails.default.url.replace("s88", "s200"))
                                .addFields(
                                    { name: 'Old API Count', value: `${abbreviate(i.stats.subscriberCount)}`, inline: true },
                                    { name: 'New API Count', value: `${abbreviate(fresh2.stats.subscriberCount)}`, inline: true },
                                    { name: 'Time', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false },
                                    {
                                        name: 'How Long', value: `${weeks == 0 ? "" : `${weeks} weeks, `}${days == 0 ? "" : `${days} days, `}${hours == 0 ? "" : `${hours} hours, `}${minutes == 0 ? "" : `${minutes} minutes, `}${`${seconds} seconds`}
                                    `, inline: false
                                    },
                                )
                                .setTimestamp()
                                .setFooter({ text: client.user.username, iconURL: client.user.avatarURL() });
                            const row = new ActionRowBuilder()
                                .addComponents(
                                    new ButtonBuilder()
                                        .setCustomId('extrainfo')
                                        .setLabel('Extra Info')
                                        .setStyle(ButtonStyle.Success),
                                );
                            try {
                                await client.channels.cache.get(i.dc_channel_id).send({ embeds: [exampleEmbed], components: [row] });
                            } catch (er) {
                                console.error(er, i.dc_channel_id, i.server_id);
                            }
                        } catch (e) {
                            console.error(e);
                        }
                    }
                }

            }
        },
        null,
        true,
        'Europe/Helsinki' // my timezone
    );
    var job2 = new CronJob(
        '* 1 * * * *',
        async function () {

            console.log("updating stat leaderboard stuff! (joke)")
            return; // work in progress. code doesnt work lol
            var statLB = queue({ results: [] })
            statLB.timeout = 1000;
            const servers = [];
            client.guilds.cache.forEach(guild => {
                servers.push(guild.id);
            });
            var data = [];
            var channelids = [];
            for await (let i of servers) {
                const d = await guilds_db.findOne({ server_id: i });
                for (let o of d.stat_pings) {
                    data.push(o);
                    for (let b of o.channels) {
                        channelids.push({ ...b, dc_channel_id: o.channel_id, server_id: i });
                    }
                };
            }
            var cnld = [];
            for await (let i of channelids) {
                if (cnld.findIndex(a => a.channel_id == i.channel_id) == -1) {
                    const qdsw = await stat_pings_db.findOne({ channel_id: i.channel_id });
                    if (qdsw?._id) cnld.push(qdsw);
                }

            }
            for await (let i of channelids) {
                // console.log(i);
                var fresh = cnld[cnld.findIndex(a => a.channel_id == i.channel_id)];
                if (fresh?.stats?.subscriberCount != undefined) {
                    //console.log(i.channel_id, "yes", fresh);
                    if (fresh.stats.subscriberCount != i.stats.subscriberCount) {
                        try {
                            const fresh2 = fresh;
                            const d = await guilds_db.findOne({ server_id: i.server_id })
                            const indx = d.stat_pings.findIndex(a => a.channel_id == i.dc_channel_id);
                            var dte = 0;
                            if (indx != -1) {
                                const findChannel = d.stat_pings[indx].channels.findIndex(a => a.channel_id == i.channel_id);
                                if (findChannel != -1) {
                                    //console.log(d.stat_pings[indx].channels[findChannel]);
                                    //console.log({ fresh });
                                    if (!d?.stat_pings?.[indx]?.channels?.[findChannel]?.date) d.stat_pings[indx].channels[findChannel].date = Date.now();
                                    dte = d.stat_pings[indx].channels[findChannel].date;
                                    d.stat_pings[indx].channels[findChannel].stats = fresh2.stats;
                                    d.stat_pings[indx].channels[findChannel].date = Date.now();
                                }
                            }
                            await guilds_db.findOneAndReplace({ server_id: i.server_id }, d, { upsert: false });
                            var dif = Date.now() - dte;
                            var weeks = Math.floor((dif / 1000) / (86400 * 7))
                            var days = Math.floor(((dif - Math.floor((weeks * 1000) * (86400 * 7))) / 1000) / (86400))
                            var hours = Math.floor((((dif - Math.floor((days * 1000) * (86400 * 1))) - Math.floor((weeks * 1000) * (86400 * 7))) / 1000) / (86400 / 24))
                            var minutes = Math.floor(((((dif - Math.floor((hours * 1000) * (86400 / 24))) - Math.floor((days * 1000) * (86400 * 1))) - Math.floor((weeks * 1000) * (86400 * 7))) / 1000) / ((86400 / 24) / 60))
                            var seconds = Math.floor((((((dif - Math.floor((minutes * 1000) * (86400 / (24 * 60)))) - Math.floor((hours * 1000) * (86400 / 24))) - Math.floor((days * 1000) * (86400 * 1))) - Math.floor((weeks * 1000) * (86400 * 7))) / 1000) / ((86400 / 24) / (60 * 60)))

                            const exampleEmbed = new EmbedBuilder()
                                .setColor(0x0099FF)
                                .setTitle(("A new api update for " + fresh2.snippet.title).slice(0, 255))
                                .setThumbnail(fresh2?.snippet?.thumbnails.default.url.replace("s88", "s200"))
                                .addFields(
                                    { name: 'Old API Count', value: `${abbreviate(i.stats.subscriberCount)}`, inline: true },
                                    { name: 'New API Count', value: `${abbreviate(fresh2.stats.subscriberCount)}`, inline: true },
                                    { name: 'Time', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false },
                                    {
                                        name: 'How Long', value: `${weeks == 0 ? "" : `${weeks} weeks, `}${days == 0 ? "" : `${days} days, `}${hours == 0 ? "" : `${hours} hours, `}${minutes == 0 ? "" : `${minutes} minutes, `}${`${seconds} seconds`}
                                    `, inline: false
                                    },
                                )
                                .setTimestamp()
                                .setFooter({ text: client.user.username, iconURL: client.user.avatarURL() });
                            try {
                                await client.channels.cache.get(i.dc_channel_id).send({ embeds: [exampleEmbed] });
                            } catch (er) {
                                console.error(er, i.dc_channel_id, i.server_id);
                            }
                        } catch (e) {
                            console.error(e);
                        }
                    }
                }

            }
        },
        null,
        true,
        'Europe/Helsinki'
    );



    client.cluster = new Cluster.Client(client); // initialize the Client, so we access the .broadcastEval()
    client.login(process.env.TOKEN);

})();