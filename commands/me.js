const { SlashCommandBuilder } = require('discord.js');
module.exports = {
    data: new SlashCommandBuilder()
        .setName('me')
        .setDescription('See your stats, total messages and messages in this server sent by you.')
};