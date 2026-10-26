'use strict';
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('ghost', {
      id: { type: Sequelize.INTEGER,
