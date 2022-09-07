const { SlashCommandBuilder } = require('discord.js');
module.exports = {
    data: new SlashCommandBuilder()
        .setName('channels')
        .setDescription('See what channels are being tracked.')
};