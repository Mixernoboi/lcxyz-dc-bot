const { SlashCommandBuilder } = require('discord.js');
module.exports = {
    data: new SlashCommandBuilder()
        .setName('watch')
        .setDescription('Add a channel to get tracked and get sent a message here!')
        .addStringOption(option => option.setName('input').setDescription('YouTube Channel URL'))
};