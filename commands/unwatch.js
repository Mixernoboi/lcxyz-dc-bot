const { SlashCommandBuilder } = require('discord.js');
module.exports = {
    data: new SlashCommandBuilder()
        .setName('unwatch')
        .setDescription('Stops tracking a channel.')
        .addStringOption(option => option.setName('input').setDescription('YouTube Channel URL'))
};