'use strict';
module.exports = {
  async up(queryInterface) {
    await queryInterface.dropTable('posts');
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.createTable('posts', { id: { type: Sequelize.UUID } });
  },
};
